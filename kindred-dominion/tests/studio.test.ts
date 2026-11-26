import { describe, expect, it } from "vitest";
import {
  baselineContent,
  defaultMetadata,
  initialWorkspace,
} from "../src/content/baseline";
import {
  activateVersion,
  checkpoint,
  compareContent,
  duplicateCard,
  restoreDraft,
  saveCard,
} from "../src/content/operations";
import {
  applyImport,
  exportTransfer,
  parseTransfer,
  validateWorkspace,
} from "../src/content/transfer";
import {
  deckAnalysis,
  evolutionEdges,
  libraryOf,
  validateCard,
  validatePack,
  validateRules,
} from "../src/content/validation";
import { act, cellAt, createMatch } from "../src/engine/game";
import { DEFAULT_CONFIG } from "../src/engine/config";
import { describeAbility, EFFECTS, TRIGGERS } from "../src/engine/registry";
import { CARD_LIST, CARDS } from "../src/data/cards";
import { DECKS } from "../src/data/decks";
import {
  appendRecord,
  newRecord,
  replayAt,
  signature,
  traceAction,
  validateRecord,
} from "../src/replay/record";
import {
  addInstance,
  addStackForm,
  emptyScenario,
  removeInstance,
  validateScenario,
} from "../src/sandbox/scenario";
import {
  aggregateMatch,
  pairings,
  reportCSV,
  runOne,
  runSimulation,
} from "../src/simulation/run";
import type { SimulationRequest } from "../src/simulation/types";
import type { Action, CardDefinition } from "../src/engine/types";
import golden from "./fixtures/v1.1-golden.json";
const pack = () => baselineContent();
const errors = (issues: ReturnType<typeof validatePack>) =>
  issues.filter((i) => i.severity === "error");
const request = (matches = 2): SimulationRequest => ({
  content: pack(),
  decks: pack().decks.slice(0, 2),
  pairings: "single",
  matches,
  seed: 1234,
  config: structuredClone(DEFAULT_CONFIG),
  maxActions: 200,
  mirrored: true,
  retainExamples: true,
});
function draftCard(id = "test-sentinel"): CardDefinition {
  return {
    id,
    name: "Test Sentinel",
    kindred: "Nature",
    rank: 1,
    power: 2,
    type: "standard",
    tags: ["test"],
    glyph: "◇",
    text: "Supplementary test text.",
    influence: [{ x: 1, y: 0, mechanic: "expansion", amount: 1 }],
    abilities: [
      {
        id: `${id}-rally`,
        trigger: "placement",
        effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        limit: { perEvent: 1, perMatch: 1 },
      },
    ],
  };
}
describe("immutable baseline and real engine compatibility", () => {
  it("preserves original definitions and four decks exactly", () => {
    const base = pack();
    expect(base.cards).toEqual(CARD_LIST);
    expect(base.decks.map(({ strategy, collection, ...d }) => d)).toEqual(
      DECKS,
    );
    expect(errors(validatePack(base))).toEqual([]);
    validateWorkspace(initialWorkspace());
  });
  it.each(golden.fixtures.map((f) => [`${f.scoring}-${f.seed}`, f] as const))(
    "matches every original V1.1 action signature: %s",
    (_, fixture) => {
      let state = createMatch(
        [DECKS[0].cards, DECKS[1].cards],
        CARDS,
        { ...DEFAULT_CONFIG, scoring: fixture.scoring },
        fixture.seed,
      );
      expect(signature(state)).toBe(fixture.initial);
      for (const item of fixture.actions) {
        state = act(state, item.action as Action, CARDS);
        expect(signature(state)).toBe(item.signature);
      }
      expect(state.result).toEqual(fixture.result);
    },
  );
  it("diagnostic observation preserves atomic results and logs exactly", () => {
    const s = emptyScenario(pack(), DEFAULT_CONFIG).state;
    const prepared = addInstance(s, "sprout", 0, "hand");
    const id = prepared.players[0].hand[0];
    const action: Action = {
      type: "play",
      player: 0,
      card: id,
      row: 0,
      col: 0,
    };
    const normal = act(prepared, action, CARDS),
      traced = traceAction(prepared, action, CARDS);
    expect(traced.state).toEqual(normal);
    expect(traced.steps.some((s) => s.kind === "territory")).toBe(true);
    expect(traced.steps.every((s) => s.state)).toBe(true);
  });
});
describe("authored content and registry validation", () => {
  it("creates, edits and duplicates without changing stable IDs or originals", () => {
    const base = pack();
    const created = saveCard(base, draftCard(), defaultMetadata(), null);
    expect(created.cards).toHaveLength(31);
    expect(base.cards).toHaveLength(30);
    const card = { ...draftCard(), name: "Renamed sentinel" };
    const edited = saveCard(created, card, defaultMetadata(), card.id);
    expect(edited.cards.find((c) => c.id === card.id)?.name).toBe(card.name);
    expect(() =>
      saveCard(
        edited,
        { ...card, id: "different" },
        defaultMetadata(),
        card.id,
      ),
    ).toThrow(/immutable/);
    const copy = duplicateCard(edited, card.id, "sentinel-copy");
    expect(copy.card.abilities[0].id).not.toBe(card.abilities[0].id);
    expect(copy.metadata.status).toBe("draft");
  });
  it("edits combined influence and validates unsupported mechanics, strengths and duplicates", () => {
    const c = draftCard();
    c.influence.push(
      { x: 1, y: 0, mechanic: "fortification", amount: 2 },
      { x: 3, y: -2, mechanic: "overthrow", amount: 1 },
    );
    expect(errors(validateCard(c, pack()))).toEqual([]);
    c.influence.push({ ...c.influence[0] });
    expect(
      errors(validateCard(c, pack())).some((i) =>
        i.message.includes("Duplicate mechanics"),
      ),
    ).toBe(true);
    expect(
      errors(
        validateCard(
          { ...c, influence: [{ x: 1, y: 0, mechanic: "poison", amount: 1 }] },
          pack(),
        ),
      ),
    ).not.toHaveLength(0);
  });
  it("supports all nine triggers and all registered effects with truthful descriptions", () => {
    expect(Object.keys(TRIGGERS)).toHaveLength(9);
    expect(Object.keys(EFFECTS)).toHaveLength(15);
    const description = describeAbility(draftCard().abilities[0]);
    expect(description).toContain("On placement");
    expect(description).toContain("+1");
    expect(description).toContain("1/match");
  });
  it("rejects unsupported triggers/effects, missing targets and invalid activation limits", () => {
    for (const ability of [
      { id: "a", trigger: "onPoison", effects: [{ type: "draw", amount: 1 }] },
      {
        id: "a",
        trigger: "placement",
        effects: [{ type: "script", code: "anything" }],
      },
      {
        id: "a",
        trigger: "placement",
        effects: [{ type: "power", amount: 1 }],
      },
      {
        id: "a",
        trigger: "placement",
        effects: [{ type: "draw", amount: 1 }],
        limit: { perTurn: -1 },
      },
    ])
      expect(
        errors(validateCard({ ...draftCard(), abilities: [ability] }, pack())),
      ).not.toHaveLength(0);
  });
  it("validates missing predecessors, impossible AND conditions and exact evolution cycles", () => {
    const p = pack();
    expect(
      errors(
        validateCard(
          {
            ...draftCard(),
            type: "evolution",
            prerequisite: { definitions: ["missing"] },
          },
          p,
        ),
      ),
    ).not.toHaveLength(0);
    const a = {
      ...draftCard("branch-a"),
      type: "evolution" as const,
      prerequisite: { definitions: ["branch-b"] },
    };
    const b = {
      ...draftCard("branch-b"),
      type: "evolution" as const,
      prerequisite: { definitions: ["branch-a"] },
    };
    p.cards.push(a, b);
    expect(
      errors(validatePack(p)).some((i) => i.message.includes("Circular")),
    ).toBe(true);
  });
  it("supports named, classification, branching, multistage and cross-collection evolution edges", () => {
    const p = pack();
    p.cards.push({
      ...draftCard("sprout-branch"),
      kindred: "Arcane",
      type: "evolution",
      prerequisite: { definitions: ["sprout"] },
    });
    const edges = evolutionEdges(p.cards);
    expect(edges).toContainEqual({
      from: "sprout",
      to: "elderroot",
      criteria: false,
    });
    expect(edges).toContainEqual({
      from: "sprout",
      to: "sprout-branch",
      criteria: false,
    });
    expect(edges).toContainEqual({
      from: "elderroot",
      to: "wildcrown",
      criteria: false,
    });
  });
  it("supports additional collections, display renames and advisory deck opening analysis", () => {
    const p = pack();
    p.collections.push({
      id: "new-kindred",
      name: "New Kindred",
      description: "Experimental",
      color: "#123456",
      glyph: "◇",
      target: 30,
    });
    p.cards.push({ ...draftCard(), kindred: "new-kindred" });
    expect(errors(validatePack(p))).toEqual([]);
    p.collections[p.collections.length - 1].name = "Renamed collection";
    expect(errors(validatePack(p))).toEqual([]);
    const result = deckAnalysis(Array(15).fill("wildcrown"), p, {
      ...DEFAULT_CONFIG,
      mode: "free",
    });
    expect(result.errors).toEqual([]);
    expect(result.openings).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("detects duplicate IDs, unknown collections and numeric invalidity", () => {
    const p = pack();
    p.cards.push({ ...p.cards[0] });
    expect(errors(validatePack(p)).some((i) => i.path === "cards.id")).toBe(
      true,
    );
    expect(
      errors(
        validateCard(
          { ...draftCard(), power: NaN, kindred: "unknown" },
          pack(),
        ),
      ),
    ).toHaveLength(2);
  });
  it("validates ruleset dimensions, layouts, safe mulligans, scoring and safeguards", () => {
    expect(validateRules(DEFAULT_CONFIG)).toEqual([]);
    expect(
      errors(validateRules({ ...DEFAULT_CONFIG, openingHand: 10 })),
    ).not.toHaveLength(0);
    expect(
      errors(validateRules({ ...DEFAULT_CONFIG, scoring: "future" })),
    ).not.toHaveLength(0);
    const config = structuredClone(DEFAULT_CONFIG);
    config.battlefield.starts.push(config.battlefield.starts[0]);
    expect(
      errors(validateRules(config)).some((i) => i.message.includes("overlap")),
    ).toBe(true);
  });
});
describe("sandbox and diagnostics", () => {
  it("constructs valid zones with unique instances, deterministic execution and reset", () => {
    let scenario = emptyScenario(pack(), DEFAULT_CONFIG);
    scenario.state = addInstance(scenario.state, "sprout", 0, "hand");
    scenario.state = addInstance(scenario.state, "revenant", 1, "graveyard");
    expect(errors(validateScenario(scenario))).toEqual([]);
    const action: Action = {
      type: "play",
      player: 0,
      card: scenario.state.players[0].hand[0],
      row: 0,
      col: 0,
    };
    const a = traceAction(scenario.state, action, CARDS),
      b = traceAction(scenario.state, action, CARDS);
    expect(a).toEqual(b);
    expect(cellAt(a.state, 0, 1)?.owner).toBe(0);
    expect(scenario.state.board.every((c) => !c.creature)).toBe(true);
  });
  it("rejects duplicate IDs, impossible zone ownership, power and turn state", () => {
    const scenario = emptyScenario(pack(), DEFAULT_CONFIG);
    scenario.state = addInstance(scenario.state, "sprout", 0, "hand");
    const id = scenario.state.players[0].hand[0];
    scenario.state.players[1].hand.push(id);
    expect(errors(validateScenario(scenario))).not.toHaveLength(0);
    scenario.state.players[1].hand = [];
    scenario.state.active = 9 as any;
    expect(
      errors(validateScenario(scenario)).some((i) => i.path === "turn"),
    ).toBe(true);
  });
  it("constructs and validates evolution stacks and persistent restrictions", () => {
    let scenario = emptyScenario(pack(), DEFAULT_CONFIG);
    scenario.state = addInstance(
      scenario.state,
      "elderroot",
      0,
      "battlefield",
      { row: 0, col: 0 },
    );
    const id = cellAt(scenario.state, 0, 0)!.creature!;
    scenario.state = addStackForm(scenario.state, id, "sprout");
    scenario.state.lineages[scenario.state.cards[id].lineage].resurrections = 1;
    expect(errors(validateScenario(scenario))).toEqual([]);
    scenario.state = removeInstance(scenario.state, id);
    expect(Object.values(scenario.state.cards)).toHaveLength(0);
  });
  it("records evaluated conditions and activation rejection without fabricating states", () => {
    let scenario = emptyScenario(pack(), DEFAULT_CONFIG);
    scenario.state = addInstance(scenario.state, "grove-tender", 0, "hand");
    cellAt(scenario.state, 0, 0)!.tokens = 2;
    const id = scenario.state.players[0].hand[0];
    const trace = traceAction(
      scenario.state,
      { type: "play", player: 0, card: id, row: 0, col: 0 },
      CARDS,
    );
    expect(
      trace.steps.some(
        (s) => s.kind === "condition" && s.message.includes("did not pass"),
      ),
    ).toBe(true);
    expect(trace.state.phase).toBe("playing");
  });
});
describe("headless simulation", () => {
  it("is reproducible, alternates starters and mirrors deck seats", async () => {
    const req = request(4),
      a = await runSimulation(req),
      b = await runSimulation(req);
    expect(a.completed).toBe(4);
    expect(a.digest).toBe(b.digest);
    expect(a.decks).toEqual(b.decks);
    expect(a.cards).toEqual(b.cards);
    expect(
      [0, 1, 2, 3].map((i) => runOne(req, [0, 1], i).summary.starter),
    ).toEqual([0, 1, 0, 1]);
    expect(runOne(req, [0, 1], 2).summary.pairing).toEqual([
      req.decks[1].id,
      req.decks[0].id,
    ]);
    expect(a.completed + a.timeouts + a.faults + a.invariants).toBe(
      a.attempted,
    );
  });
  it("preserves cancellation partial results and reports timeouts separately", async () => {
    let cancelled = false;
    const req = request(10);
    const report = await runSimulation(req, {
      cancelled: () => cancelled,
      yield: async () => {
        cancelled = true;
      },
    });
    expect(report.cancelled).toBe(true);
    expect(report.attempted).toBe(1);
    const timeout = await runSimulation({ ...request(), maxActions: 1 });
    expect(timeout.timeouts).toBe(2);
    expect(timeout.completed).toBe(0);
    expect(timeout.draws).toBe(0);
    expect(timeout.failures[0].replay).toBeDefined();
  });
  it("classifies engine faults and loop safeguards outside competitive outcomes", async () => {
    const req = request(1);
    const report = await runSimulation(req);
    const completed = report.completed,
      draws = report.draws;
    const faulty = runOne(
      {
        ...req,
        config: {
          ...req.config,
          safeguards: { ...req.config.safeguards, maxResolutionSteps: 0 },
        },
      },
      [0, 1],
      0,
    ).summary;
    expect(faulty.status).toBe("fault");
    aggregateMatch(report, { ...faulty, error: "possible effect loop" }, {});
    expect(report.completed).toBe(completed);
    expect(report.faults).toBe(1);
    expect(report.loopSafeguards).toBe(1);
    expect(report.draws).toBe(draws);
  });
  it("generates round robin pairings including self matches and exportable sample statistics", async () => {
    const req = request(2);
    req.pairings = "roundRobin";
    expect(pairings(req)).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    const report = await runSimulation(req);
    expect(report.completed).toBe(6);
    expect(reportCSV(report)).toContain("sample_conditions");
    expect(report.examples.length).toBeLessThanOrEqual(3);
    expect(
      Object.values(report.cards).some((c) => c.played > 0 && c.included > 0),
    ).toBe(true);
  });
});
describe("replay, versions, backup and transactional imports", () => {
  it("reconstructs recorded actions and immutable historical content after draft edits", () => {
    let scenario = emptyScenario(pack(), DEFAULT_CONFIG);
    scenario.state = addInstance(scenario.state, "sprout", 0, "hand");
    let record = newRecord(scenario.state, CARDS, [[], []]);
    const action: Action = {
      type: "play",
      player: 0,
      card: scenario.state.players[0].hand[0],
      row: 0,
      col: 0,
    };
    const next = act(scenario.state, action, CARDS);
    record = appendRecord(record, action, next);
    const working = pack();
    working.cards[0].power = 90;
    expect(replayAt(record, 1, true).state).toEqual(next);
    expect(record.library.sprout.power).toBe(1);
    validateRecord(record);
    expect(replayAt(record, 0).state).toEqual(scenario.state);
    record.engineVersion = "unsupported";
    expect(() => replayAt(record, 1)).toThrow(/incompatible/);
  });
  it("detects altered replay actions instead of silently accepting inaccurate reconstruction", () => {
    const s = emptyScenario(pack(), DEFAULT_CONFIG).state;
    const action: Action = { type: "pass", player: 0 };
    const next = act(s, action, CARDS);
    const record = appendRecord(newRecord(s, CARDS, [[], []]), action, next);
    record.actions[0].signature = "tampered";
    expect(() => validateRecord(record)).toThrow(/diverged/);
  });
  it("makes immutable checkpoints, activates explicitly and restores as a new draft", () => {
    let w = initialWorkspace();
    w.working = saveCard(w.working, draftCard(), defaultMetadata(), null);
    w = checkpoint(w, "Owner checkpoint", "testing");
    const version = w.versions.at(-1)!;
    expect(w.activeVersion).toBe("v1.1-baseline");
    w = activateVersion(w, version.id);
    expect(w.activeVersion).toBe(version.id);
    w.working.cards[0].power = 44;
    expect(version.cards[0].power).toBe(1);
    expect(compareContent(version, w.working)).toContainEqual({
      type: "cards",
      id: "sprout",
      change: "changed",
    });
    w = restoreDraft(w, version.id);
    expect(w.working.kind).toBe("draft");
    expect(w.working.cards[0].power).toBe(1);
  });
  it("round trips complete backups, relationships, metadata and local artwork", () => {
    let w = initialWorkspace();
    const metadata = {
      ...defaultMetadata(),
      artwork: "data:image/png;base64,aGVsbG8=",
    };
    w.working = saveCard(w.working, draftCard(), metadata, null);
    w = checkpoint(w, "Artwork checkpoint");
    const transfer = parseTransfer(JSON.stringify(exportTransfer(w, "backup")));
    const restored = applyImport(initialWorkspace(), transfer, "replace");
    expect(restored.working).toEqual(w.working);
    expect(restored.versions).toEqual(w.versions);
    validateWorkspace(restored);
  });
  it.each([
    "cards",
    "collections",
    "decks",
    "rulesets",
    "scenarios",
    "replays",
    "reports",
    "content",
  ] as const)(
    "supports versioned %s transfer with conflict control",
    (type) => {
      const w = initialWorkspace();
      const transfer = parseTransfer(JSON.stringify(exportTransfer(w, type)));
      if (
        ["cards", "collections", "decks", "rulesets", "content"].includes(type)
      )
        expect(() => applyImport(w, transfer, "reject")).toThrow(/conflict/);
      expect(() => applyImport(w, transfer, "replace")).not.toThrow();
    },
  );
  it("rejects invalid imports without mutating existing valid owner content", () => {
    const w = initialWorkspace(),
      before = structuredClone(w);
    const transfer = exportTransfer(w, "backup");
    (transfer.data as any).working.cards[0].power = -3;
    expect(() => applyImport(w, transfer, "replace")).toThrow();
    expect(w).toEqual(before);
    expect(() => parseTransfer('{"format":"other"}')).toThrow();
    expect(() => parseTransfer('{"__proto__":{}}')).toThrow(/Unsafe/);
  });
});
