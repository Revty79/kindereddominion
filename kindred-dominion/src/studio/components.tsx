import { cloneElement, isValidElement, useId, useState } from "react";
import type {
  CardDefinition,
  GameState,
  Influence,
  Offset,
  Player,
  Position,
} from "../engine/types";
import type { ContentPack, Issue } from "../content/types";
import { currentPower, scoreGame } from "../engine/scoring";
import { coordinate, relative } from "../engine/game";
import { libraryOf, evolutionEdges } from "../content/validation";
import {
  describeAbility,
  describeCondition,
  describeNumber,
  describeTarget,
  MECHANICS,
} from "../engine/registry";
import { ScoreDetails } from "../ui/PowerDetails";
import { cardArtwork } from "../assets/references";
import CollectibleCard from "../ui/cards/CollectibleCard";
export const split = (s: string) => [
  ...new Set(
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <label className="studio-field" htmlFor={id}>
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as React.ReactElement<any>, {
            id,
            "aria-label": label,
          })
        : children}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </Field>
  );
}
export function Issues({ issues }: { issues: Issue[] }) {
  return (
    <div className="studio-issues" role="status">
      {issues.map((i, n) => (
        <p className={`issue-${i.severity}`} key={n}>
          <b>{i.severity}</b> · {i.path}: {i.message}
        </p>
      ))}
      {!issues.length && <p className="issue-info">Validation passed.</p>}
    </div>
  );
}
export function download(
  name: string,
  data: unknown,
  type = "application/json",
) {
  const blob = new Blob(
    [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
    { type },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function OffsetGrid({
  radius,
  player = 0,
  selected,
  onSelect,
  labels,
}: {
  radius: number;
  player?: Player;
  selected?: Offset[];
  onSelect?: (p: Offset) => void;
  labels?: (p: Offset) => string;
}) {
  const width = radius * 2 + 1;
  return (
    <div className="offset-scroll">
      <div
        className="offset-grid"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(38px,1fr))` }}
        aria-label={`Pattern facing ${player === 0 ? "right" : "left"}`}
      >
        {Array.from({ length: width * width }, (_, i) => {
          const x = ((i % width) - radius) * (player === 0 ? 1 : -1),
            y = Math.floor(i / width) - radius;
          const p = { x, y };
          const text = labels?.(p) ?? "";
          const active = selected?.some((o) => o.x === x && o.y === y);
          return (
            <button
              type="button"
              key={i}
              className={`${x === 0 && y === 0 ? "origin" : ""} ${active ? "selected" : ""} ${text ? "has-effect" : ""}`}
              aria-pressed={active}
              aria-label={`Offset ${x}, ${y}${x === 0 && y === 0 ? ", source" : ""}${text ? `, ${text}` : ""}`}
              title={`${x} forward, ${y} down. ${text}`}
              onClick={() => onSelect?.(p)}
              disabled={!onSelect}
            >
              {text || (x === 0 && y === 0 ? "◆" : "·")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function PatternPicker({
  offsets,
  onChange,
}: {
  offsets: Offset[];
  onChange: (o: Offset[]) => void;
}) {
  const [radius, setRadius] = useState(
    Math.max(2, ...offsets.flatMap((o) => [Math.abs(o.x), Math.abs(o.y)])),
  );
  return (
    <div>
      <NumberField
        label="Target editing radius"
        min={1}
        max={20}
        value={radius}
        onChange={(n) => setRadius(Math.max(1, Math.min(20, n)))}
      />
      <OffsetGrid
        radius={radius}
        selected={offsets}
        onSelect={(p) =>
          onChange(
            offsets.some((o) => o.x === p.x && o.y === p.y)
              ? offsets.filter((o) => o.x !== p.x || o.y !== p.y)
              : [...offsets, p],
          )
        }
      />
      <small>
        Click positions to include/exclude. Positive x faces the opponent;
        positive y points down. {offsets.length} selected.
      </small>
    </div>
  );
}
export function InfluenceEditor({
  value,
  onChange,
}: {
  value: Influence[];
  onChange: (v: Influence[]) => void;
}) {
  const [radius, setRadius] = useState(
    Math.max(2, ...value.flatMap((o) => [Math.abs(o.x), Math.abs(o.y)])),
  );
  const [selected, setSelected] = useState<Offset>({ x: 1, y: 0 });
  const [player, setPlayer] = useState<Player>(0);
  const describe = (p: Offset) =>
    value
      .filter((e) => e.x === p.x && e.y === p.y)
      .map(
        (e) =>
          `${e.mechanic === "fortification" ? "F" : e.mechanic === "overthrow" ? "O" : "E"}${e.amount}`,
      )
      .join(" ");
  const change = (mechanic: Influence["mechanic"], amount: number) =>
    onChange([
      ...value.filter(
        (e) =>
          !(
            e.x === selected.x &&
            e.y === selected.y &&
            e.mechanic === mechanic
          ),
      ),
      ...(amount > 0 ? [{ ...selected, mechanic, amount }] : []),
    ]);
  return (
    <section className="studio-subpanel">
      <h3>Territorial influence</h3>
      <p>
        Each compatible mechanic is a separate ordered contribution. Expansion
        also reinforces friendly placement tokens. Overthrow captures enemy
        territory only.
      </p>
      <div className="studio-grid two">
        <NumberField
          label="Influence editing radius"
          min={1}
          max={20}
          value={radius}
          onChange={(n) => setRadius(Math.max(1, Math.min(20, n)))}
        />
        <Field label="Orientation preview">
          <select
            value={player}
            onChange={(e) => setPlayer(Number(e.target.value) as Player)}
          >
            <option value={0}>Player One · faces right</option>
            <option value={1}>Player Two · faces left</option>
          </select>
        </Field>
      </div>
      <OffsetGrid
        radius={radius}
        player={player}
        labels={describe}
        selected={[selected]}
        onSelect={setSelected}
      />
      <div className="studio-legend">
        <span>E · Expansion / placement-token contribution</span>
        <span>F · Fortification</span>
        <span>O · Overthrow</span>
        <span>◆ · Source</span>
      </div>
      <h4>
        Selected offset: {selected.x} forward, {selected.y} down
      </h4>
      <div className="studio-grid three">
        {Object.entries(MECHANICS).map(([id, name]) => (
          <NumberField
            key={id}
            label={name}
            min={0}
            max={100}
            value={
              value.find(
                (e) =>
                  e.x === selected.x && e.y === selected.y && e.mechanic === id,
              )?.amount ?? 0
            }
            onChange={(amount) => change(id as Influence["mechanic"], amount)}
          />
        ))}
      </div>
      <small>
        Zero removes this mechanic. Out-of-bounds targets are ignored during
        play. P2 mirrors only the horizontal coordinate.
      </small>
      <ol className="influence-order">
        {value.map((e, i) => (
          <li key={`${e.x}/${e.y}/${e.mechanic}`}>
            <span>
              {i + 1}. {e.mechanic} {e.amount} at ({e.x}, {e.y})
            </span>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const n = value.slice();
                [n[i - 1], n[i]] = [n[i], n[i - 1]];
                onChange(n);
              }}
            >
              Earlier
            </button>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => i !== j))}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function CardPreview({
  card,
  content,
  artwork,
}: {
  card: CardDefinition;
  content: ContentPack;
  artwork?: string;
}) {
  const color =
    content.collections.find((c) => c.id === card.kindred)?.color ?? "#a7bcac";
  const illustration = artwork || cardArtwork(content, card.id);
  const radius = Math.max(
    1,
    ...card.influence.flatMap((e) => [Math.abs(e.x), Math.abs(e.y)]),
  );
  return (
    <section className="studio-card-preview" style={{ borderColor: color }}>
      <CollectibleCard card={card} library={libraryOf(content)} artwork={illustration} scale="inspection"/>
      <details open>
        <summary>Executable influence · both orientations</summary>
        {([0, 1] as const).map((player) => (
          <div key={player}>
            <small>
              Player {player + 1} ·{" "}
              {player === 0 ? "faces right" : "faces left"}
            </small>
            <OffsetGrid
              radius={Math.min(20, radius)}
              player={player}
              labels={(p) =>
                card.influence
                  .filter((e) => e.x === p.x && e.y === p.y)
                  .map((e) => `${e.mechanic[0].toUpperCase()}${e.amount}`)
                  .join(" ")
              }
            />
          </div>
        ))}
      </details>
      {(card.continuous ?? []).map((a) => (
        <p key={a.id}>
          <b>Continuous:</b>{" "}
          {a.kind === "power"
            ? describeNumber(a.amount)
            : `${a.protection} protection`}{" "}
          to {describeTarget(a.target)}
          {a.condition ? ` if ${describeCondition(a.condition)}` : ""}. Requires
          this source to remain on the battlefield.
        </p>
      ))}
      {(card.scaling ?? []).map((a) => (
        <p key={a.id}>
          <b>Dynamic power:</b> {describeNumber(a.amount)}
          {a.condition ? ` if ${describeCondition(a.condition)}` : ""}.
        </p>
      ))}
      {(card.scoring ?? []).map((a) => (
        <p key={a.id}>
          <b>Scoring:</b> {describeNumber(a.amount)} bonus points; {a.when}
          {a.condition ? ` if ${describeCondition(a.condition)}` : ""}.
        </p>
      ))}
      {card.abilities.map((a) => (
        <div className="preview-ability" key={a.id}>
          <p>{describeAbility(a)}</p>
          {a.effects.map((e, i) =>
            "target" in e &&
            typeof e.target === "object" &&
            e.target.kind === "pattern" ? (
              <div key={i}>
                <small>Ability target pattern · {e.type}</small>
                <OffsetGrid
                  radius={Math.max(
                    1,
                    ...(e.target.offsets ?? []).flatMap((o) => [
                      Math.abs(o.x),
                      Math.abs(o.y),
                    ]),
                  )}
                  selected={e.target.offsets}
                />
              </div>
            ) : null,
          )}
        </div>
      ))}
      <p className="supplementary">
        <b>Supplementary text (does not define mechanics):</b> {card.text}
      </p>
    </section>
  );
}
export function BoardView({
  state,
  content,
  onCell,
  selected,
  artwork,
}: {
  state: GameState;
  content: ContentPack;
  onCell?: (p: Position) => void;
  selected?: Position | null;
  artwork?: Record<string, string>;
}) {
  const lib = libraryOf(content);
  const score = scoreGame(state, lib);
  return (
    <div className="sandbox-board-scroll">
      <div
        className="sandbox-board"
        style={{
          gridTemplateColumns: `repeat(${state.config.battlefield.cols}, minmax(95px,1fr))`,
        }}
      >
        {state.board.map((c) => {
          const card = c.creature ? state.cards[c.creature] : null;
          const def = card ? lib[card.definitionId] : null;
          return (
            <button
              key={`${c.row}/${c.col}`}
              type="button"
              className={`sandbox-cell owner-${c.owner ?? "neutral"} ${selected?.row === c.row && selected?.col === c.col ? "selected" : ""}`}
              aria-label={`Sandbox ${coordinate(c)}: ${c.owner === null ? "neutral" : `Player ${c.owner + 1}`}${def ? `, ${def.name}` : ""}`}
              onClick={() => onCell?.(c)}
            >
              <b>{coordinate(c)}</b>
              <span>
                P{c.owner === null ? "—" : c.owner + 1} · T{c.tokens} · F
                {c.fortification}
              </span>
              {def ? (
                <>
                  <div className="sandbox-played-card"><CollectibleCard card={def} library={lib} artwork={artwork?.[def.id] || cardArtwork(content,def.id)} scale="battlefield"/></div>
                  <span>
                    {currentPower(state, lib, card!.id)} power ·{" "}
                    {card!.stack.length + 1} form(s)
                  </span>
                </>
              ) : (
                <span>Empty</span>
              )}
            </button>
          );
        })}
      </div>
      <div className="sandbox-scores">
        <b>
          Jade {score.totals[0]} / Amber {score.totals[1]}
        </b>
        <span>
          {score.rows
            .map(
              (r, i) => `${String.fromCharCode(65 + i)} ${r.powers.join(":")}`,
            )
            .join(" · ")}
        </span>
        {state.config.scoring === "domination" && (
          <span>
            Column creature counts:{" "}
            {score.columns.map((c) => c.join(":")).join(" · ")}
          </span>
        )}
      </div>
      <ScoreDetails state={state} library={lib} />
    </div>
  );
}
export function EvolutionGraph({
  content,
  collection,
  onCard,
}: {
  content: ContentPack;
  collection?: string;
  onCard?: (id: string) => void;
}) {
  const edges = evolutionEdges(content.cards).filter(
    (e) =>
      !collection ||
      content.cards.some((c) => c.id === e.to && c.kindred === collection),
  );
  const ids = [...new Set(edges.flatMap((e) => [e.from, e.to]))];
  const depths = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    if (depths.has(id)) return depths.get(id)!;
    const incoming = edges.filter((e) => e.to === id);
    const result = incoming.length
      ? Math.min(
          6,
          1 +
            Math.max(
              ...incoming.map((e) => depth(e.from, new Set([...seen, id]))),
            ),
        )
      : 0;
    depths.set(id, result);
    return result;
  };
  const levels = new Map<number, string[]>();
  ids.forEach((id) => {
    const d = depth(id);
    levels.set(d, [...(levels.get(d) ?? []), id]);
  });
  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, nodes] of levels)
    nodes.forEach((id, i) =>
      positions.set(id, { x: 20 + d * 240, y: 20 + i * 75 }),
    );
  const width = 260 + Math.max(0, ...levels.keys()) * 240,
    height =
      90 + Math.max(0, ...[...levels.values()].map((v) => v.length)) * 75;
  return (
    <div className="evolution-graph">
      <p>
        Solid = named predecessor. Dashed = classification eligibility. Click a
        node to edit. Cross-collection predecessors stay visible.
      </p>
      {!edges.length ? (
        <p>No evolution relationships in this selection.</p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: width, minHeight: height }}
          role="img"
          aria-label="Evolution relationship diagram"
        >
          {edges.map((e, i) => {
            const a = positions.get(e.from)!,
              b = positions.get(e.to)!;
            return (
              <path
                key={i}
                d={`M${a.x + 200} ${a.y + 23} C${a.x + 220} ${a.y + 23}, ${b.x - 20} ${b.y + 23}, ${b.x} ${b.y + 23}`}
                stroke={e.criteria ? "#d7ba7e" : "#81c3ac"}
                strokeWidth="2"
                fill="none"
                strokeDasharray={e.criteria ? "6 5" : undefined}
              />
            );
          })}
          {ids.map((id) => {
            const p = positions.get(id)!,
              c = content.cards.find((c) => c.id === id)!;
            return (
              <g
                key={id}
                role="button"
                tabIndex={0}
                aria-label={`Edit ${c.name}`}
                onClick={() => onCard?.(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCard?.(id);
                }}
              >
                <rect
                  x={p.x}
                  y={p.y}
                  width="200"
                  height="48"
                  rx="5"
                  fill="#20363b"
                  stroke={
                    content.collections.find((k) => k.id === c.kindred)
                      ?.color ?? "#acbba1"
                  }
                />
                <text x={p.x + 10} y={p.y + 20} fill="#e5eadf" fontSize="13">
                  {c.name.slice(0, 26)}
                </text>
                <text x={p.x + 10} y={p.y + 37} fill="#a6b6a5" fontSize="11">
                  {c.kindred} · {c.type}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
