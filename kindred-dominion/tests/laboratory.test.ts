import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  laboratoryContent,
  laboratoryScenarios,
} from "../src/content/laboratory";
import { baselineContent, initialWorkspace } from "../src/content/baseline";
import {
  exportTransfer,
  parseTransfer,
  applyImport,
} from "../src/content/transfer";
import { foundingContent } from "../src/content/founding";
import { validatePack, libraryOf } from "../src/content/validation";
import { validateScenario } from "../src/sandbox/scenario";
import { act, assertInvariants, legalPlays } from "../src/engine/game";
import { DEFAULT_CONFIG } from "../src/engine/config";
import { runSimulation } from "../src/simulation/run";
import {
  appendRecord,
  newRecord,
  replayAt,
  validateRecord,
} from "../src/replay/record";

it("keeps the advanced laboratory separate from the original 30 and preserved 150 provisional cards", () => {
  const lab = laboratoryContent();
  expect(lab.cards.length).toBeGreaterThanOrEqual(30);
  expect(lab.cards.every((c) => c.id.startsWith("lab-"))).toBe(true);
  expect(validatePack(lab).filter((i) => i.severity === "error")).toEqual([]);
  expect(baselineContent().cards).toHaveLength(30);
  expect(foundingContent(baselineContent()).cards).toHaveLength(150);
});
it("preserves the complete serialized V1.2 comparison library, including descriptions and metadata", () => {
  expect(foundingContent(baselineContent())).toEqual(
    JSON.parse(readFileSync("docs/balance/FOUNDING-CONTENT.json", "utf8")),
  );
});
it("labels mixed backups with the advanced engine without upgrading or replacing their old working draft", () => {
  const w = initialWorkspace();
  w.versions.push(laboratoryContent());
  const transfer = exportTransfer(w, "backup");
  expect(transfer.engineVersion).toBe("1.3.0");
  const restored = applyImport(
    initialWorkspace(),
    parseTransfer(JSON.stringify(transfer)),
    "replace",
  );
  expect(restored.working).toEqual(w.working);
  expect(restored.working.engineVersion).toBe("1.1.0");
  expect(restored.activeVersion).toBe("v1.1-baseline");
  expect(restored.versions.at(-1)!.engineVersion).toBe("1.3.0");
});
it.each(laboratoryScenarios().map((s) => [s.name, s] as const))(
  "%s is valid, executable and replayable",
  (_, s) => {
    expect(validateScenario(s).filter((i) => i.severity === "error")).toEqual(
      [],
    );
    const library = libraryOf(s.content),
      plays = legalPlays(s.state, library);
    expect(plays.length).toBeGreaterThan(0);
    const next = act(s.state, plays[0], library);
    expect(next.fault).toBeNull();
    expect(() => assertInvariants(next, library)).not.toThrow();
    const record = appendRecord(
      newRecord(s.state, library, [[], []], s.content.id),
      plays[0],
      next,
    );
    expect(() => validateRecord(record)).not.toThrow();
    expect(replayAt(record, 1).state).toEqual(next);
  },
);
it("reproduces advanced worker-ready simulations with immutable sample replay records", async () => {
  const content = laboratoryContent(),
    request = {
      content,
      decks: content.decks.slice(0, 2),
      config: structuredClone(DEFAULT_CONFIG),
      seed: 13026,
      matches: 6,
      pairings: "single" as const,
      maxActions: 200,
      mirrored: true,
      retainExamples: true,
    };
  const a = await runSimulation(request),
    b = await runSimulation(request);
  expect(a.completed).toBe(6);
  expect(a.faults + a.timeouts + a.invariants).toBe(0);
  expect(a.digest).toBe(b.digest);
  expect(a.cards).toEqual(b.cards);
  for (const ex of a.examples)
    if (ex.replay) expect(() => validateRecord(ex.replay)).not.toThrow();
}, 120000);
