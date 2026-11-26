import { useEffect, useState } from "react";
import type { ContentPack, Scenario, Workspace } from "../content/types";
import type {
  Action,
  DiagnosticStep,
  GameState,
  Player,
  Position,
} from "../engine/types";
import {
  addInstance,
  addStackForm,
  emptyScenario,
  removeInstance,
  validateScenario,
} from "../sandbox/scenario";
import { cellAt, coordinate, legalPlays } from "../engine/game";
import { chooseComputerAction } from "../engine/ai";
import { libraryOf } from "../content/validation";
import { appendRecord, newRecord, traceAction } from "../replay/record";
import type { MatchRecord } from "../replay/record";
import { BoardView, Field, Issues, NumberField } from "./components";
import Diagnostics from "./Diagnostics";
import { artworkMap } from "../assets/references";
import PowerDetails from "../ui/PowerDetails";
import { MAX_POWER } from "../engine/advanced-types";
export default function Sandbox({
  workspace,
  onSave,
  onReplay,
}: {
  workspace: Workspace;
  onSave: (scenario: Scenario) => Promise<void>;
  onReplay: (record: MatchRecord) => Promise<void>;
}) {
  const [scenario, setScenario] = useState(() =>
    emptyScenario(workspace.working, workspace.working.rulesets[0].config),
  );
  const [saved, setSaved] = useState<Scenario | null>(null);
  const [rule, setRule] = useState(workspace.working.rulesets[0].id);
  const [version, setVersion] = useState("working");
  const [running, setRunning] = useState(false),
    [history, setHistory] = useState<GameState[]>([]),
    [record, setRecord] = useState<MatchRecord | null>(null),
    [steps, setSteps] = useState<DiagnosticStep[]>([]),
    [intermediate, setIntermediate] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<Position | null>({ row: 0, col: 0 }),
    [card, setCard] = useState(workspace.working.cards[0].id),
    [owner, setOwner] = useState<Player>(0),
    [zone, setZone] = useState<
      "hand" | "draw" | "graveyard" | "exile" | "battlefield"
    >("hand"),
    [instance, setInstance] = useState(""),
    [form, setForm] = useState(workspace.working.cards[0].id),
    [hand, setHand] = useState(""),
    [pending, setPending] = useState<Position | null>(null),
    [message, setMessage] = useState(""),
    [auto, setAuto] = useState(false),
    [autoCount, setAutoCount] = useState(0);
  const [ability, setAbility] = useState(""),
    [scope, setScope] = useState("match"),
    [restrictionCount, setRestrictionCount] = useState(1),
    [eventId, setEventId] = useState(1);
  const state = running ? history.at(-1)! : scenario.state;
  const display = intermediate ?? state;
  const content = scenario.content;
  const lib = libraryOf(content);
  const cell = selected ? cellAt(state, selected.row, selected.col) : null;
  const chosen =
    state.cards[instance] ??
    (cell?.creature ? state.cards[cell.creature] : null);
  const legal = running ? legalPlays(state, lib) : [];
  const issues = validateScenario({ ...scenario, state });
  function edit(fn: (s: GameState) => GameState) {
    if (running) return;
    try {
      setScenario((s) => ({ ...s, state: fn(s.state) }));
      setMessage(
        "Scenario construction changed. Save explicitly to preserve this revision.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  function patch(fn: (s: GameState) => void) {
    edit((s) => {
      const n = structuredClone(s);
      fn(n);
      return n;
    });
  }
  async function save() {
    try {
      if (issues.some((i) => i.severity === "error"))
        throw new Error("Fix structural validation errors before saving.");
      const next = {
        ...structuredClone(scenario),
        savedAt: new Date().toISOString(),
      };
      await onSave(next);
      setSaved(next);
      setMessage(
        "Scenario saved. Execution will preserve this construction snapshot.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  function execute(action: Action) {
    if (!running || intermediate) return;
    try {
      const traced = traceAction(state, action, lib);
      setHistory((h) => [...h, traced.state]);
      setSteps(traced.steps);
      setIntermediate(null);
      setHand("");
      setPending(null);
      if (record) setRecord(appendRecord(record, action, traced.state));
      if (traced.state.phase !== "playing") setAuto(false);
    } catch (e) {
      setMessage(String(e));
      setAuto(false);
    }
  }
  useEffect(() => {
    if (!auto || !running || state.phase !== "playing" || autoCount >= 200) {
      if (auto) setAuto(false);
      return;
    }
    const timer = setTimeout(() => {
      execute(chooseComputerAction(state, lib));
      setAutoCount((n) => n + 1);
    }, 30);
    return () => clearTimeout(timer);
  }, [auto, running, state, autoCount]);
  function run() {
    if (issues.some((i) => i.severity === "error")) {
      setMessage("Correct scenario validation errors first.");
      return;
    }
    setHistory([structuredClone(scenario.state)]);
    setRecord(
      newRecord(
        scenario.state,
        lib,
        [[], []],
        content.id,
        `Sandbox: ${scenario.name}`,
      ),
    );
    setRunning(true);
    setIntermediate(null);
    setSteps([]);
    setMessage(
      "Executing the real engine. Construction is locked; use Edit construction to change the scenario.",
    );
  }
  async function saveReplay() {
    if (!record) return;
    await onReplay({ ...record, artwork: artworkMap(content) });
    setMessage("Sandbox action record saved in Replay & Diagnostics.");
  }
  const available = workspace.working.rulesets;
  const selectedContent =
    version === "working"
      ? workspace.working
      : workspace.versions.find((v) => v.id === version)!;
  return (
    <section>
      <div className="studio-section-title">
        <div>
          <h2>Battlefield sandbox</h2>
          <p>
            {running
              ? "Execution · construction preserved"
              : "Construction · may bypass placement prerequisites"}
            {intermediate ? " · READ-ONLY DIAGNOSTIC STEP" : ""}
          </p>
        </div>
        <div className="studio-actions">
          {running ? (
            <>
              <button
                onClick={() => {
                  setRunning(false);
                  setAuto(false);
                  setIntermediate(null);
                  setSteps([]);
                }}
              >
                Edit construction
              </button>
              <button
                onClick={() => {
                  setHistory([structuredClone(scenario.state)]);
                  setRecord(
                    newRecord(
                      scenario.state,
                      lib,
                      [[], []],
                      content.id,
                      `Sandbox: ${scenario.name}`,
                    ),
                  );
                  setSteps([]);
                  setIntermediate(null);
                  setAuto(false);
                }}
              >
                Reset execution
              </button>
            </>
          ) : (
            <button
              className="primary"
              disabled={issues.some((i) => i.severity === "error")}
              onClick={run}
            >
              Execute scenario
            </button>
          )}
        </div>
      </div>
      <div className="studio-grid three">
        <Field label="Scenario name">
          <input
            disabled={running}
            value={scenario.name}
            onChange={(e) => setScenario({ ...scenario, name: e.target.value })}
          />
        </Field>
        <Field label="Load saved scenario">
          <select
            disabled={running}
            value={saved?.id ?? ""}
            onChange={(e) => {
              const s = workspace.scenarios.find(
                (s) => s.id === e.target.value,
              );
              if (s) {
                setScenario(structuredClone(s));
                setSaved(s);
                setCard(s.content.cards[0].id);
                setInstance("");
                setSelected({ row: 0, col: 0 });
              }
            }}
          >
            <option value="">Choose saved scenario</option>
            {workspace.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sandbox tactical ruleset">
          <select
            disabled={running}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          >
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scenario content definitions">
          <select
            disabled={running}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="working">Current working draft</option>
            {workspace.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!running && (
        <div className="studio-actions">
          <button
            onClick={() => {
              const r = available.find((r) => r.id === rule)!;
              const next = emptyScenario(selectedContent, r.config);
              setScenario(next);
              setSaved(null);
              setSelected({ row: 0, col: 0 });
              setInstance("");
            }}
          >
            New scenario from ruleset
          </button>
          <button
            onClick={() =>
              setScenario({
                ...scenario,
                content: structuredClone(selectedContent),
                state: {
                  ...scenario.state,
                  config: structuredClone(
                    available.find((r) => r.id === rule)!.config,
                  ),
                },
              })
            }
          >
            Apply selected definitions & rules (validate dimensions)
          </button>
          <button className="primary" onClick={save}>
            Save scenario
          </button>
          <button
            disabled={!saved}
            onClick={() => saved && setScenario(structuredClone(saved))}
          >
            Restore saved construction
          </button>
          <button
            onClick={() => {
              setScenario({
                ...structuredClone(scenario),
                id: `scenario-${Date.now().toString(36)}`,
                name: `${scenario.name} copy`,
              });
              setSaved(null);
            }}
          >
            Duplicate scenario
          </button>
        </div>
      )}
      <Field label="Scenario description">
        <textarea
          disabled={running}
          value={scenario.description}
          onChange={(e) =>
            setScenario({ ...scenario, description: e.target.value })
          }
        />
      </Field>
      {message && (
        <p role="status" className="studio-message">
          {message}
        </p>
      )}
      <BoardView
        state={display}
        content={content}
        selected={selected}
        onCell={(p) => {
          setSelected({ row: p.row, col: p.col });
          if (!running || !hand) {
            setInstance(cellAt(state, p.row, p.col)?.creature ?? "");
          } else if (hand) {
            const action = legal.find(
              (a) => a.card === hand && a.row === p.row && a.col === p.col,
            );
            if (action) setPending({ row: p.row, col: p.col });
            else
              setMessage(
                "This is not a legal destination for the selected hand card.",
              );
          }
        }}
      />
      <section className="studio-subpanel">
        <h3>Effective-power inspection</h3>
        <Field label="Inspect effective-power instance">
          <select
            value={chosen?.id ?? ""}
            onChange={(e) => setInstance(e.target.value)}
          >
            <option value="">Select a creature or zone instance</option>
            {Object.values(display.cards).map((c) => (
              <option key={c.id} value={c.id}>
                {lib[c.definitionId].name} · {c.id} · {c.location}
              </option>
            ))}
          </select>
        </Field>
        {chosen && display.cards[chosen.id] && (
          <PowerDetails state={display} library={lib} id={chosen.id} />
        )}
      </section>
      {!running ? (
        <>
          <div className="studio-grid two">
            <section className="studio-subpanel">
              <h3>Selected cell {selected ? coordinate(selected) : "—"}</h3>
              {cell && (
                <div className="studio-grid three">
                  <Field label="Cell ownership">
                    <select
                      value={cell.owner ?? "neutral"}
                      onChange={(e) =>
                        patch((s) => {
                          cellAt(s, cell.row, cell.col)!.owner =
                            e.target.value === "neutral"
                              ? null
                              : (Number(e.target.value) as Player);
                        })
                      }
                    >
                      <option value="neutral">Neutral</option>
                      <option value={0}>Player One</option>
                      <option value={1}>Player Two</option>
                    </select>
                  </Field>
                  <NumberField
                    label="Cell placement tokens"
                    min={0}
                    max={state.config.battlefield.maxTokens}
                    value={cell.tokens}
                    onChange={(tokens) =>
                      patch((s) => {
                        cellAt(s, cell.row, cell.col)!.tokens = tokens;
                      })
                    }
                  />
                  <NumberField
                    label="Cell fortification"
                    min={0}
                    max={state.config.battlefield.maxFortification}
                    value={cell.fortification}
                    onChange={(fortification) =>
                      patch((s) => {
                        cellAt(s, cell.row, cell.col)!.fortification =
                          fortification;
                      })
                    }
                  />
                </div>
              )}
              <Field label="Scenario card definition">
                <select value={card} onChange={(e) => setCard(e.target.value)}>
                  {content.cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.kindred}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="studio-grid two">
                <Field label="New instance owner">
                  <select
                    value={owner}
                    onChange={(e) => setOwner(Number(e.target.value) as Player)}
                  >
                    <option value={0}>Player One</option>
                    <option value={1}>Player Two</option>
                  </select>
                </Field>
                <Field label="New instance destination">
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value as typeof zone)}
                  >
                    {["hand", "draw", "graveyard", "exile", "battlefield"].map(
                      (z) => (
                        <option key={z}>{z}</option>
                      ),
                    )}
                  </select>
                </Field>
              </div>
              <button
                onClick={() =>
                  edit((s) =>
                    addInstance(s, card, owner, zone, selected ?? undefined),
                  )
                }
              >
                Add card instance
              </button>
              <p>
                Draw cards are appended in order. The first card listed is drawn
                first. Cell owner is established when placing a creature; tokens
                remain independently editable.
              </p>
            </section>
            <section className="studio-subpanel">
              <h3>Turn construction</h3>
              <div className="studio-grid two">
                <Field label="Active player">
                  <select
                    value={state.active}
                    onChange={(e) =>
                      patch((s) => {
                        s.active = Number(e.target.value) as Player;
                      })
                    }
                  >
                    <option value={0}>Player One</option>
                    <option value={1}>Player Two</option>
                  </select>
                </Field>
                <NumberField
                  label="Turn number"
                  min={1}
                  max={10000}
                  value={state.turn}
                  onChange={(n) =>
                    patch((s) => {
                      s.turn = n;
                    })
                  }
                />
                <NumberField
                  label="Consecutive passes"
                  min={0}
                  max={1}
                  value={state.passes}
                  onChange={(n) =>
                    patch((s) => {
                      s.passes = n;
                    })
                  }
                />
                {([0, 1] as const).map((p) => (
                  <NumberField
                    key={p}
                    label={`Player ${p + 1} turns already begun`}
                    min={0}
                    max={10000}
                    value={state.players[p].turns}
                    onChange={(n) =>
                      patch((s) => {
                        s.players[p].turns = n;
                      })
                    }
                  />
                ))}
              </div>
              <p>
                Execution starts at the action step of the configured turn.
                Beginning-of-turn effects resolve naturally on later turn
                transfers. Use Ruleset Editor for custom dimensions and starting
                layouts, then New scenario.
              </p>
            </section>
          </div>
          <section className="studio-subpanel">
            <h3>Instance inspection and persistent restrictions</h3>
            <Field label="Inspect scenario instance">
              <select
                value={chosen?.id ?? ""}
                onChange={(e) => setInstance(e.target.value)}
              >
                <option value="">Select instance</option>
                {Object.values(state.cards)
                  .filter((c) => c.location !== "stack")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}: {lib[c.definitionId].name} · P{c.owner + 1} ·{" "}
                      {c.location}
                    </option>
                  ))}
              </select>
            </Field>
            {chosen && (
              <>
                <p>
                  {chosen.id} · lineage {chosen.lineage} · {chosen.location}
                </p>
                <div className="studio-grid three">
                  <NumberField
                    label="Intrinsic creature power (base plus permanent)"
                    min={state.mechanics ? -MAX_POWER : -1000}
                    max={state.mechanics ? MAX_POWER : 1000}
                    value={lib[chosen.definitionId].power + chosen.modifier}
                    onChange={(power) =>
                      patch((s) => {
                        s.cards[chosen.id].modifier =
                          power - lib[chosen.definitionId].power;
                        delete s.cards[chosen.id].permanentEnhancement;
                        delete s.cards[chosen.id].permanentWeakening;
                      })
                    }
                  />
                  <NumberField
                    label="Instance resurrection count"
                    min={0}
                    max={1000}
                    value={chosen.resurrections}
                    onChange={(n) =>
                      patch((s) => {
                        s.cards[chosen.id].resurrections = n;
                      })
                    }
                  />
                  <NumberField
                    label="Lineage resurrection count"
                    min={0}
                    max={1000}
                    value={state.lineages[chosen.lineage].resurrections}
                    onChange={(n) =>
                      patch((s) => {
                        s.lineages[chosen.lineage].resurrections = n;
                      })
                    }
                  />
                  {(["destruction", "weakening"] as const).map((p) => (
                    <label className="studio-check" key={p}>
                      <input
                        type="checkbox"
                        checked={chosen.statuses.includes(p)}
                        onChange={(e) =>
                          patch((s) => {
                            s.cards[chosen.id].statuses = e.target.checked
                              ? [...chosen.statuses, p]
                              : chosen.statuses.filter((x) => x !== p);
                          })
                        }
                      />
                      Granted {p} protection
                    </label>
                  ))}
                </div>
                <div className="studio-grid three">
                  <Field label="Restriction ability">
                    <select
                      value={ability}
                      onChange={(e) => setAbility(e.target.value)}
                    >
                      <option value="">Choose known ability</option>
                      {content.cards.flatMap((c) =>
                        c.abilities.map((a) => (
                          <option key={`${c.id}/${a.id}`} value={a.id}>
                            {c.name} · {a.id}
                          </option>
                        )),
                      )}
                    </select>
                  </Field>
                  <Field label="Restriction scope">
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="match">This match</option>
                      <option value="turn">Configured current turn</option>
                      <option value="event">Specific event</option>
                    </select>
                  </Field>
                  <NumberField
                    label="Activation count"
                    min={0}
                    max={1000}
                    value={restrictionCount}
                    onChange={setRestrictionCount}
                  />
                  {scope === "event" && (
                    <NumberField
                      label="Restricted event ID"
                      min={1}
                      max={100000}
                      value={eventId}
                      onChange={setEventId}
                    />
                  )}
                </div>
                <button
                  disabled={!ability}
                  onClick={() =>
                    patch((s) => {
                      const key = `${ability}:${scope}${scope === "turn" ? `:${s.turn}` : scope === "event" ? `:${eventId}` : ""}`;
                      s.cards[chosen.id].activations[key] = restrictionCount;
                      s.lineages[chosen.lineage].activations[key] =
                        restrictionCount;
                    })
                  }
                >
                  Set instance and lineage activation restriction
                </button>
                <div className="restriction-list">
                  {Object.entries(chosen.activations).map(([key, count]) => (
                    <p key={key}>
                      {key}: {count}{" "}
                      <button
                        onClick={() =>
                          patch((s) => {
                            delete s.cards[chosen.id].activations[key];
                            delete s.lineages[chosen.lineage].activations[key];
                          })
                        }
                      >
                        Clear
                      </button>
                    </p>
                  ))}
                </div>
                {chosen.location === "battlefield" && (
                  <>
                    <Field label="Previous evolution form">
                      <select
                        value={form}
                        onChange={(e) => setForm(e.target.value)}
                      >
                        {content.cards
                          .filter((c) => c.id !== chosen.definitionId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <button
                      onClick={() =>
                        edit((s) => addStackForm(s, chosen.id, form))
                      }
                    >
                      Prepend evolution form
                    </button>
                    {chosen.stack.map((id) => (
                      <p key={id}>
                        {lib[state.cards[id].definitionId].name} ({id}){" "}
                        <button
                          onClick={() =>
                            patch((s) => {
                              s.cards[chosen.id].stack = s.cards[
                                chosen.id
                              ].stack.filter((x) => x !== id);
                              delete s.cards[id];
                            })
                          }
                        >
                          Remove stack form
                        </button>
                      </p>
                    ))}
                  </>
                )}
                <button
                  onClick={() => {
                    edit((s) => removeInstance(s, chosen.id));
                    setInstance("");
                  }}
                >
                  Remove instance and its stack
                </button>
              </>
            )}
          </section>
        </>
      ) : (
        <section className="studio-subpanel">
          <h3>Real-engine action controls</h3>
          <p>
            Active Player {state.active + 1} · turn {state.turn} · {state.phase}
            .{" "}
            {intermediate
              ? "Return to committed state before executing another action."
              : ""}
          </p>
          <div className="studio-actions">
            <button
              disabled={!!intermediate || state.phase !== "playing"}
              onClick={() => execute({ type: "pass", player: state.active })}
            >
              Pass / advance turn
            </button>
            <button
              disabled={!!intermediate || state.phase !== "playing"}
              onClick={() => execute(chooseComputerAction(state, lib))}
            >
              Run one computer turn
            </button>
            <button
              disabled={!!intermediate || state.phase !== "playing" || auto}
              onClick={() => {
                setAutoCount(0);
                setAuto(true);
              }}
            >
              Run both computer players
            </button>
            <button disabled={!auto} onClick={() => setAuto(false)}>
              Stop computer run
            </button>
            <button
              disabled={history.length < 2 || auto}
              onClick={() => {
                setHistory((h) => h.slice(0, -1));
                setRecord((r) =>
                  r
                    ? {
                        ...r,
                        actions: r.actions.slice(0, -1),
                        finalResult: null,
                      }
                    : r,
                );
                setSteps([]);
                setIntermediate(null);
              }}
            >
              Undo committed action
            </button>
            <button onClick={() => void saveReplay()}>
              Save sandbox replay
            </button>
          </div>
          <p>
            Auto-run uses a visible 200-action experiment ceiling; reaching it
            stops the experiment without declaring a game result.
          </p>
          <Field label="Sandbox active hand card">
            <select
              disabled={!!intermediate || state.phase !== "playing"}
              value={hand}
              onChange={(e) => {
                setHand(e.target.value);
                setPending(null);
              }}
            >
              <option value="">Choose a hand instance</option>
              {state.players[state.active].hand.map((id) => (
                <option key={id} value={id}>
                  {lib[state.cards[id].definitionId].name} ({id}) ·{" "}
                  {legal.filter((a) => a.card === id).length} legal positions
                </option>
              ))}
            </select>
          </Field>
          {hand && (
            <p>
              Legal destinations:{" "}
              {legal
                .filter((a) => a.card === hand)
                .map(coordinate)
                .join(", ") || "None"}
              . Click a destination on the field.
            </p>
          )}
          {pending && hand && (
            <button
              className="primary"
              disabled={!!intermediate}
              onClick={() =>
                execute({
                  type: "play",
                  player: state.active,
                  card: hand,
                  ...pending,
                })
              }
            >
              Execute placement at {coordinate(pending)}
            </button>
          )}
          <Diagnostics
            key={history.length}
            steps={steps}
            onState={setIntermediate}
          />
        </section>
      )}
      <div className="studio-grid two">
        {([0, 1] as const).map((p) => (
          <section key={p} className="studio-subpanel">
            <h3>Player {p + 1} zones (developer visibility)</h3>
            {(["hand", "draw", "graveyard", "exile"] as const).map((z) => (
              <details key={z} open>
                <summary>
                  {z} · {state.players[p][z].length}
                </summary>
                {state.players[p][z].map((id, i) => (
                  <div className="zone-instance" key={id}>
                    <button onClick={() => setInstance(id)}>
                      {i + 1}. {lib[state.cards[id].definitionId].name} ({id})
                    </button>
                    {!running && (
                      <>
                        <button
                          disabled={i === 0}
                          onClick={() =>
                            patch((s) => {
                              const a = s.players[p][z];
                              [a[i - 1], a[i]] = [a[i], a[i - 1]];
                            })
                          }
                        >
                          Earlier
                        </button>
                        <button
                          onClick={() => edit((s) => removeInstance(s, id))}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </details>
            ))}
          </section>
        ))}
      </div>
      {!running && <Issues issues={issues} />}
    </section>
  );
}
