import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../content/types";
import type { SimulationReport, SimulationRequest } from "../simulation/types";
import { pairings, reportCSV, validateSimulation } from "../simulation/run";
import { download, Field, NumberField } from "./components";
const percent = (n: number, d: number) =>
  d ? `${((n / d) * 100).toFixed(1)}%` : "—";
export default function Simulator({
  workspace,
  onReport,
  onBusy,
}: {
  workspace: Workspace;
  onReport: (r: SimulationReport) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [version, setVersion] = useState("working");
  const content =
    version === "working"
      ? workspace.working
      : workspace.versions.find((v) => v.id === version)!;
  const [decks, setDecks] = useState<string[]>(
    content.decks.slice(0, 2).map((d) => d.id),
  );
  const [rule, setRule] = useState(content.rulesets[0].id),
    [matches, setMatches] = useState(100),
    [seed, setSeed] = useState(20261126),
    [maxActions, setMaxActions] = useState(200),
    [mode, setMode] = useState<"single" | "roundRobin">("single"),
    [mirrored, setMirrored] = useState(true),
    [free, setFree] = useState(false),
    [running, setRunning] = useState(false),
    [saving,setSaving]=useState(false),[saveFailed,setSaveFailed]=useState(false),
    [report, setReport] = useState<SimulationReport | null>(null),
    [total, setTotal] = useState(0),
    [error, setError] = useState("");
  const worker = useRef<Worker | null>(null),
    lastSaved = useRef(0);
  const saveRef = useRef(onReport);
  saveRef.current = onReport;
  useEffect(
    () => () => {
      worker.current?.terminate();
      onBusy(false);
    },
    [],
  );
  async function saveFinal(value:SimulationReport){setSaving(true);setSaveFailed(false);try{await saveRef.current(value);setError("");}catch(e){setSaveFailed(true);setError(`Final report save failed: ${String(e)}. Keep this page open, retry saving or export the current results.`);}finally{setSaving(false);setRunning(false);onBusy(false);worker.current?.terminate();}}
  function run() {
    try {
      const selectedRule =
        content.rulesets.find((r) => r.id === rule) ?? content.rulesets[0];
      const request: SimulationRequest = {
        content: structuredClone(content),
        decks: content.decks
          .filter((d) => decks.includes(d.id))
          .slice(0, mode === "single" ? 2 : 20),
        pairings: mode,
        matches,
        seed,
        maxActions,
        mirrored,
        retainExamples: true,
        config: {
          ...structuredClone(selectedRule.config),
          mode: free ? "free" : selectedRule.config.mode,
        },
      };
      validateSimulation(request);
      setError("");setSaving(false);setSaveFailed(false);
      setTotal(pairings(request).length * matches);
      setRunning(true);
      onBusy(true);
      lastSaved.current = performance.now();
      worker.current = new Worker(
        new URL("../simulation/worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current.onmessage = (event) => {
        const data = event.data;
        if (data.type === "error") {
          setError(data.error);
          setRunning(false);
          onBusy(false);
          worker.current?.terminate();
          return;
        }
        if (data.report) {
          setReport(data.report);
          if(data.type==="done"){void saveFinal(data.report);return;}
          if(performance.now()-lastSaved.current>2000){lastSaved.current=performance.now();void saveRef.current(data.report).catch(e=>setError(`Partial report save failed: ${String(e)}`));}

        }
      };
      worker.current.onerror = (event) => {
        setError(event.message);
        setRunning(false);
        onBusy(false);
        worker.current?.terminate();
      };
      worker.current.postMessage({ type: "run", request });
    } catch (e) {
      setError(String(e));
    }
  }
  function selectReport(id: string) {
    const r = workspace.reports.find((r) => r.id === id);
    if (r) {
      setReport(r);setSaveFailed(false);
      setTotal(pairings(r.request).length * r.request.matches);
    }
  }
  return (
    <section>
      <h2>Match simulator & balance dashboard</h2>
      <p>
        Real engine, current one-ply development opponent. Statistics are
        advisory, with sample sizes and conditions shown. No card is modified
        automatically.
      </p>
      <div className="studio-grid three">
        <Field label="Simulation content version">
          <select
            disabled={running}
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              const c =
                e.target.value === "working"
                  ? workspace.working
                  : workspace.versions.find((v) => v.id === e.target.value)!;
              setDecks(c.decks.slice(0, 2).map((d) => d.id));
              setRule(c.rulesets[0].id);
            }}
          >
            <option value="working">Current working draft snapshot</option>
            {workspace.versions
              .filter((v) => v.kind !== "archived")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Simulation ruleset">
          <select
            disabled={running}
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          >
            {content.rulesets.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.config.battlefield.rows}×
                {r.config.battlefield.cols}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Simulation pairing mode">
          <select
            disabled={running}
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="single">First two selected decks</option>
            <option value="roundRobin">
              Round robin, including same-deck matches
            </option>
          </select>
        </Field>
        <Field label="Match-count preset">
          <select
            disabled={running}
            value={String(matches)}
            onChange={(e) => setMatches(Number(e.target.value))}
          >
            {[10, 100, 1000, 10000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()} per pairing
              </option>
            ))}
          </select>
        </Field>
        <NumberField
          label="Reproducible simulation seed"
          min={0}
          max={4294967295}
          value={seed}
          onChange={setSeed}
        />
        <NumberField
          label="Simulation action ceiling"
          min={1}
          max={2000}
          value={maxActions}
          onChange={setMaxActions}
        />
        <label className="studio-check">
          <input
            disabled={running}
            type="checkbox"
            checked={mirrored}
            onChange={(e) => setMirrored(e.target.checked)}
          />
          Mirrored seats, alternating starting players
        </label>
        <label className="studio-check">
          <input
            disabled={running}
            type="checkbox"
            checked={free}
            onChange={(e) => setFree(e.target.checked)}
          />
          Free Play duplicate testing
        </label>
      </div>
      <fieldset className="studio-deck-selection">
        <legend>Select test decks (2–20)</legend>
        {content.decks.map((d) => (
          <label className="studio-check" key={d.id}>
            <input
              type="checkbox"
              disabled={running}
              checked={decks.includes(d.id)}
              onChange={(e) =>
                setDecks(
                  e.target.checked
                    ? [...decks, d.id]
                    : decks.filter((id) => id !== d.id),
                )
              }
            />
            {d.name}
          </label>
        ))}
      </fieldset>
      <div className="studio-actions">
        <button className="primary" disabled={running} onClick={run}>
          Run headless matches
        </button>
        <button
          disabled={!running||saving}
          onClick={() => worker.current?.postMessage({ type: "cancel" })}
        >
          Cancel simulation and preserve results
        </button>
        <Field label="Saved simulation report">
          <select
            disabled={running}
            value=""
            onChange={(e) => selectReport(e.target.value)}
          >
            <option value="">Open previous results</option>
            {workspace.reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.attempted} attempted
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && (
        <p role="alert" className="issue-error">
          {error}
        </p>
      )}
      {saveFailed&&report&&<button onClick={()=>void saveFinal(report)} disabled={saving}>Retry saving report</button>}
      {report && (
        <>
          <div className="simulation-progress" role="status">
            <progress value={report.attempted} max={total || 1} />
            <p>
              {report.attempted.toLocaleString()} / {total.toLocaleString()}{" "}
              attempted · {report.completed} completed ·{" "}
              {(report.elapsedMs / 1000).toFixed(1)} seconds ·{" "}
              {saving?"Saving completed results":saveFailed?"Report save failed":report.cancelled
                ? "Cancelled; partial results retained"
                : running
                  ? "Running in a Web Worker"
                  : report.attempted < total
                    ? "Interrupted / partial"
                    : "Finished"}
            </p>
          </div>
          <p>
            Version {report.request.content.id} ·{" "}
            {report.request.config.scoring} · seed {report.request.seed} ·
            digest <code>{report.digest}</code> ·{" "}
            {report.request.config.battlefield.rows}×
            {report.request.config.battlefield.cols}. Re-run identical inputs to
            compare this deterministic digest; elapsed time is excluded.
          </p>
          <div className="studio-metrics">
            <div>
              <b>{report.completed}</b>
              <span>Legitimate completions</span>
            </div>
            <div>
              <b>{report.draws}</b>
              <span>Legitimate draws</span>
            </div>
            <div>
              <b>{report.timeouts}</b>
              <span>Simulation timeouts</span>
            </div>
            <div>
              <b>
                {report.faults} / {report.invariants}
              </b>
              <span>Engine faults / invariant failures</span>
            </div>
            <div>
              <b>{report.loopSafeguards}</b>
              <span>Loop safeguards</span>
            </div>
            <div>
              <b>{percent(report.first.wins, report.first.games)}</b>
              <span>
                First-player wins / {report.first.games} completed games
              </span>
            </div>
            <div>
              <b>
                {report.completed
                  ? (report.actions.sum / report.completed).toFixed(1)
                  : "—"}{" "}
                · {report.actions.min}–{report.actions.max}
              </b>
              <span>Mean / min–max actions</span>
            </div>
            <div>
              <b>
                {report.completed
                  ? report.scores
                      .map((s) => (s / report.completed).toFixed(1))
                      .join(" / ")
                  : "—"}
              </b>
              <span>Average final score by seat</span>
            </div>
            <div>
              <b>
                {report.completed
                  ? (report.scoreDifference / report.completed).toFixed(1)
                  : "—"}
              </b>
              <span>Mean absolute score difference</span>
            </div>
          </div>
          <p>
            Completion reasons:{" "}
            {Object.entries(report.reasons)
              .map(([id, count]) => `${id}: ${count}`)
              .join(", ") || "None"}
            . Faults, timeouts and cancellation are excluded from competitive
            win-rate denominators.
          </p>
          <div className="studio-actions">
            <button
              onClick={() =>
                download(`${report.id}.json`, {
                  format: "kindred-dominion-studio",
                  schema: 1,
                  engineVersion: report.engineVersion,
                  type: "reports",
                  exportedAt: new Date().toISOString(),
                  data: [report],
                })
              }
            >
              Export simulation JSON
            </button>
            <button
              onClick={() =>
                download(`${report.id}.csv`, reportCSV(report), "text/csv")
              }
            >
              Export deck statistics CSV
            </button>
          </div>
          <div className="studio-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Deck</th>
                  <th>Completed / attempted</th>
                  <th>W / L / D</th>
                  <th>Win rate</th>
                  <th>Starting first</th>
                  <th>Starting second</th>
                  <th>Mean score</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.decks).map(([id, d]) => (
                  <tr key={id}>
                    <td>
                      {report.request.decks.find((x) => x.id === id)?.name ??
                        id}
                    </td>
                    <td>
                      {d.completed} / {d.attempted}
                    </td>
                    <td>
                      {d.wins} / {d.losses} / {d.draws}
                    </td>
                    <td>{percent(d.wins, d.completed)}</td>
                    <td>
                      {percent(d.firstWins, d.firstGames)} (n={d.firstGames})
                    </td>
                    <td>
                      {percent(d.secondWins, d.secondGames)} (n={d.secondGames})
                    </td>
                    <td>
                      {d.completed ? (d.score / d.completed).toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="studio-subpanel">
            <summary>Matchup statistics</summary>
            <table>
              <thead>
                <tr>
                  <th>Seats</th>
                  <th>Completed</th>
                  <th>Seat wins</th>
                  <th>Draws</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.matchups).map(([id, m]) => (
                  <tr key={id}>
                    <td>{id}</td>
                    <td>{m.completed}</td>
                    <td>{m.wins.join(" / ")}</td>
                    <td>{m.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details className="studio-subpanel">
            <summary>
              Card statistics: inclusion, actual play and association
            </summary>
            <p>
              Included counts deck slots across attempts. Played includes
              normal, generated and evolution placements; resurrected placements
              are separate. Evolved counts previous forms entering stacks.
              Territory counts actual logged influence changes. Wins/losses are
              deck-inclusion associations, not causal measures of strength.
            </p>
            <div className="studio-table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      "Card",
                      "Included",
                      "Drawn",
                      "Played",
                      "Sacrificed",
                      "Evolved",
                      "Destroyed",
                      "Resurrected",
                      "Abilities",
                      "Territory events",
                      "Win / loss association",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.cards).map(([id, c]) => (
                    <tr key={id}>
                      <td>
                        {report.request.content.cards.find(
                          (card) => card.id === id,
                        )?.name ?? id}
                      </td>
                      {[
                        c.included,
                        c.drawn,
                        c.played,
                        c.replaced,
                        c.evolved,
                        c.destroyed,
                        c.resurrected,
                        c.abilities,
                        c.territory,
                        `${c.wins} / ${c.losses}`,
                      ].map((v, i) => (
                        <td key={i}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="studio-subpanel">
            <summary>
              Failure diagnostics and reproducible seeds (
              {report.failures.length})
            </summary>
            {report.failures.map((f, i) => (
              <div key={i}>
                <p>
                  Seed {f.seed} · {f.pairing.join(" vs ")} · Player{" "}
                  {f.starter + 1} starts · {f.status} · {f.error}
                </p>
                <p>
                  Replay retained:{" "}
                  {f.replay
                    ? "yes"
                    : "no; reproduce with the report inputs and seed schedule"}
                </p>
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
