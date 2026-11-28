import LaboratoryBattle from "./LaboratoryBattle";
import {LaboratorySession,laboratoryMetadata,representativeScenario,regressionResult,exportRegression,importRegression} from "../sandbox/laboratory";
import {matchingRuleset} from "../content/rulesets";
import {download} from "./components";
import { useEffect, useState, useRef } from "react";
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
import { traceAction, signature } from "../replay/record";
import type { MatchRecord } from "../replay/record";
import { BoardView, Field, Issues, NumberField } from "./components";
import Diagnostics from "./Diagnostics";
import { recordArtworkMap } from "../assets/references";
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
  const session=useRef<LaboratorySession|null>(null),[battleOpen,setBattleOpen]=useState(false),[saving,setSaving]=useState(false);
  const [seed,setSeed]=useState(1),[firstDeck,setFirstDeck]=useState(workspace.working.decks[0]?.id??""),[secondDeck,setSecondDeck]=useState(workspace.working.decks[1]?.id??workspace.working.decks[0]?.id??""),[startingPlayer,setStartingPlayer]=useState<Player>(0),[regressionAction,setRegressionAction]=useState(""),[expectedText,setExpectedText]=useState("{}");
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
  function adoptScenario(value:Scenario){setScenario(structuredClone(value));setSeed(value.state.seed);setRegressionAction(value.laboratory?.intendedAction?JSON.stringify(value.laboratory.intendedAction):"");setExpectedText(JSON.stringify(value.laboratory?.expected??{}));}
  function edit(fn: (s: GameState) => GameState) {
    if (running) return;
    try {
      setScenario((s) => ({ ...s, state: fn(s.state),laboratory:{...(s.laboratory??laboratoryMetadata(s.content,s.state.seed,workspace.revision)),classification:"artificial"} }));
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
    if(saving)return;setSaving(true);setMessage("Saving scenario...");
    try {
      if (issues.some((i) => i.severity === "error"))
        throw new Error("Fix structural validation errors before saving.");
      const next = {
        ...structuredClone(scenario),
        savedAt: new Date().toISOString(),
      };
      if(next.laboratory?.intendedAction)next.laboratory.expected=JSON.parse(expectedText);
      const invalid=validateScenario(next).filter(i=>i.severity==="error");if(invalid.length)throw Error(invalid.map(i=>i.message).join("; "));
      await onSave(next);
      setSaved(next);setScenario(current=>current===scenario?next:current);
      setMessage(
        "Scenario saved. Execution will preserve this construction snapshot.",
      );
    } catch (e) {
      setMessage(String(e));
    }finally{setSaving(false);}
  }
  function execute(action: Action) {
    if (!running || intermediate) return;
    try {
      if(!session.current)throw Error("Start execution first.");
      session.current.execute(action);
      syncSession();
      setHand("");
      if(session.current.state.phase!=="playing")setAuto(false);
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
    session.current=new LaboratorySession(scenario);
    syncSession();setBattleOpen(true);
    setRunning(true);
    setIntermediate(null);
    setSteps([]);
    setMessage(
      "Executing the real engine. Construction is locked; use Edit construction to change the scenario.",
    );
  }
  async function saveReplay() {
    if(!record||saving)return;setSaving(true);setMessage("Saving sandbox replay...");
    try{await onReplay({...record,artwork:recordArtworkMap(content)});setMessage("Sandbox action record saved in Replay & Diagnostics.");}catch(e){setMessage(String(e));}finally{setSaving(false);}
  }
  function syncSession(){const current=session.current;if(!current)return;setHistory([...current.states]);setRecord(current.record);setSteps(current.steps);setIntermediate(null);}
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
                  session.current=new LaboratorySession(scenario);syncSession();
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
                adoptScenario(s);setRule(s.laboratory?.ruleset?.id??rule);
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
              const next = emptyScenario(selectedContent, r.config);next.state.seed=seed;next.state.rng=seed||1;next.laboratory={...laboratoryMetadata(selectedContent,seed,workspace.revision),ruleset:matchingRuleset(workspace.rulesetVersions,r.id,r.config)};
              adoptScenario(next);
              setSaved(null);
              setSelected({ row: 0, col: 0 });
              setInstance("");
            }}
          >
            New scenario from ruleset
          </button>
          <button
            onClick={() =>
              adoptScenario({
                ...scenario,
                content: structuredClone(selectedContent),
                laboratory:{...laboratoryMetadata(selectedContent,scenario.state.seed,workspace.revision),ruleset:matchingRuleset(workspace.rulesetVersions,rule,available.find(r=>r.id===rule)!.config)},
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
          <button className="primary" disabled={saving} onClick={save}>
            Save scenario
          </button>
          <button
            disabled={!saved}
            onClick={() => saved && adoptScenario(saved)}
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
      {!running&&<section className="studio-subpanel"><h3>Battle Laboratory setup</h3><p className="studio-lab-boundary">All Studio execution is private development. Artificial fixtures can bypass construction prerequisites; production-representative starts require valid decks and a pinned private testing ruleset. Neither grants player assets or rewards.</p><div className="studio-grid three"><NumberField label="Scenario random seed" min={0} max={4294967295} value={seed} onChange={n=>{setSeed(n);setScenario({...scenario,state:{...scenario.state,seed:n,rng:n||1},laboratory:{...(scenario.laboratory??laboratoryMetadata(scenario.content,n,workspace.revision)),seed:n,classification:"artificial"}});}}/><Field label="Computer opponent configuration"><select value={scenario.laboratory?.opponent??"manual"} onChange={e=>setScenario({...scenario,laboratory:{...(scenario.laboratory??laboratoryMetadata(scenario.content,scenario.state.seed,workspace.revision)),opponent:e.target.value as "manual"|"computer"}})}><option value="manual">Manual control of both participants</option><option value="computer">Jade controlled here; Amber computer</option></select></Field><Field label="Starting participant"><select value={startingPlayer} onChange={e=>setStartingPlayer(Number(e.target.value) as Player)}><option value="0">Jade</option><option value="1">Amber</option></select></Field>{[[firstDeck,setFirstDeck,"Jade initial deck"],[secondDeck,setSecondDeck,"Amber initial deck"]].map(([id,setter,label])=><Field key={String(label)} label={String(label)}><select value={String(id)} onChange={e=>(setter as (v:string)=>void)(e.target.value)}>{selectedContent.decks.map(d=><option key={d.id} value={d.id}>{d.name} · {d.cards.length} cards</option>)}</select></Field>)}</div><button onClick={()=>{try{const r=available.find(r=>r.id===rule)!,v=matchingRuleset(workspace.rulesetVersions,r.id,r.config);if(!v)throw Error("Save and publish the selected ruleset as a private testing revision first.");const decks=[firstDeck,secondDeck].map(id=>selectedContent.decks.find(d=>d.id===id)?.cards);if(decks.some(d=>!d))throw Error("Choose two existing test decks.");const next=representativeScenario(selectedContent,v,decks as [string[],string[]],seed,startingPlayer);next.laboratory!.contentRevision.workspaceRevision=workspace.revision;adoptScenario(next);setSaved(null);setMessage("Representative initial state created through the unchanged match constructor and deck validator.");}catch(e){setMessage(String(e));}}}>Create validated battle from decks</button><p>Classification: <strong>{scenario.laboratory?.classification??"legacy artificial / unknown provenance"}</strong>. Ruleset: {scenario.laboratory?.ruleset?`${scenario.laboratory.ruleset.name} revision ${scenario.laboratory.ruleset.revision}`:"unpublished captured configuration"}. Content: {scenario.content.id} · {scenario.content.createdAt}. Source workspace revision: {scenario.laboratory?.contentRevision.workspaceRevision??"not recorded on this historical snapshot"}.</p><Field label="Investigation or defect reference"><input value={scenario.laboratory?.reference??""} onChange={e=>setScenario({...scenario,laboratory:{...(scenario.laboratory??laboratoryMetadata(scenario.content,scenario.state.seed,workspace.revision)),reference:e.target.value}})}/></Field></section>}
      {!running&&<details className="studio-subpanel studio-lab-regression"><summary>Scenario regression library and automation export</summary><p>The initial state, definitions and actual ruleset snapshot travel together. Pick an intended legal action; expected assertions are optional. Generated signatures detect deterministic divergence, not security authenticity.</p><Field label="Regression intended action"><select value={regressionAction} onChange={e=>{setRegressionAction(e.target.value);setExpectedText("{}");const m=scenario.laboratory??laboratoryMetadata(scenario.content,scenario.state.seed,workspace.revision);setScenario({...scenario,laboratory:{...m,intendedAction:e.target.value?JSON.parse(e.target.value):undefined,expected:undefined}});}}><option value="">No intended action</option>{(state.phase==="playing"?[...legalPlays(state,lib),{type:"pass",player:state.active} as Action]:state.phase==="mulligan"?[{type:"mulligan",player:state.active,cards:[]} as Action]:[]).map(a=><option key={JSON.stringify(a)} value={JSON.stringify(a)}>{a.type==="play"?`${lib[state.cards[a.card].definitionId].name} at ${coordinate(a)}`:a.type}</option>)}</select></Field><Field label="Expected regression assertions (JSON)"><textarea value={expectedText} onChange={e=>setExpectedText(e.target.value)}/></Field><button onClick={()=>{try{const expected=JSON.parse(expectedText),next={...scenario,laboratory:{...(scenario.laboratory??laboratoryMetadata(scenario.content,scenario.state.seed,workspace.revision)),expected}};const result=regressionResult(next);setScenario(next);setMessage(`Regression ${result.passed?"passed":"FAILED"}: ${result.stateSignature}; score ${result.totals.join(" / ")}; ${result.phase}.`);}catch(e){setMessage(String(e));}}}>Validate and run regression</button><button disabled={!scenario.laboratory?.intendedAction} onClick={()=>{try{const result=regressionResult({...scenario,laboratory:{...scenario.laboratory!,expected:undefined}}),expected={stateSignature:result.stateSignature,totals:result.totals,phase:result.phase};setExpectedText(JSON.stringify(expected,null,2));setScenario({...scenario,laboratory:{...scenario.laboratory!,expected}});setMessage("Expected result captured explicitly from the real engine. Review before saving.");}catch(e){setMessage(String(e));}}}>Capture current expected result</button><button onClick={()=>{try{download(scenario.id+"-regression.json",exportRegression(scenario));}catch(e){setMessage(String(e));}}}>Export regression fixture</button><Field label="Import scenario regression fixture"><input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>16*1024*1024){setMessage("Regression package exceeds the private workspace size limit.");return;}if(f)void f.text().then(text=>{const next=importRegression(JSON.parse(text));setScenario({...next,id:"scenario-"+crypto.randomUUID(),name:next.name+" imported"});setSaved(null);setSeed(next.state.seed);setRegressionAction(next.laboratory?.intendedAction?JSON.stringify(next.laboratory.intendedAction):"");setExpectedText(JSON.stringify(next.laboratory?.expected??{}));setMessage("Regression fixture imported as a separate unsaved private construction.");}).catch(e=>setMessage(String(e)));}}/></Field></details>}
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
            if (action) execute({...action,type:"play",player:state.active});
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
          <h3>Real-engine action controls</h3><button className="primary" disabled={!!intermediate||auto} onClick={()=>setBattleOpen(true)}>Open shared gameplay interface</button><p>Selection, click/tap/drop, previews, animations, Last Move, replay and display preferences use the player interface. Manual mode controls the active participant; computer mode plays Amber after your action. Developer zones and time travel remain separate from ordinary play.</p>
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
                session.current?.undo();syncSession();
                setSteps([]);
                setIntermediate(null);
              }}
            >
              Undo committed action
            </button>
            <button disabled={saving} onClick={() => void saveReplay()}>
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
          {hand&&<div className="studio-lab-actions" aria-label="Developer legal destinations">{legal.filter(a=>a.card===hand).map(a=><button disabled={!!intermediate||auto} key={coordinate(a)} onClick={()=>execute({...a,type:"play",player:state.active})}>Place at {coordinate(a)}</button>)}</div>}
          <button disabled={!!intermediate||auto||!record?.actions.length} onClick={()=>{try{const current=session.current!,before=current.states.at(-2),action=current.record.actions.at(-1)?.action;if(!before||!action)throw Error("No preceding committed action is available.");const traced=traceAction(before,action,lib);if(signature(traced.state)!==signature(current.state))throw Error("Diagnostic replay diverged; the committed state is unchanged.");setSteps(traced.steps);setIntermediate(null);setMessage("Full original diagnostic capture replayed read-only; no action or account event was submitted.");}catch(e){setMessage(String(e));}}}>Capture full diagnostics for last action</button>
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
      {battleOpen&&session.current&&<LaboratoryBattle session={session.current} onChange={syncSession} onExit={()=>setBattleOpen(false)}/>}
    </section>
  );
}
