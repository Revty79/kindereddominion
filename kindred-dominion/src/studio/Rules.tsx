import { useState } from "react";
import type { ContentPack, Ruleset } from "../content/types";
import type { GameConfig, Player } from "../engine/types";
import { battlefield } from "../engine/config";
import { validateRules } from "../content/validation";
import { Field, Issues, NumberField } from "./components";
export default function Rules({
  content,
  onSave,
}: {
  content: ContentPack;
  onSave: (pack: ContentPack) => Promise<void>;
}) {
  const [selected, setSelected] = useState(content.rulesets[0].id),
    [draft, setDraft] = useState<Ruleset | null>(null),
    [message, setMessage] = useState("");
  const rule = draft ?? content.rulesets.find((r) => r.id === selected)!;
  const update = (patch: Partial<Ruleset>) => setDraft({ ...rule, ...patch });
  const config = (patch: Partial<GameConfig>) =>
    update({ config: { ...rule.config, ...patch } });
  const b = rule.config.battlefield;
  const [paint, setPaint] = useState<"neutral" | "0" | "1">("0"),
    [tokens, setTokens] = useState(1),
    [fortification, setFortification] = useState(0);
  function size(rows: number, cols: number) {
    config({
      battlefield: {
        ...battlefield(
          Math.max(1, Math.min(20, rows)),
          Math.max(2, Math.min(30, cols)),
        ),
        maxTokens: b.maxTokens,
        maxFortification: b.maxFortification,
      },
    });
  }
  const issues = validateRules(rule.config);
  async function save() {
    try {
      if (!rule.name.trim() || issues.some((i) => i.severity === "error"))
        throw new Error("Correct the ruleset validation errors first.");
      const next = {
        ...rule,
        id:
          selected === "classic" || selected === "domination"
            ? `rules-${Date.now().toString(36)}`
            : rule.id,
      };
      await onSave({
        ...content,
        rulesets: content.rulesets.some((r) => r.id === next.id)
          ? content.rulesets.map((r) => (r.id === next.id ? next : r))
          : [...content.rulesets, next],
      });
      setSelected(next.id);
      setDraft(null);
      setMessage(
        "Experimental ruleset saved. Approved defaults are unchanged.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  function paintCell(row: number, col: number) {
    const starts = b.starts
      .map((start) => ({
        ...start,
        positions: start.positions.filter(
          (p) => p.row !== row || p.col !== col,
        ),
      }))
      .filter((start) => start.positions.length);
    if (paint !== "neutral")
      starts.push({
        player: Number(paint) as Player,
        positions: [{ row, col }],
        tokens,
        fortification,
      });
    config({ battlefield: { ...b, starts } });
  }
  return (
    <section>
      <div className="studio-section-title">
        <h2>Tactical ruleset editor</h2>
        <button
          onClick={() => {
            setDraft({
              ...structuredClone(rule),
              id: `rules-${Date.now().toString(36)}`,
              name: `${rule.name} experiment`,
            });
            setSelected("");
          }}
        >
          Duplicate ruleset
        </button>
      </div>
      <p>
        Scoring methods and completion conditions come from the engine registry.
        Saving a built-in ruleset creates a separate experiment.
      </p>
      <Field label="Select tactical ruleset">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setDraft(null);
          }}
        >
          <option value="">New experiment</option>
          {content.rulesets.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="studio-grid three">
        <Field label="Ruleset name">
          <input
            value={rule.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label="Scoring method">
          <select
            value={rule.config.scoring}
            onChange={(e) => config({ scoring: e.target.value })}
          >
            <option value="classic">Classic</option>
            <option value="domination">Domination</option>
          </select>
        </Field>
        <Field label="Completion condition">
          <select value={rule.completion} disabled>
            <option value="twoPasses">
              Two consecutive passes / active-player surrender
            </option>
          </select>
        </Field>
        <NumberField
          label="Battlefield rows"
          min={1}
          max={20}
          value={b.rows}
          onChange={(rows) => size(rows, b.cols)}
        />
        <NumberField
          label="Battlefield columns"
          min={2}
          max={30}
          value={b.cols}
          onChange={(cols) => size(b.rows, cols)}
        />
        <NumberField
          label="Maximum placement tokens"
          min={1}
          max={20}
          value={b.maxTokens}
          onChange={(maxTokens) => config({ battlefield: { ...b, maxTokens } })}
        />
        <NumberField
          label="Maximum fortification"
          min={0}
          max={20}
          value={b.maxFortification}
          onChange={(maxFortification) =>
            config({ battlefield: { ...b, maxFortification } })
          }
        />
        <NumberField
          label="Ruleset deck size"
          min={1}
          max={50}
          value={rule.config.deckSize}
          onChange={(deckSize) => config({ deckSize })}
        />
        <NumberField
          label="Opening hand size"
          min={1}
          max={25}
          value={rule.config.openingHand}
          onChange={(openingHand) => config({ openingHand })}
        />
        <NumberField
          label="Standard duplicate default"
          min={1}
          max={50}
          value={rule.config.maxCopies}
          onChange={(maxCopies) => config({ maxCopies })}
        />
        <Field label="Collection restriction">
          <select
            value={rule.config.collection}
            onChange={(e) => config({ collection: e.target.value })}
          >
            <option value="mixed">Mixed collections</option>
            {content.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ruleset play format">
          <select
            value={rule.config.mode}
            onChange={(e) =>
              config({ mode: e.target.value as "standard" | "free" })
            }
          >
            <option value="standard">Standard</option>
            <option value="free">Free Play</option>
          </select>
        </Field>
      </div>
      <Field label="Ruleset description">
        <textarea
          value={rule.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>
      <h3>Starting territory painter</h3>
      <p>
        Changing dimensions resets starts to edge columns. Cell painting sets
        explicit coordinates, tokens and fortification.
      </p>
      <div className="studio-grid three">
        <Field label="Paint starting owner">
          <select
            value={paint}
            onChange={(e) => setPaint(e.target.value as typeof paint)}
          >
            <option value="0">Player One</option>
            <option value="1">Player Two</option>
            <option value="neutral">Neutral</option>
          </select>
        </Field>
        <NumberField
          label="Paint starting tokens"
          min={0}
          max={b.maxTokens}
          value={tokens}
          onChange={setTokens}
        />
        <NumberField
          label="Paint starting fortification"
          min={0}
          max={b.maxFortification}
          value={fortification}
          onChange={setFortification}
        />
      </div>
      <div className="offset-scroll">
        <div
          className="rules-starts"
          style={{ gridTemplateColumns: `repeat(${b.cols},80px)` }}
        >
          {Array.from({ length: b.rows * b.cols }, (_, i) => {
            const row = Math.floor(i / b.cols),
              col = i % b.cols,
              start = b.starts.find((s) =>
                s.positions.some((p) => p.row === row && p.col === col),
              );
            return (
              <button
                key={i}
                className={`owner-${start?.player ?? "neutral"}`}
                onClick={() => paintCell(row, col)}
              >
                {String.fromCharCode(65 + row)}
                {col + 1}
                <br />P{start ? start.player + 1 : "—"} T{start?.tokens ?? 0} F
                {start?.fortification ?? 0}
              </button>
            );
          })}
        </div>
      </div>
      <details className="studio-subpanel">
        <summary>Universal safeguards (always enforced)</summary>
        <div className="studio-grid two">
          {Object.entries(rule.config.safeguards).map(([key, value]) => (
            <NumberField
              key={key}
              label={key}
              value={value}
              min={1}
              max={key === "maxResolutionSteps" ? 3000 : 1000}
              onChange={(n) =>
                config({ safeguards: { ...rule.config.safeguards, [key]: n } })
              }
            />
          ))}
        </div>
      </details>
      <Issues issues={issues} />
      <button
        className="primary"
        disabled={issues.some((i) => i.severity === "error")}
        onClick={save}
      >
        Save experimental ruleset
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
