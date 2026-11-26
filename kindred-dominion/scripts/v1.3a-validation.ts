import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { baselineContent } from "../src/content/baseline";
import { foundingContent } from "../src/content/founding";
import {
  laboratoryContent,
  laboratoryScenarios,
} from "../src/content/laboratory";
import { battlefield, DEFAULT_CONFIG } from "../src/engine/config";
import { runSimulation } from "../src/simulation/run";
import { validateRecord } from "../src/replay/record";
import { validatePack } from "../src/content/validation";
import type { ContentPack, TestDeck } from "../src/content/types";
import type { SimulationReport } from "../src/simulation/types";
const mode = process.argv.includes("--regression")
  ? "regression"
  : process.argv.includes("--laboratory")
    ? "laboratory"
    : "all";
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
await mkdir(".local/v1.3a", { recursive: true });
const receiptDirectory = process.argv.find(a => a.startsWith("--output="))?.slice(9) ?? "docs/v1.3a";
await mkdir(receiptDirectory, { recursive: true });
const canonical = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const concise = (label: string, r: SimulationReport) => ({
  label,
  engineVersion: r.engineVersion,
  contentVersion: r.request.content.id,
  seed: r.request.seed,
  matchesPerPairing: r.request.matches,
  config: r.request.config,
  decks: r.request.decks.map((d) => ({ id: d.id, cards: d.cards })),
  attempted: r.attempted,
  completed: r.completed,
  draws: r.draws,
  faults: r.faults,
  timeouts: r.timeouts,
  invariants: r.invariants,
  loopSafeguards: r.loopSafeguards,
  digest: r.digest,
  elapsedMs: r.elapsedMs,
  first: r.first,
  actions: r.actions,
  scores: r.scores,
  cards: r.cards,
  matchups: r.matchups,
  failures: r.failures.map(({ replay, ...f }) => f),
});
async function run(
  label: string,
  content: ContentPack,
  decks: TestDeck[],
  matches: number,
  config = structuredClone(DEFAULT_CONFIG),
  pairings: "single" | "roundRobin" = "single",
) {
  let last = 0;
  const report = await runSimulation(
    {
      content,
      decks,
      matches,
      config,
      seed: mode === "regression" ? 20261126 : 130202611,
      pairings,
      maxActions: 200,
      mirrored: true,
      retainExamples: true,
    },
    {
      progress: (r, total) => {
        if (r.attempted - last >= 25 || r.attempted === total) {
          last = r.attempted;
          console.log(
            `${label}: ${r.attempted}/${total}; ${r.faults} faults, ${r.timeouts} timeouts, ${r.invariants} invariants`,
          );
        }
      },
    },
  );
  for (const ex of [...report.examples, ...report.failures])
    if (ex.replay) validateRecord(ex.replay);
  await writeFile(`.local/v1.3a/${label}.json`, JSON.stringify(report));
  return report;
}
if (mode === "regression" || mode === "all") {
  const content = foundingContent(baselineContent()),
    original = JSON.parse(
      await readFile("docs/balance/V1.2-results.json", "utf8"),
    );
  if (
    canonical(content) !==
    canonical(
      JSON.parse(await readFile("docs/balance/FOUNDING-CONTENT.json", "utf8")),
    )
  )
    throw new Error(
      "Preserved V1.2 definitions differ from their recorded baseline.",
    );
  const pure = content.decks.filter((d) => d.collection !== "mixed"),
    rows: any[] = [];
  async function compare(
    label: string,
    decks: TestDeck[],
    matches: number,
    scoring: string,
    pairings: "single" | "roundRobin" = "roundRobin",
    free = false,
  ) {
    const previous = original.runs.find((r: any) => r.label === label);
    if (!previous) throw new Error(`Missing baseline ${label}.`);
    // The historical run used this exact seed even when both validation modes are requested.
    let last = 0;
    const actual = await runSimulation(
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
        progress: (r, total) => {
          if (r.attempted - last >= 100 || r.attempted === total) {
            last = r.attempted;
            console.log(`${label}: ${r.attempted}/${total}`);
          }
        },
      },
    );
    const fields = [
      "digest",
      "attempted",
      "completed",
      "draws",
      "faults",
      "timeouts",
      "invariants",
      "loopSafeguards",
      "first",
      "actions",
      "scores",
      "scoreDifference",
      "decks",
      "cards",
      "matchups",
    ];
    const differences = fields.filter(
      (key) => canonical((actual as any)[key]) !== canonical(previous[key]),
    );
    rows.push({
      label,
      matches: actual.attempted,
      digest: actual.digest,
      expectedDigest: previous.digest,
      identical: differences.length === 0,
      differences,
      completed: actual.completed,
      draws: actual.draws,
      faults: actual.faults,
      timeouts: actual.timeouts,
      invariants: actual.invariants,
    });
    await writeFile(
      `.local/v1.3a/regression-${label}.json`,
      JSON.stringify(actual),
    );
  }
  for (const scoring of ["classic", "domination"]) {
    await compare(`primary-${scoring}`, pure, 100, scoring);
    await compare(`mixed-${scoring}`, content.decks, 10, scoring);
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
    await compare(
      `extreme-${scoring}`,
      extreme,
      10,
      scoring,
      "roundRobin",
      true,
    );
    for (let k = 0; k < pure.length; k++) {
      const starter = pure[k],
        openings = starter.cards
          .filter((id) => {
            const c = content.cards.find((c) => c.id === id)!;
            return c.type === "standard" && c.rank === 1;
          })
          .slice(0, 8),
        rest = content.cards
          .filter(
            (c) => c.kindred === starter.collection && !openings.includes(c.id),
          )
          .map((c) => c.id);
      for (let v = 0; v < 4; v++) {
        const cards = [...openings, ...rest.slice(v * 7, v * 7 + 7)];
        for (const id of rest)
          if (cards.length < 15 && !cards.includes(id)) cards.push(id);
        await compare(
          `coverage-${scoring}-${k}-${v}`,
          [
            {
              ...starter,
              id: `coverage-${k}-${v}`,
              name: `${starter.collection} coverage ${v + 1}`,
              cards,
            },
            pure[(k + 1) % 5],
          ],
          8,
          scoring,
          "single",
        );
      }
    }
  }
  const result = {
    baselineCommit: "96d85f74a0b37664c1a7cc68ab6cd465c2f33a9f",
    sourceCommit,
    attempted: rows.reduce((n, r) => n + r.matches, 0),
    allIdentical: rows.every((r) => r.identical),
    runs: rows,
  };
  await writeFile(
    `${receiptDirectory}/REGRESSION.json`,
    JSON.stringify(result, null, 2) + "\n",
  );
  if (!result.allIdentical) process.exitCode = 1;
}
if (mode === "laboratory" || mode === "all") {
  const content = laboratoryContent(),
    errors = validatePack(content).filter((i) => i.severity === "error");
  if (errors.length) throw new Error(JSON.stringify(errors));
  const reports: ReturnType<typeof concise>[] = [];
  for (const scoring of ["classic", "domination"])
    for (const [rows, cols] of [
      [3, 5],
      [4, 8],
    ])
      for (const free of [false, true])
        for (const pair of [
          [0, 1],
          [2, 3],
        ]) {
          const label = `advanced-${scoring}-${rows}x${cols}-${free ? "free" : "standard"}-${pair.join("-")}`;
          const config = {
            ...structuredClone(DEFAULT_CONFIG),
            scoring,
            mode: free ? ("free" as const) : ("standard" as const),
            battlefield: battlefield(rows, cols),
          };
          reports.push(
            concise(
              label,
              await run(
                label,
                content,
                pair.map((i) => content.decks[i]),
                50,
                config,
              ),
            ),
          );
        }
  const extreme = (id: string): TestDeck => ({
    id: `extreme-${id}`,
    name: `15 × ${id}`,
    subtitle: "Development stress fixture",
    strategy: "Free Play duplicates",
    collection: "mixed",
    cards: Array(15).fill(`lab-${id}`),
  });
  for (const scoring of ["classic", "domination"])
    for (const [idA, idB, rows, cols] of [
      ["bee", "basilisk", 3, 5],
      ["echo", "gift", 4, 8],
      ["grave", "reaper", 3, 5],
      ["grave", "reaper", 4, 8],
    ] as const) {
      const label = `advanced-extreme-${scoring}-${idA}-${idB}-${rows}x${cols}`;
      reports.push(
        concise(
          label,
          await run(label, content, [extreme(idA), extreme(idB)], 50, {
            ...structuredClone(DEFAULT_CONFIG),
            scoring,
            mode: "free",
            battlefield: battlefield(rows, cols),
          }),
        ),
      );
    }
  const totals = {
    attempted: 0,
    completed: 0,
    draws: 0,
    faults: 0,
    timeouts: 0,
    invariants: 0,
    loopSafeguards: 0,
  };
  for (const r of reports)
    for (const key of Object.keys(totals) as (keyof typeof totals)[])
      totals[key] += r[key];
  await writeFile(
    `${receiptDirectory}/LABORATORY-RESULTS.json`,
    JSON.stringify(
      {
        engineVersion: "1.3.0",
        sourceCommit,
        scope: "Development fixtures; no commercial balancing",
        totals,
        runs: reports,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    `${receiptDirectory}/LABORATORY-CONTENT.json`,
    JSON.stringify(content, null, 2) + "\n",
  );
  await writeFile(
    `${receiptDirectory}/LABORATORY-SCENARIOS.json`,
    JSON.stringify(
      laboratoryScenarios().map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        contentVersion: s.content.id,
        state: s.state,
      })),
      null,
      2,
    ) + "\n",
  );
  if (
    totals.faults ||
    totals.invariants ||
    totals.timeouts ||
    totals.completed < 1000
  )
    process.exitCode = 1;
}
