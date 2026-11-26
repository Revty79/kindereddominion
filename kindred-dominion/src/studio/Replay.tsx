import { useMemo, useState } from "react";
import type { MatchRecord } from "../replay/record";
import { replayAt } from "../replay/record";
import { baselineContent } from "../content/baseline";
import { BoardView, download, Field, NumberField } from "./components";
import Diagnostics from "./Diagnostics";
import type { GameState } from "../engine/types";
export default function Replay({ records }: { records: MatchRecord[] }) {
  const [id, setId] = useState(records[0]?.id ?? ""),
    [index, setIndex] = useState(0),
    [intermediate, setIntermediate] = useState<GameState | null>(null);
  const record = records.find((r) => r.id === id);
  const replay = useMemo(() => {
    try {
      return record
        ? {
            ...replayAt(record, Math.min(index, record.actions.length), true),
            error: "",
          }
        : { state: null, steps: [], error: "" };
    } catch (e) {
      return { state: null, steps: [], error: String(e) };
    }
  }, [record, index]);
  const content = useMemo(
    () => ({
      ...baselineContent(),
      cards: record ? Object.values(record.library) : [],
    }),
    [record],
  );
  const state = intermediate ?? replay.state;
  function move(next: number) {
    if (!record) return;
    setIndex(Math.max(0, Math.min(record.actions.length, next)));
    setIntermediate(null);
  }
  return (
    <section>
      <h2>Match replay & diagnostics</h2>
      <p>
        Records contain immutable card definitions and deterministic action
        signatures. Draft edits cannot rewrite historical behavior. Both private
        hands are visible here.
      </p>
      <Field label="Recorded match">
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setIndex(0);
            setIntermediate(null);
          }}
        >
          <option value="">Choose a match</option>
          {records.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · seed {r.seed} · {r.actions.length} actions
            </option>
          ))}
        </select>
      </Field>
      {!records.length && (
        <p>
          Complete a normal match, save a sandbox replay, or retain
          representative simulation matches.
        </p>
      )}
      {record && (
        <>
          <div className="studio-actions">
            <button onClick={() => move(0)}>Beginning</button>
            <button disabled={!index} onClick={() => move(index - 1)}>
              Previous action
            </button>
            <button
              disabled={index >= record.actions.length}
              onClick={() => move(index + 1)}
            >
              Next action
            </button>
            <button onClick={() => move(record.actions.length)}>
              Final action
            </button>
            <button
              onClick={() =>
                download(`${record.id}.json`, {
                  format: "kindred-dominion-studio",
                  schema: 1,
                  engineVersion: record.engineVersion,
                  type: "replays",
                  exportedAt: new Date().toISOString(),
                  data: [record],
                })
              }
            >
              Export this replay
            </button>
          </div>
          <div className="studio-grid three">
            <NumberField
              label="Replay action index"
              min={0}
              max={record.actions.length}
              value={index}
              onChange={move}
            />
            <Field label="Jump to recorded turn">
              <select value="" onChange={(e) => move(Number(e.target.value))}>
                <option value="">Choose turn</option>
                {record.actions.map((a, i) => (
                  <option key={i} value={i + 1}>
                    Action {i + 1} · {a.action.type} · Player{" "}
                    {a.action.player + 1}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <p>Version {record.contentVersion}</p>
              <p>
                Seed {record.seed} · starting Player {record.startingPlayer + 1}
              </p>
            </div>
          </div>
          {replay.error && <p role="alert">{replay.error}</p>}
          {state && (
            <>
              <p>
                Action {index} / {record.actions.length} · Turn {state.turn} ·{" "}
                {state.phase} ·{" "}
                {state.result
                  ? state.result.winner === null
                    ? "Draw"
                    : `Winner: Player ${state.result.winner + 1}`
                  : "No final result at this step"}
                {intermediate ? " · recorded intermediate snapshot" : ""}
              </p>
              <BoardView state={state} content={content} />
              <div className="studio-grid two">
                {state.players.map((player, p) => (
                  <section className="studio-subpanel" key={p}>
                    <h3>Player {p + 1} card zones</h3>
                    {(["draw", "hand", "graveyard", "exile"] as const).map(
                      (zone) => (
                        <details key={zone} open>
                          <summary>
                            {zone} · {player[zone].length}
                          </summary>
                          <p>
                            {player[zone]
                              .map(
                                (id) =>
                                  `${record.library[state.cards[id].definitionId].name} (${id})`,
                              )
                              .join(", ") || "Empty"}
                          </p>
                        </details>
                      ),
                    )}
                  </section>
                ))}
              </div>
              <Diagnostics
                key={`${id}/${index}`}
                steps={replay.steps}
                onState={setIntermediate}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
