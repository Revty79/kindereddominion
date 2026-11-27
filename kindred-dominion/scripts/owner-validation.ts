import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { ownerContent, artworkProductionManifest, collectibleRegistry } from "../src/content/owner";
import { executeOwnerCardScenario } from "../tests/helpers/owner-scenarios";
import { runSimulation } from "../src/simulation/run";
import { DEFAULT_CONFIG } from "../src/engine/config";
import { legalPlays } from "../src/engine/game";
import { libraryOf } from "../src/content/validation";
import { replayAt, signature, validateRecord } from "../src/replay/record";
import type { GameState, Player } from "../src/engine/types";
import type { TestDeck } from "../src/content/types";
import type { SimulationReport } from "../src/simulation/types";

const scoring = process.argv.find(a => a.startsWith("--scoring="))?.split("=")[1] ?? "classic";
if (!["classic", "domination"].includes(scoring)) throw new Error("Use --scoring=classic or --scoring=domination.");
const smoke = process.argv.includes("--smoke"), content = ownerContent(), library = libraryOf(content);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const directory = process.argv.find(a=>a.startsWith("--output="))?.slice(9) ?? (smoke ? ".local/v1.3bc-smoke" : "docs/v1.3bc");
await mkdir(directory, { recursive: true }); await mkdir(".local/v1.3bc", { recursive: true });
const write = (name: string, value: unknown) => writeFile(`${directory}/${name}`, JSON.stringify(value, null, 2) + "\n");

if (scoring === "classic" && !smoke) {
  await write("OWNER-CATALOG.json", content);
  await write("COLLECTIBLE-REGISTRY.json", collectibleRegistry());
  await write("ARTWORK-PRODUCTION-MANIFEST.json", artworkProductionManifest());
  const tags = [...new Set(content.cards.flatMap(c => c.tags))].sort();
  await write("CLASSIFICATIONS.json", Object.fromEntries(tags.map(tag => [tag, content.cards.filter(c => c.tags.includes(tag)).map(c => c.collectible!.number)])));
  const scenarios = content.cards.map(card => {
    const r = executeOwnerCardScenario(card.id);
    return { collectibleNumber: card.collectible!.number, cardId: card.id, name: card.name, status: "passed", initialSignature: signature(r.initial), finalSignature: signature(r.final), sourceLocation: r.final.cards[r.source].location, sourceActivations: r.final.cards[r.source].activations, actions: r.record.actions, replayVerified: true };
  });
  await write("INDIVIDUAL-CARD-VALIDATION.json", { sourceCommit, fixtures: "Declared test drivers, separate from official owner collection", passed: scenarios.length, scenarios });
  const diagrams = content.collections.map(k => `## ${k.name}\n\n\`\`\`mermaid\ngraph LR\n${content.cards.filter(c => c.kindred === k.id && c.prerequisite?.definitions).flatMap(c => c.prerequisite!.definitions!.map(p => `  ${p}["${library[p].collectible!.number} ${library[p].name}"] --> ${c.id}["${c.collectible!.number} ${c.name}"]`)).join("\n")}\n\`\`\`\n`).join("\n");
  await writeFile(`${directory}/EVOLUTION-RELATIONSHIPS.md`, `# Owner-designed evolution relationships\n\nEach arrow is an allowed alternative predecessor. Inactive stages do not keep their passive effects.\n\n${diagrams}`);
}
const reports: any[] = [];
const openings: Record<string, { hands: number; initialPlayable: number; afterMulliganPlayable: number; initialPlayableCards: number }> = {};
const evolution = { drawnInstances: 0, playedDrawnInstances: 0, actions: 0 };
const changes = { permanent: 0, aura: 0, dynamic: 0, triggeredAbilities: 0 };
const opening = (state: GameState, p: Player) => new Set(legalPlays({ ...state, phase: "playing", active: p }, library, p).map(a => a.card)).size;

async function run(label: string, decks: TestDeck[], matches: number, free = false, pairings: "single" | "roundRobin" = "roundRobin") {
  let last = 0;
  const report = await runSimulation({ content, decks, matches, seed: 1320261126, config: { ...structuredClone(DEFAULT_CONFIG), scoring, mode: free ? "free" : "standard" }, maxActions: 300, mirrored: true, retainExamples: true, pairings }, {
    progress: (r, total) => { if (r.attempted - last >= 50 || r.attempted === total) { last = r.attempted; console.log(`${label}: ${r.attempted}/${total}; ${r.faults} faults, ${r.timeouts} timeouts, ${r.invariants} invariants`); } },
    onMatch: (summary, _, final) => {
      const record = summary.replay; if (!record || !final) return;
      const post = record.actions.length >= 2 ? replayAt(record, 2).state : record.initialState;
      for (const p of [0, 1] as const) {
        const id = summary.pairing[p], metric = openings[id] ??= { hands: 0, initialPlayable: 0, afterMulliganPlayable: 0, initialPlayableCards: 0 };
        metric.hands++; const available = opening(record.initialState, p); metric.initialPlayable += Number(available > 0); metric.initialPlayableCards += available; metric.afterMulliganPlayable += Number(opening(post, p) > 0);
      }
      const drawn = new Set([...record.initialState.players.flatMap(p => p.hand), ...final.events.filter(e => e.type === "card-change" && e.text.endsWith("drawn.") && e.card).map(e => e.card!)]);
      const evolved = final.events.filter(e => e.type === "evolution" && !e.text.includes("resurrected") && e.card).map(e => e.card!);
      const evolutionDrawn = [...drawn].filter(id => final.cards[id] && library[final.cards[id].definitionId].type === "evolution");
      evolution.drawnInstances += evolutionDrawn.length; evolution.playedDrawnInstances += evolutionDrawn.filter(id => evolved.includes(id)).length; evolution.actions += evolved.length;
      for (const event of final.events) {
        if (event.type === "ability") changes.triggeredAbilities++;
        if (event.change?.permanent) changes.permanent++; if (event.change?.continuous) changes.aura++; if (event.change?.dynamic) changes.dynamic++;
      }
    },
  });
  for (const s of [...report.examples, ...report.failures]) if (s.replay) validateRecord(s.replay);
  await writeFile(`.local/v1.3bc/${label}${smoke ? "-smoke" : ""}.json`, JSON.stringify(report));
  const { examples, failures, request, ...metrics } = report;
  reports.push({ label, request: { contentVersion: request.content.id, decks: request.decks, config: request.config, matches, seed: request.seed, pairings, mirrored: true, maxActions: request.maxActions }, ...metrics, failures: failures.map(({ replay, ...r }) => r), examples: examples.map(({ replay, ...r }) => r) });
}
const pure = content.decks.filter(d => d.collection !== "mixed");
await run(`primary-${scoring}`, pure, smoke ? 2 : 100);
if (!smoke) {
  await run(`mixed-${scoring}`, content.decks, 10);
  const extreme = ["n005", "m009", "a003", "u005", "c001"].map(id => ({ id: `extreme-${id}`, name: `15 × ${library[id].name}`, subtitle: "Extreme duplicate Free Play fixture", strategy: "Stress; not a recommended commercial deck", collection: "mixed", cards: Array(15).fill(id) }));
  await run(`extreme-${scoring}`, extreme, 10, true);
  for (const [a, b] of [["u002", "n006"], ["u005", "n006"]]) {
    const decks = [a, b].map(id => ({ ...extreme[0], id: `focused-${id}`, name: `15 × ${library[id].name}`, cards: Array(15).fill(id) }));
    await run(`bounded-death-generation-${scoring}-${a}`, decks, 20, true, "single");
  }
  for (let k = 0; k < pure.length; k++) {
    const starter = pure[k], openings = starter.cards.filter(id => library[id].rank === 1 && library[id].type === "standard").slice(0, 8), rest = content.cards.filter(c => c.kindred === starter.collection && !openings.includes(c.id)).map(c => c.id);
    for (let v = 0; v < 4; v++) {
      const cards = [...openings, ...rest.slice(v * 7, v * 7 + 7)]; for (const id of rest) if (cards.length < 15 && !cards.includes(id)) cards.push(id);
      await run(`coverage-${scoring}-${k}-${v}`, [{ ...starter, id: `coverage-${k}-${v}`, name: `${starter.collection} coverage ${v + 1}`, cards }, pure[(k + 1) % 5]], 8, false, "single");
    }
  }
  const mythical = pure.find(d => d.collection === "Mythical")!;
  await run(`phoenix-experimental-${scoring}`, [{ ...mythical, id: "experiment-second-firebird", name: "Experiment · two Firebirds", strategy: "Separately labelled alternative: replace M006 with a second M003; preserves the supplied starter", cards: mythical.cards.map(id => id === "m006" ? "m003" : id) }, mythical], 30, false, "single");
}
const totals = { attempted: 0, completed: 0, draws: 0, faults: 0, timeouts: 0, invariants: 0, loopSafeguards: 0 };
for (const report of reports) for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += report[key];
await write(`BALANCE-${scoring.toUpperCase()}.json`, { sourceCommit, contentVersion: content.id, engineVersion: content.engineVersion, scoring, smoke, totals, openings, evolution, effectObservations: changes, runs: reports });
if (totals.faults || totals.timeouts || totals.invariants) process.exitCode = 1;
console.log(JSON.stringify({ scoring, smoke, totals, evolution }));
