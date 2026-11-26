import { mkdir, writeFile } from "node:fs/promises";
import { baselineContent } from "../src/content/baseline";
import { foundingContent } from "../src/content/founding";
import { DEFAULT_CONFIG } from "../src/engine/config";
import {
  deckAnalysis,
  evolutionEdges,
  validatePack,
} from "../src/content/validation";
import { runSimulation } from "../src/simulation/run";
import type { TestDeck } from "../src/content/types";
import type { SimulationReport } from "../src/simulation/types";
const content = foundingContent(baselineContent());
const errors = validatePack(content).filter((i) => i.severity === "error");
if (errors.length) throw new Error(JSON.stringify(errors));
await mkdir(".local/balance", { recursive: true });
await mkdir("docs/balance", { recursive: true });
const reports: { label: string; report: SimulationReport }[] = [];
async function run(
  label: string,
  decks: TestDeck[],
  matches: number,
  scoring: string,
  pairings: "single" | "roundRobin" = "roundRobin",
  free = false,
) {
  let last = 0;
  const report = await runSimulation(
    {
      content,
      decks,
      matches,
      seed: 20261126,
      pairings,
      config: {
        ...structuredClone(DEFAULT_CONFIG),
        scoring,
        mode: free ? "free" : "standard",
      },
      maxActions: 200,
      mirrored: true,
      retainExamples: true,
    },
    {
      progress: (report, total) => {
        if (report.attempted - last >= 100 || report.attempted === total) {
          last = report.attempted;
          console.log(
            `${label}: ${report.attempted}/${total} · ${(report.elapsedMs / 1000).toFixed(1)}s · faults ${report.faults} · timeouts ${report.timeouts}`,
          );
        }
      },
    },
  );
  reports.push({ label, report });
  await writeFile(`.local/balance/${label}.json`, JSON.stringify(report));
  return report;
}
const pure = content.decks.filter((d) => d.collection !== "mixed");
for (const scoring of ["classic", "domination"]) {
  await run(`primary-${scoring}`, pure, 100, scoring);
  await run(`mixed-${scoring}`, content.decks, 10, scoring);
  const extreme = [
    "sprout",
    "embercub",
    "rune-initiate",
    "restless-squire",
    "brass-scout",
  ].map((id) => ({
    id: `extreme-${id}`,
    name: `15 × ${id}`,
    subtitle: "Extreme duplicate experiment",
    strategy: "Free Play stress",
    collection: "mixed",
    cards: Array(15).fill(id),
  }));
  await run(`extreme-${scoring}`, extreme, 10, scoring, "roundRobin", true);
  for (let k = 0; k < pure.length; k++) {
    const starter = pure[k],
      openings = starter.cards
        .filter((id) => {
          const c = content.cards.find((c) => c.id === id)!;
          return c.type === "standard" && c.rank === 1;
        })
        .slice(0, 8);
    const rest = content.cards
      .filter(
        (c) => c.kindred === starter.collection && !openings.includes(c.id),
      )
      .map((c) => c.id);
    for (let v = 0; v < 4; v++) {
      const selected = rest.slice(v * 7, v * 7 + 7);
      const cards = [...openings, ...selected];
      for (const id of rest)
        if (cards.length < 15 && !cards.includes(id)) cards.push(id);
      const deck = {
        ...starter,
        id: `coverage-${k}-${v}`,
        name: `${starter.collection} coverage ${v + 1}`,
        cards,
      };
      await run(
        `coverage-${scoring}-${k}-${v}`,
        [deck, pure[(k + 1) % 5]],
        8,
        scoring,
        "single",
      );
    }
  }
}
const summary = reports.map(({ label, report: r }) => ({
  label,
  contentVersion: r.request.content.id,
  scoring: r.request.config.scoring,
  mode: r.request.config.mode,
  matchesPerPairing: r.request.matches,
  seed: r.request.seed,
  attempted: r.attempted,
  completed: r.completed,
  draws: r.draws,
  timeouts: r.timeouts,
  faults: r.faults,
  invariants: r.invariants,
  loopSafeguards: r.loopSafeguards,
  elapsedMs: r.elapsedMs,
  digest: r.digest,
  first: r.first,
  actions: r.actions,
  scores: r.scores,
  scoreDifference: r.scoreDifference,
  decks: r.decks,
  matchups: r.matchups,
  cards: r.cards,
  failures: r.failures.map(({ replay, ...f }) => f),
}));
await writeFile(
  "docs/balance/V1.2-results.json",
  JSON.stringify(
    {
      engineVersion: "1.1.0",
      contentVersion: content.id,
      conditions:
        "One-ply deterministic development opponent; advisory; alternating starters and mirrored seats; timeouts/faults excluded from competitive results.",
      runs: summary,
    },
    null,
    2,
  ),
);
await writeFile(
  "docs/balance/FOUNDING-CONTENT.json",
  JSON.stringify(content, null, 2),
);
const rows = [
  [
    "run",
    "seat_0_deck",
    "seat_1_deck",
    "completed",
    "seat_0_wins",
    "seat_1_wins",
    "draws",
  ],
];
for (const { label, report } of reports)
  for (const [pair, m] of Object.entries(report.matchups))
    rows.push([
      label,
      ...pair.split(" vs "),
      String(m.completed),
      String(m.wins[0]),
      String(m.wins[1]),
      String(m.draws),
    ]);
await writeFile(
  "docs/balance/V1.2-matchups.csv",
  rows
    .map((row) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(","))
    .join("\r\n"),
);
let markdown =
  "# Founding Kindreds — preliminary balance evidence\n\nAll cards remain provisional. These results describe the current one-ply computer, not expert human balance. No definitions were automatically modified. Full aggregate results and seeds are in `V1.2-results.json`; verbose replay examples are in ignored `.local/balance/` reports.\n\n";
const total = summary.reduce((a, r) => a + r.attempted, 0),
  elapsed = summary.reduce((a, r) => a + r.elapsedMs, 0);
markdown += `Total: **${total} attempted matches** in ${(elapsed / 1000).toFixed(1)} seconds across both scoring rules, pure, same-Kindred, mixed, extreme duplicate and all-card coverage experiments.\n\n`;
for (const { label, report: r } of reports.filter((r) =>
  r.label.startsWith("primary"),
)) {
  markdown += `## ${r.request.config.scoring}\n\n100 matches per unordered primary Kindred pairing, including same-Kindred matches (1,500 matches); balanced starting assignments. First-player wins: ${r.first.wins}/${r.first.games} (${((r.first.wins / r.first.games) * 100).toFixed(1)}%). ${r.draws} draws; ${r.faults} engine faults; ${r.invariants} invariant failures; ${r.timeouts} timeouts.\n\n| Kindred starter | Win rate | Wins / losses / draws | Starts first | Starts second |\n|---|---|---|---|---|\n`;
  for (const d of pure) {
    const s = r.decks[d.id];
    markdown += `| ${d.collection} | ${((s.wins / s.completed) * 100).toFixed(1)}% | ${s.wins} / ${s.losses} / ${s.draws} | ${s.firstWins}/${s.firstGames} | ${s.secondWins}/${s.secondGames} |\n`;
  }
}
const totals: Record<
  string,
  { included: number; played: number; wins: number; losses: number }
> = Object.fromEntries(
  content.cards.map((c) => [
    c.id,
    { included: 0, played: 0, wins: 0, losses: 0 },
  ]),
);
for (const run of summary)
  for (const [id, c] of Object.entries(run.cards)) {
    const target =
      totals[id] ??
      (totals[id] = { included: 0, played: 0, wins: 0, losses: 0 });
    target.included += c.included;
    target.played += c.played;
    target.wins += c.wins;
    target.losses += c.losses;
  }
markdown +=
  "\n## Design review concerns\n\n- Compare pure-deck outliers and first-player effects in the tables above before making changes. Card statistics reflect deck composition, tactical matchups and this particular AI. They do not establish causal strength.\n- Fortification protects only unoccupied territory; it does not directly raise a surviving creature’s score. The computer can undervalue long-term defensive plans. Overthrow is an intentional counter.\n- Replacement and evolution can score on full boards. High-power upgrades and cheap repeated population are important review candidates, especially under Domination.\n- Resurrection retains weakening and lineage limits. A creature defeated by nonpositive power may return and immediately die; this is intentional existing behavior and can make apparent resilience weaker than a card name suggests.\n- Nature’s venom is immediate weakening. No unimplemented ongoing poison status is advertised.\n- Larger-field, human-play and broader strategy search may produce different conclusions.\n\n";
const unplayed = Object.entries(totals).filter(([, s]) => !s.played);
markdown += `All-card coverage: ${Object.values(totals).filter((c) => c.included).length}/150 appeared in tested decks. ${unplayed.length} definitions had no actual placement in these runs: ${unplayed.map(([id]) => id).join(", ") || "none"}. Missing evolution prerequisites and expensive rank requirements are deck-dependent explanations to investigate, not proof of ineffective cards.\n\n`;
const associated = Object.entries(totals)
  .filter(([, s]) => s.wins + s.losses >= 100)
  .sort(
    (a, b) =>
      b[1].wins / (b[1].wins + b[1].losses) -
      a[1].wins / (a[1].wins + a[1].losses),
  )
  .slice(0, 10);
markdown +=
  "Highest inclusion/win associations among sampled cards (review candidates, **not** a strength ranking): " +
  associated
    .map(
      ([id, s]) =>
        `${id}: ${((s.wins / (s.wins + s.losses)) * 100).toFixed(1)}% over ${s.wins + s.losses} non-draw deck-slot associations; played ${s.played}`,
    )
    .join("; ") +
  ".\n";
await writeFile("docs/balance/V1.2-PRELIMINARY-BALANCE.md", markdown);
let catalog =
  "# Founding Kindreds — 150 provisional definitions\n\nFull executable data is in `FOUNDING-CONTENT.json` and the Studio. Each Kindred follows 12 Rank I standards, 7 Rank II standards, 4 Rank III standards, 3 replacements and 4 evolutions; no distribution deviation was needed. Starting decks use 15 different cards and are constructible from one copy of each collection card.\n\n";
for (const collection of content.collections) {
  catalog += `## ${collection.name}\n\n${collection.description}\n\n| Card | ID | Placement / rank | Power | Executable description |\n|---|---|---|---|---|\n`;
  for (const c of content.cards.filter((c) => c.kindred === collection.id))
    catalog += `| ${c.name} | ${c.id} | ${c.type} / ${c.rank} | ${c.power} | ${c.text.replaceAll("|", "/")} |\n`;
  catalog += "\n```mermaid\ngraph LR\n";
  for (const edge of evolutionEdges(content.cards).filter((e) =>
    content.cards.some((c) => c.id === e.to && c.kindred === collection.id),
  ))
    catalog += `  ${edge.from.replaceAll("-", "_")}["${content.cards.find((c) => c.id === edge.from)!.name}"] ${edge.criteria ? "-. classification .->" : "-->"} ${edge.to.replaceAll("-", "_")}["${content.cards.find((c) => c.id === edge.to)!.name}"]\n`;
  catalog += "```\n\n";
}
catalog += "## Starting and mixed decks\n\n";
for (const deck of content.decks)
  catalog += `### ${deck.name}\n\n${deck.strategy}. Collection restriction: ${deck.collection}. Opening options: ${deckAnalysis(deck.cards, content, DEFAULT_CONFIG).openings}.\n\n${deck.cards.join(", ")}.\n\n`;
await writeFile("docs/balance/FOUNDING-CATALOG.md", catalog.trimEnd() + "\n");
console.log(
  `Completed ${total} matches; aggregate evidence written to docs/balance.`,
);
