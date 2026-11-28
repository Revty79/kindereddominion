import { useState } from "react";
import type { ContentPack, Ruleset, RulesetVersion } from "../content/types";
import type { GameConfig, Player } from "../engine/types";
import { battlefield } from "../engine/config";
import { validateRules } from "../content/validation";
import { Field, Issues, NumberField } from "./components";
export default function Rules({
  content,
  onSave,
  versions=[],onPublish,
}: {
  content: ContentPack;
  versions?:RulesetVersion[];
  onPublish?:(rule:Ruleset)=>Promise<void>;
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
    if(!Number.isInteger(rows)||!Number.isInteger(cols)||rows<1||rows>20||cols<2||cols>30||rows*cols>300){setMessage("Current Studio authoring supports 1–20 rows, 2–30 columns and at most 300 cells. This is an implementation safety boundary, not a permanent ruleset restriction.");return;}
    config({
      battlefield: {
        ...battlefield(
          rows,
          cols,
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
      <section className="studio-subpanel"><h3>Private testing revisions</h3><p>Save the draft first, then publish an immutable private testing revision. This does not approve a hosted competitive ruleset or change an active match.</p><button disabled={!onPublish||!!draft||issues.some(i=>i.severity==="error")} onClick={()=>void onPublish?.(rule).then(()=>setMessage("Private tactical ruleset revision published. Existing scenarios and matches keep their snapshots.")).catch(e=>setMessage(String(e)))}>Publish private ruleset revision</button><ol>{versions.filter(v=>v.id===rule.id).map(v=><li key={v.revision}>Revision {v.revision} · {v.publishedAt} · {v.config.battlefield.rows}×{v.config.battlefield.cols} · {v.config.deckSize}-card deck <button onClick={()=>setDraft({...rule,name:v.name,config:structuredClone(v.config),completion:v.completion})}>Restore revision {v.revision} as draft</button></li>)}</ol></section>
      <details className="studio-subpanel"><summary>All preserved private ruleset revisions</summary><p>This includes rules no longer present in the current draft after backup restoration. Loading a revision creates an editable draft; it cannot rewrite the published entry.</p><ul>{versions.map(v=><li key={v.id+":"+v.revision}>{v.name} · {v.id} revision {v.revision} · {v.config.battlefield.rows}×{v.config.battlefield.cols} · {v.config.deckSize} cards · {v.contentVersion}<button onClick={()=>{setSelected(content.rulesets.some(r=>r.id===v.id)?v.id:"");setDraft({id:v.id,name:v.name,description:"Restored from a preserved private testing revision.",config:structuredClone(v.config),completion:v.completion});}}>Load {v.id} revision {v.revision} as draft</button></li>)}</ul>{!versions.length&&<p>No private ruleset revision has been published in this workspace.</p>}</details>
      <details className="studio-subpanel"><summary>Supported rules and implementation boundaries</summary><p>Current engine: two alternating participants; one action per turn, automatic draw and mandatory single opening exchange, consecutive-pass completion or active-player surrender. Scoring options above are executable engine settings. Collection, mode and copy settings are applied by the existing deck validator; per-card copy limits remain authoritative.</p><p>Studio authoring is currently validated up to 300 tiles, 20 rows and 30 columns. The engine's separate safety ceiling is 1,000 tiles. Larger-board usability and performance need testing; these are not permanent game-design limits.</p><p>Custom turn/victory scripts, arbitrary ruleset-specific card lists, shared teams, registration-order starts and more than two participants require V1.7 engine work. They remain inactive; no custom settings are silently converted to Classic Duel.</p><button disabled>Team and multiplayer settings — engine dependency</button><button disabled>Custom victory or turn rules — engine dependency</button></details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
