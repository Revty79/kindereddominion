import { describe, expect, it } from "vitest";
import { act, assertInvariants, cellAt, Resolver } from "../src/engine/game";
import { currentPower, scoreGame } from "../src/engine/scoring";
import {
  evaluateCondition,
  evaluateNumber,
  participant,
  powerBreakdown,
  selectTargets,
} from "../src/engine/evaluation";
import {
  validateCard,
  validatePack,
  libraryOf,
} from "../src/content/validation";
import { baselineContent, defaultMetadata } from "../src/content/baseline";
import { DEFAULT_CONFIG } from "../src/engine/config";
import {
  addInstance,
  emptyScenario,
  validateScenario,
} from "../src/sandbox/scenario";
import type {
  Ability,
  CardDefinition,
  Effect,
  GameState,
  Player,
  Target,
} from "../src/engine/types";
import type { ContentPack } from "../src/content/types";
import {
  appendRecord,
  newRecord,
  replayAt,
  signature,
  validateRecord,
} from "../src/replay/record";
import { runSimulation } from "../src/simulation/run";

const card = (
  id: string,
  patch: Partial<CardDefinition> = {},
): CardDefinition => ({
  id,
  name: id,
  kindred: "Nature",
  power: 3,
  rank: 1,
  type: "standard",
  tags: ["Wolf"],
  influence: [],
  abilities: [],
  glyph: "◇",
  text: "Development fixture.",
  ...patch,
});
const aura = (
  id = "bee",
  amount = 1,
  target: Target = {
    kind: "adjacent",
    relation: "friendly",
    excludeSelf: true,
  },
) =>
  card(id, {
    continuous: [{ id: `${id}-aura`, kind: "power", amount, target }],
  });
function pack(...cards: CardDefinition[]): ContentPack {
  const base = baselineContent();
  return {
    ...base,
    schema: 2,
    engineVersion: "1.3.0",
    id: "advanced-test",
    kind: "testing",
    cards,
    metadata: Object.fromEntries(cards.map((c) => [c.id, defaultMetadata()])),
    decks: [],
  };
}
function setup(
  cards: CardDefinition[],
  placements: {
    definition: string;
    owner?: Player;
    row?: number;
    col?: number;
    zone?: "hand" | "battlefield" | "graveyard";
  }[],
) {
  const content = pack(...cards),
    library = libraryOf(content);
  let state = emptyScenario(content, DEFAULT_CONFIG).state;
  const ids: string[] = [];
  for (const p of placements) {
    state = addInstance(
      state,
      p.definition,
      p.owner ?? 0,
      p.zone ?? "battlefield",
      p.zone === "hand" || p.zone === "graveyard"
        ? undefined
        : { row: p.row ?? 1, col: p.col ?? 0 },
    );
    ids.push(`c${state.nextCard - 1}`);
  }
  return { state, library, content, ids };
}
function effect(
  s: GameState,
  library: ReturnType<typeof libraryOf>,
  source: string,
  e: Effect,
) {
  const next = structuredClone(s),
    r = new Resolver(next, library),
    src = r.source(source),
    ctx = { id: next.nextEvent++, card: source, player: src.player };
  r.effect(e, src, ctx);
  r.advanced?.settle(e.type, src, ctx);
  r.drain();
  assertInvariants(next, library);
  return next;
}
const targeted = (id: string): Target => ({ kind: "all", definitions: [id] });
describe("continuous layers and death stabilization", () => {
  it("captures continuous protection for a simultaneous destruction group before removing its source", () => {
    const ward = card("ward", {
      continuous: [
        {
          id: "guard",
          kind: "protection",
          protection: "destruction",
          target: { kind: "adjacent", relation: "friendly", excludeSelf: true },
        },
      ],
    });
    const { state, library, ids } = setup(
      [ward, card("wolf")],
      [{ definition: "ward", row: 0 }, { definition: "wolf" }],
    );
    const next = effect(state, library, ids[1], {
      type: "destroy",
      target: { kind: "all" },
    });
    expect(next.cards[ids[0]].location).toBe("graveyard");
    expect(next.cards[ids[1]].location).toBe("battlefield");
    expect(powerBreakdown(next, library, ids[1]).continuousProtections).toEqual(
      [],
    );
    expect(
      effect(next, library, ids[1], {
        type: "destroy",
        target: { kind: "self" },
      }).cards[ids[1]].location,
    ).toBe("graveyard");
  });
  it("separates permanent, overlapping auras and dynamic scaling, without accumulating on repeated reads", () => {
    const wolf = card("wolf", {
      scaling: [
        {
          id: "pack",
          amount: {
            kind: "count",
            what: "creatures",
            target: { kind: "all", relation: "friendly", excludeSelf: true },
          },
        },
      ],
    });
    const { state, library, ids } = setup(
      [aura(), aura("second", 2), wolf],
      [
        { definition: "bee", row: 0 },
        { definition: "second", row: 2 },
        { definition: "wolf" },
      ],
    );
    state.cards[ids[2]].modifier = 2;
    const before = signature(state);
    for (let i = 0; i < 10; i++)
      expect(currentPower(state, library, ids[2])).toBe(10);
    expect(signature(state)).toBe(before);
    expect(powerBreakdown(state, library, ids[2])).toMatchObject({
      base: 3,
      permanent: 2,
      aura: 3,
      dynamic: 2,
      effective: 10,
    });
    const removed = effect(state, library, ids[2], {
      type: "banish",
      target: targeted("bee"),
    });
    expect(currentPower(removed, library, ids[2])).toBe(8);
    expect(removed.cards[ids[2]].modifier).toBe(2);
  });
  it("automatically applies existing auras to a newly placed creature through an atomic action", () => {
    const { state, library, ids } = setup(
      [aura(), card("wolf")],
      [
        { definition: "bee", row: 0 },
        { definition: "wolf", zone: "hand" },
      ],
    );
    cellAt(state, 1, 0)!.tokens = 1;
    const next = act(
      state,
      { type: "play", player: 0, card: ids[1], row: 1, col: 0 },
      library,
    );
    expect(next.fault).toBeNull();
    expect(currentPower(next, library, ids[1])).toBe(4);
    expect(next.cards[ids[1]].modifier).toBe(0);
  });
  it.each(["destroy", "return", "banish"] as const)(
    "removes aura/protection when source leaves via %s",
    (type) => {
      const bee = aura();
      bee.continuous!.push({
        id: "guard",
        kind: "protection",
        protection: "destruction",
        target: { kind: "adjacent", relation: "friendly" },
      });
      const { state, library, ids } = setup(
        [bee, card("wolf")],
        [{ definition: "bee", row: 0 }, { definition: "wolf" }],
      );
      expect(
        powerBreakdown(state, library, ids[1]).continuousProtections,
      ).toHaveLength(1);
      const next = effect(state, library, ids[1], {
        type,
        target: targeted("bee"),
      });
      expect(currentPower(next, library, ids[1])).toBe(3);
      expect(
        powerBreakdown(next, library, ids[1]).continuousProtections,
      ).toEqual([]);
    },
  );
  it.each(["replacement", "evolution"] as const)(
    "removes old aura through %s without carrying it as a permanent modifier",
    (type) => {
      const incoming = card("upgrade", {
        type,
        prerequisite: { definitions: ["bee"] },
      });
      const { state, library, ids } = setup(
        [aura(), incoming, card("wolf")],
        [
          { definition: "bee", row: 0 },
          { definition: "wolf" },
          { definition: "upgrade", zone: "hand" },
        ],
      );
      const next = act(
        state,
        { type: "play", player: 0, card: ids[2], row: 0, col: 0 },
        library,
      );
      expect(next.fault).toBeNull();
      expect(currentPower(next, library, ids[1])).toBe(3);
      expect(
        next.mechanics!.history.some((h) => h.event === "sacrificed"),
      ).toBe(type === "replacement");
    },
  );
  it("resolves simultaneous deaths and another death caused by losing a supporting aura before commit", () => {
    const { state, library, ids } = setup(
      [aura("first", 2), card("dependent", { power: 1 }), card("enemy")],
      [
        { definition: "first", row: 0 },
        { definition: "dependent" },
        { definition: "enemy", owner: 1, row: 1, col: 4 },
      ],
    );
    state.cards[ids[1]].modifier = -2;
    expect(currentPower(state, library, ids[1])).toBe(1);
    const next = effect(state, library, ids[2], {
      type: "destroy",
      target: targeted("first"),
    });
    expect(next.players[0].graveyard).toEqual([ids[0], ids[1]]);
    expect(
      next
        .mechanics!.history.filter((h) => h.event === "destroyed")
        .reduce((n, h) => n + h.count, 0),
    ).toBe(2);
  });
  it("weakening immunity prevents negative auras but not sacrifice", () => {
    const { state, library, ids } = setup(
      [
        aura("basilisk", -2, { kind: "all", relation: "enemy" }),
        card("warded", { protections: ["weakening"] }),
      ],
      [{ definition: "basilisk", owner: 1, col: 4 }, { definition: "warded" }],
    );
    expect(currentPower(state, library, ids[1])).toBe(3);
    const r = new Resolver(state, library);
    r.remove([ids[1]], "sacrifice");
    r.drain();
    expect(state.cards[ids[1]].location).toBe("graveyard");
  });
});
describe("dynamic expressions, condition layers and targeting", () => {
  it("freezes every variable magnitude before a multi-target territory effect mutates any target", () => {
    const { state, library, ids } = setup([aura()], [{ definition: "bee" }]);
    cellAt(state, 0, 0)!.fortification = 1;
    const next = effect(state, library, ids[0], {
      type: "fortify",
      amount: {
        kind: "count",
        what: "fortification",
        target: { kind: "column", column: 0 },
      },
      target: { kind: "column", column: 0 },
    });
    expect(
      next.board.filter((c) => c.col === 0).map((c) => c.fortification),
    ).toEqual([2, 1, 1]);
  });
  it("grows and shrinks with population, respecting caps and source exclusion", () => {
    const alpha = card("alpha", {
      scaling: [
        {
          id: "wolves",
          amount: {
            kind: "clamp",
            min: 0,
            max: 4,
            value: {
              kind: "multiply",
              constant: 2,
              value: {
                kind: "count",
                what: "creatures",
                target: {
                  kind: "all",
                  tags: ["Wolf"],
                  relation: "friendly",
                  excludeSelf: true,
                },
              },
            },
          },
        },
      ],
    });
    const { state, library, ids } = setup(
      [alpha, card("wolf")],
      [
        { definition: "alpha" },
        { definition: "wolf", row: 0 },
        { definition: "wolf", row: 2 },
      ],
    );
    expect(currentPower(state, library, ids[0])).toBe(7);
    const next = effect(state, library, ids[0], {
      type: "return",
      target: { kind: "row", row: 0 },
    });
    expect(currentPower(next, library, ids[0])).toBe(5);
  });
  it("classifies enhancement/weakening before dynamic bonuses, preventing recursive population scaling", () => {
    const scaling = card("scaled", {
      scaling: [
        {
          id: "enhanced",
          amount: {
            kind: "multiply",
            constant: 2,
            value: {
              kind: "count",
              what: "creatures",
              target: { kind: "all", status: "enhanced" },
            },
          },
        },
      ],
    });
    const { state, library, ids } = setup(
      [scaling, aura()],
      [{ definition: "scaled" }, { definition: "bee", row: 0 }],
    );
    expect(powerBreakdown(state, library, ids[0])).toMatchObject({
      preDynamic: 4,
      dynamic: 2,
      effective: 6,
    });
    expect(powerBreakdown(state, library, ids[1])).toMatchObject({
      preDynamic: 3,
      dynamic: 0,
    });
  });
  it.each([
    "creatures",
    "positions",
    "tokens",
    "fortification",
    "power",
  ] as const)(
    "supports deterministic %s aggregates with row/column/territory filters",
    (what) => {
      const { state, library, ids } = setup(
        [aura(), card("wolf")],
        [{ definition: "bee", row: 0 }, { definition: "wolf" }],
      );
      const value = evaluateNumber(
        {
          kind: "count",
          what,
          target: { kind: "column", column: 0, territory: "friendly" },
        },
        { state, library, source: ids[1] },
      );
      expect(value).toBe(
        what === "creatures"
          ? 2
          : what === "positions"
            ? 3
            : what === "tokens"
              ? 3
              : what === "fortification"
                ? 0
                : 7,
      );
    },
  );
  it("combines AND OR NOT, position, population, numeric power and historical/evolution conditions", () => {
    const { state, library, ids } = setup(
      [aura()],
      [{ definition: "bee", row: 0 }],
    );
    expect(
      evaluateCondition(
        {
          kind: "and",
          conditions: [
            { kind: "position", row: 0, edge: true },
            {
              kind: "or",
              conditions: [
                { kind: "friendlyCount", atLeast: 1 },
                { kind: "sourcePower", atLeast: 100 },
              ],
            },
            { kind: "not", condition: { kind: "evolutionStage", atLeast: 2 } },
          ],
        },
        { state, library, source: ids[0] },
      ),
    ).toBe(true);
  });
  it.each(["orthogonal", "diagonal", "adjacent", "row", "column"] as const)(
    "selects %s geometry with deterministic caps and reverse ordering",
    (kind) => {
      const { state, library, ids } = setup(
        [aura()],
        [{ definition: "bee", row: 1, col: 2 }],
      );
      const cells = selectTargets(
        { kind, maxTargets: 2, order: "reverse", excludeSelf: true },
        { state, library, source: ids[0] },
      );
      expect(cells).toHaveLength(2);
      expect(cells[0].row * 5 + cells[0].col).toBeGreaterThan(
        cells[1].row * 5 + cells[1].col,
      );
    },
  );
  it("filters exact definitions, classifications, Kindreds, power, occupancy, tokens and fortification", () => {
    const { state, library, ids } = setup(
      [aura(), card("target")],
      [{ definition: "bee", row: 0 }, { definition: "target" }],
    );
    cellAt(state, 1, 0)!.fortification = 2;
    const found = selectTargets(
      {
        kind: "all",
        definitions: ["target"],
        tags: ["Wolf"],
        kindreds: ["Nature"],
        relation: "friendly",
        territory: "friendly",
        occupied: "occupied",
        minPower: 4,
        maxPower: 4,
        minTokens: 1,
        minFortification: 2,
      },
      { state, library, source: ids[0] },
    );
    expect(found.map((c) => c.creature)).toEqual([ids[1]]);
  });
  it.each(["floor", "ceil", "nearest", "truncate"] as const)(
    "uses documented %s division rounding for negative values",
    (rounding) => {
      const { state, library, ids } = setup([aura()], [{ definition: "bee" }]);
      expect(
        evaluateNumber(
          { kind: "divide", value: -3, constant: 2, rounding },
          { state, library, source: ids[0] },
        ),
      ).toBe(rounding === "floor" ? -2 : -1);
    },
  );
  it("rejects effective-power dependency cycles, random pure queries, unknown scripts and invalid arithmetic", () => {
    const c = card("invalid", {
      continuous: [
        {
          id: "circular",
          kind: "power",
          amount: { kind: "value", value: "sourcePower" },
          target: { kind: "self" },
        },
      ],
    });
    const content = pack(c);
    expect(
      validateCard(c, content).some((i) => /Circular/.test(i.message)),
    ).toBe(true);
    c.continuous![0] = {
      id: "random",
      kind: "power",
      amount: {
        kind: "count",
        what: "creatures",
        target: { kind: "all", order: "random" },
      },
      target: { kind: "self" },
    };
    expect(validateCard(c, content).some((i) => /Random/.test(i.message))).toBe(
      true,
    );
    c.continuous![0] = {
      id: "zero",
      kind: "power",
      amount: { kind: "divide", value: 1, constant: 0 },
      target: { kind: "self" },
    };
    expect(
      validateCard(c, content).some((i) => /divisor/.test(i.message)),
    ).toBe(true);
  });
});
describe("reactive and historical semantics", () => {
  it("captures a simultaneously removed watcher’s own power before its aura source disappears", () => {
    const watcher = card("watcher", {
      abilities: [
        {
          id: "last",
          trigger: "otherDestruction",
          condition: { kind: "sourcePower", atLeast: 5 },
          effects: [
            {
              type: "power",
              amount: { kind: "value", value: "sourcePower" },
              target: targeted("survivor"),
            },
          ],
        },
      ],
    });
    const { state, library, ids } = setup(
      [aura("bee", 2), watcher, card("survivor")],
      [
        { definition: "bee", row: 0 },
        { definition: "watcher" },
        { definition: "survivor", row: 2 },
      ],
    );
    const next = effect(state, library, ids[2], {
      type: "destroy",
      target: { kind: "all", definitions: ["bee", "watcher"] },
    });
    expect(next.cards[ids[1]].location).toBe("graveyard");
    expect(currentPower(next, library, ids[2])).toBe(8);
  });
  it("allows a condition to detect qualifying evolution stages on another friendly creature", () => {
    const watcher = card("watcher", {
      abilities: [
        {
          id: "lineage",
          trigger: "condition",
          condition: {
            kind: "evolutionStage",
            target: { kind: "all", relation: "friendly" },
            definitions: ["wolf"],
            atLeast: 2,
          },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup(
      [
        watcher,
        card("wolf"),
        card("upgrade", {
          type: "evolution",
          prerequisite: { definitions: ["wolf"] },
        }),
      ],
      [
        { definition: "watcher", row: 0 },
        { definition: "wolf" },
        { definition: "upgrade", zone: "hand" },
      ],
    );
    const next = act(
      state,
      { type: "play", player: 0, card: ids[2], row: 1, col: 0 },
      library,
    );
    expect(next.fault).toBeNull();
    expect(cellAt(next, 0, 0)!.fortification).toBe(1);
  });
  it("power crossing observes actual aura transitions by default, with explicit cause filtering available", () => {
    const crossing = card("crossing", {
      abilities: [
        {
          id: "crossing",
          trigger: "powerThreshold",
          threshold: { value: 5, direction: "up" },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup(
      [crossing, aura("bee", 2)],
      [{ definition: "crossing" }, { definition: "bee", zone: "hand" }],
    );
    const next = act(
      state,
      { type: "play", player: 0, card: ids[1], row: 0, col: 0 },
      library,
    );
    expect(next.fault).toBeNull();
    expect(cellAt(next, 1, 0)!.fortification).toBe(1);
  });
  it("records one actual effective transition with its permanent and dynamic components, rather than fictitious intermediate powers", () => {
    const c = card("scale", {
      scaling: [
        {
          id: "intrinsic",
          amount: { kind: "value", value: "sourceIntrinsic" },
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "scale" }]);
    expect(currentPower(state, library, ids[0])).toBe(6);
    const next = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    const events = next.events.filter((e) => e.type === "power-change");
    expect(events).toHaveLength(1);
    expect(events[0].change).toMatchObject({
      previous: 6,
      current: 8,
      amount: 2,
      permanent: true,
      dynamic: true,
      components: { permanent: 1, aura: 0, dynamic: 1 },
    });
    expect(currentPower(next, library, ids[0])).toBe(8);
  });
  it("does not report a successful effective enhancement when an aura transition exactly cancels it", () => {
    const c = card("cancel", {
      continuous: [
        {
          id: "cancel",
          kind: "power",
          amount: -1,
          target: { kind: "self" },
          condition: { kind: "sourcePower", atLeast: 4 },
        },
      ],
      abilities: [
        {
          id: "react",
          trigger: "enhanced",
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "cancel" }]);
    const next = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    expect(currentPower(next, library, ids[0])).toBe(3);
    expect(next.events.filter((e) => e.type === "power-change")).toEqual([]);
    expect(cellAt(next, 1, 0)!.fortification).toBe(0);
  });
  it.each(["enhanced", "weakened", "firstEnhanced", "firstWeakened"] as const)(
    "%s uses actual signed changes and appropriate lifetime restrictions",
    (trigger) => {
      const c = card("reaction", {
        power: 10,
        abilities: [
          {
            id: "react",
            trigger,
            effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
          },
        ],
      });
      const { state, library, ids } = setup([c], [{ definition: "reaction" }]);
      const amount = trigger.toLowerCase().includes("weakened") ? -1 : 1;
      let next = effect(state, library, ids[0], {
        type: "power",
        amount,
        target: { kind: "self" },
      });
      next = effect(next, library, ids[0], {
        type: "power",
        amount,
        target: { kind: "self" },
      });
      expect(cellAt(next, 1, 0)!.fortification).toBe(
        trigger.startsWith("first") ? 1 : 2,
      );
    },
  );
  it.each([
    "drawn",
    "generated",
    "resurrected",
    "banished",
    "returned",
    "territoryClaimed",
    "territoryCaptured",
    "territoryLost",
    "territoryFortified",
    "fortificationReduced",
  ] as const)(
    "dispatches successful %s events with player filters",
    (trigger) => {
      const watcher = card("watcher", {
        abilities: [
          {
            id: "react",
            trigger,
            eventFilter: { relation: "friendly" },
            effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
          },
        ],
      });
      const { library, ids, ...created } = setup(
        [watcher, card("victim")],
        [{ definition: "watcher" }],
      );
      let state = created.state,
        source = ids[0],
        e: Effect;
      if (trigger === "drawn") {
        state = addInstance(state, "victim", 0, "draw");
        e = { type: "draw", amount: 1 };
      } else if (trigger === "generated")
        e = { type: "generate", amount: 1, card: "victim" };
      else if (trigger === "resurrected") {
        state = addInstance(state, "victim", 0, "graveyard");
        e = { type: "resurrect", target: "firstFriendly", limit: 1 };
      } else if (trigger === "banished" || trigger === "returned") {
        state = addInstance(state, "victim", 0, "battlefield", {
          row: 0,
          col: 0,
        });
        e = {
          type: trigger === "banished" ? "banish" : "return",
          target: targeted("victim"),
        };
      } else if (
        trigger === "territoryFortified" ||
        trigger === "fortificationReduced"
      ) {
        cellAt(state, 1, 0)!.fortification =
          trigger === "fortificationReduced" ? 1 : 0;
        e = {
          type: "fortify",
          amount: trigger === "territoryFortified" ? 1 : -1,
          target: { kind: "self" },
        };
      } else if (trigger === "territoryLost") {
        state = addInstance(state, "victim", 1, "battlefield", {
          row: 1,
          col: 4,
        });
        source = `c${state.nextCard - 1}`;
        e = {
          type: "overthrow",
          amount: 1,
          target: { kind: "all", row: 0, column: 0 },
        };
      } else {
        if (trigger === "territoryCaptured")
          Object.assign(cellAt(state, 1, 1)!, { owner: 1, tokens: 1 });
        e = {
          type: trigger === "territoryCaptured" ? "overthrow" : "capture",
          amount: 1,
          target: { kind: "pattern", offsets: [{ x: 1, y: 0 }] },
        };
      }
      const next = effect(state, library, source, e);
      expect(next.cards[ids[0]].modifier).toBe(1);
    },
  );
  it("orders reactive watchers by active player before coordinate and declaration order", () => {
    const reaction = (id: string) =>
      card(id, {
        abilities: [
          {
            id: "react",
            trigger: "otherWeakened",
            effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
          },
        ],
      });
    const { state, library, ids } = setup(
      [card("victim"), reaction("ally"), reaction("enemy")],
      [
        { definition: "victim" },
        { definition: "ally", row: 2 },
        { definition: "enemy", owner: 1, row: 0, col: 4 },
      ],
    );
    const next = effect(state, library, ids[0], {
      type: "power",
      amount: -1,
      target: { kind: "self" },
    });
    expect(
      next.events.filter((e) => e.type === "ability").map((e) => e.card),
    ).toEqual([ids[1], ids[2]]);
  });
  it("filters reactive events by classification, Kindred and real event cause", () => {
    const watcher = card("watcher", {
      abilities: [
        {
          id: "yes",
          trigger: "otherEnhanced",
          eventFilter: {
            relation: "enemy",
            tags: ["Wolf"],
            kindreds: ["Nature"],
            causes: ["powerEffect"],
          },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "no",
          trigger: "otherEnhanced",
          eventFilter: { causes: ["aura"] },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup(
      [watcher, card("wolf")],
      [{ definition: "watcher" }, { definition: "wolf", owner: 1, col: 4 }],
    );
    const next = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: targeted("wolf"),
    });
    expect(cellAt(next, 1, 0)!.fortification).toBe(1);
  });
  it("does not consume first-change flags or emit reactions for zero calculated effects", () => {
    const c = card("watcher", {
      abilities: [
        {
          id: "first",
          trigger: "firstEnhanced",
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "watcher" }]);
    const unchanged = effect(state, library, ids[0], {
      type: "power",
      amount: { kind: "clamp", min: 0, max: 0, value: 1 },
      target: { kind: "self" },
    });
    expect(unchanged.mechanics!.firstChanges).toEqual({});
    expect(
      cellAt(
        effect(unchanged, library, ids[0], {
          type: "power",
          amount: 1,
          target: { kind: "self" },
        }),
        1,
        0,
      )!.fortification,
    ).toBe(1);
  });
  it("removes conditional weakening protection as soon as its territory condition fails", () => {
    const c = card("ward", {
      continuous: [
        {
          id: "guard",
          kind: "protection",
          protection: "weakening",
          target: { kind: "self" },
          condition: {
            kind: "compare",
            left: {
              kind: "count",
              what: "fortification",
              target: { kind: "self" },
            },
            operator: "gte",
            right: 2,
          },
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "ward" }]);
    cellAt(state, 1, 0)!.fortification = 2;
    let next = effect(state, library, ids[0], {
      type: "power",
      amount: -1,
      target: { kind: "self" },
    });
    expect(next.cards[ids[0]].modifier).toBe(0);
    next = effect(next, library, ids[0], {
      type: "fortify",
      amount: -1,
      target: { kind: "self" },
    });
    next = effect(next, library, ids[0], {
      type: "power",
      amount: -1,
      target: { kind: "self" },
    });
    expect(next.cards[ids[0]].modifier).toBe(-1);
  });
  it("uses once-per-match threshold behavior by default even after a second crossing", () => {
    const c = card("threshold", {
      abilities: [
        {
          id: "threshold",
          trigger: "powerThreshold",
          threshold: { value: 4, direction: "up" },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "threshold" }]);
    let next = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    next = effect(next, library, ids[0], {
      type: "power",
      amount: -1,
      target: { kind: "self" },
    });
    next = effect(next, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    expect(cellAt(next, 1, 0)!.fortification).toBe(1);
  });
  it("retains destroyed power and stack depth after the participant has left play", () => {
    const { state, library, ids } = setup(
      [aura(), card("victim")],
      [{ definition: "bee", row: 0 }, { definition: "victim" }],
    );
    const captured = participant(state, library, ids[1], "destruction");
    const next = effect(state, library, ids[0], {
        type: "destroy",
        target: targeted("victim"),
      }),
      context = {
        id: 1,
        player: 0 as const,
        card: ids[1],
        participant: captured,
        removed: captured,
      };
    expect(
      evaluateNumber(
        { kind: "value", value: "destroyedPower" },
        { state: next, library, source: ids[0], context },
      ),
    ).toBe(4);
    expect(
      evaluateNumber(
        { kind: "value", value: "sourcePower" },
        { state: next, library, source: ids[1], context },
      ),
    ).toBe(4);
    expect(
      evaluateNumber(
        { kind: "value", value: "sacrificedPower" },
        { state: next, library, source: ids[0], context },
      ),
    ).toBe(0);
  });
  it("counts a real resurrection even when persistent weakening immediately destroys the returning creature", () => {
    const { state, library, ids } = setup(
      [aura(), card("victim", { power: 1 })],
      [
        { definition: "bee", row: 2 },
        { definition: "victim", zone: "graveyard" },
      ],
    );
    state.cards[ids[1]].modifier = -1;
    const next = effect(state, library, ids[0], {
      type: "resurrect",
      target: "firstFriendly",
      limit: 1,
    });
    expect(next.cards[ids[1]].location).toBe("graveyard");
    expect(
      next.mechanics!.history.find((h) => h.event === "resurrected")?.count,
    ).toBe(1);
    expect(
      next.mechanics!.history.find((h) => h.event === "destroyed")?.count,
    ).toBe(1);
  });
  it("only real permanent changes trigger default enhancement and first enhancement, not unchanged aura reads", () => {
    const c = card("reactor", {
      continuous: [
        { id: "a", kind: "power", amount: 1, target: { kind: "self" } },
      ],
      abilities: [
        {
          id: "first",
          trigger: "firstEnhanced",
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "each",
          trigger: "enhanced",
          effects: [{ type: "tokens", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "reactor" }]);
    const first = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    expect(cellAt(first, 1, 0)).toMatchObject({ fortification: 1, tokens: 2 });
    const second = effect(first, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    expect(cellAt(second, 1, 0)).toMatchObject({ fortification: 1, tokens: 3 });
    expect(
      second
        .mechanics!.history.filter((h) => h.event === "enhanced")
        .reduce((n, h) => n + h.count, 0),
    ).toBe(2);
  });
  it("does not emit successful weakening events when immunity prevents the effect", () => {
    const reactor = card("reactor", {
      protections: ["weakening"],
      abilities: [
        {
          id: "react",
          trigger: "weakened",
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup(
      [reactor, aura()],
      [{ definition: "reactor" }, { definition: "bee", row: 0 }],
    );
    const next = effect(state, library, ids[1], {
      type: "power",
      amount: -1,
      target: targeted("reactor"),
    });
    expect(next.events.filter((e) => e.type === "power-change")).toEqual([]);
    expect(next.mechanics!.history.some((h) => h.event === "weakened")).toBe(
      false,
    );
  });
  it("responds once to explicit opt-in aura changes and preserves attribution", () => {
    const reactor = card("reactor", {
      abilities: [
        {
          id: "derived",
          trigger: "enhanced",
          eventFilter: { powerChanges: ["aura"] },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup(
      [aura(), reactor],
      [{ definition: "reactor" }, { definition: "bee", zone: "hand" }],
    );
    const next = act(
      state,
      { type: "play", player: 0, card: ids[1], row: 0, col: 0 },
      library,
    );
    expect(next.fault).toBeNull();
    expect(cellAt(next, 1, 0)!.fortification).toBe(1);
    expect(
      next.events.find((e) => e.change?.creature === ids[0])?.change,
    ).toMatchObject({
      previous: 3,
      current: 4,
      amount: 1,
      kind: "aura",
      continuous: true,
    });
  });
  it("blocks indirect causal reentry instead of allowing mutual enhancement growth", () => {
    const c = card("reactor", {
      abilities: [
        {
          id: "echo",
          trigger: "otherEnhanced",
          eventFilter: { relation: "friendly" },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup(
      [c],
      [{ definition: "reactor" }, { definition: "reactor", row: 0 }],
    );
    const next = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    expect(next.events.filter((e) => e.type === "ability")).toHaveLength(2);
    expect(currentPower(next, library, ids[0])).toBe(5);
    expect(currentPower(next, library, ids[1])).toBe(4);
  });
  it("uses false-to-true transitions with explicit repeatable thresholds", () => {
    const c = card("threshold", {
      abilities: [
        {
          id: "cross",
          trigger: "condition",
          repeatable: true,
          condition: { kind: "sourcePower", atLeast: 4 },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "threshold" }]);
    let next = effect(state, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    next = effect(next, library, ids[0], {
      type: "power",
      amount: 1,
      target: { kind: "self" },
    });
    expect(cellAt(next, 1, 0)!.fortification).toBe(1);
    next = effect(next, library, ids[0], {
      type: "power",
      amount: -3,
      target: { kind: "self" },
    });
    next = effect(next, library, ids[0], {
      type: "power",
      amount: 2,
      target: { kind: "self" },
    });
    expect(cellAt(next, 1, 0)!.fortification).toBe(2);
  });
  it("captures sacrifice effective power before aura loss and incoming replacement death reactions", () => {
    const flytrap = card("flytrap", {
      type: "replacement",
      abilities: [
        {
          id: "meal",
          trigger: "replacement",
          effects: [
            {
              type: "power",
              target: { kind: "self" },
              amount: {
                kind: "divide",
                value: { kind: "value", value: "sacrificedPower" },
                constant: 2,
                rounding: "floor",
              },
            },
          ],
        },
      ],
    });
    const { state, library, ids } = setup(
      [aura(), card("victim", { power: 4 }), flytrap],
      [
        { definition: "bee", row: 0 },
        { definition: "victim" },
        { definition: "flytrap", zone: "hand" },
      ],
    );
    const next = act(
      state,
      { type: "play", player: 0, card: ids[2], row: 1, col: 0 },
      library,
    );
    expect(next.fault).toBeNull();
    expect(next.cards[ids[2]].modifier).toBe(2);
    expect(currentPower(next, library, ids[2])).toBe(6);
    expect(
      next.mechanics!.history.find((h) => h.event === "sacrificed"),
    ).toMatchObject({ definitionId: "victim", count: 1 });
  });
  it("retains immutable destroyed context and counts an evolution stack as one active destruction", () => {
    const victim = card("victim"),
      upgrade = card("upgrade", {
        type: "evolution",
        prerequisite: { definitions: ["victim"] },
        power: 5,
      });
    const watcher = card("watcher", {
      abilities: [
        {
          id: "scavenge",
          trigger: "otherDestruction",
          effects: [
            {
              type: "power",
              target: { kind: "self" },
              amount: { kind: "value", value: "destroyedPower" },
            },
          ],
        },
      ],
    });
    const { state, library, ids } = setup(
      [victim, upgrade, watcher],
      [
        { definition: "victim" },
        { definition: "watcher", row: 0 },
        { definition: "upgrade", zone: "hand" },
      ],
    );
    let next = act(
      state,
      { type: "play", player: 0, card: ids[2], row: 1, col: 0 },
      library,
    );
    next = effect(next, library, ids[1], {
      type: "destroy",
      target: targeted("upgrade"),
    });
    expect(currentPower(next, library, ids[1])).toBe(8);
    expect(
      next
        .mechanics!.history.filter((h) => h.event === "destroyed")
        .reduce((n, h) => n + h.count, 0),
    ).toBe(1);
    expect(next.players[0].graveyard).toHaveLength(2);
  });
  it("emits only successful fortification and capture/loss changes, with ownership filters", () => {
    const c = card("watcher", {
      abilities: [
        {
          id: "fort",
          trigger: "territoryFortified",
          eventFilter: { relation: "friendly" },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
      ],
    });
    const { state, library, ids } = setup([c], [{ definition: "watcher" }]);
    cellAt(state, 1, 0)!.fortification = 3;
    let next = effect(state, library, ids[0], {
      type: "fortify",
      amount: 1,
      target: { kind: "self" },
    });
    expect(next.mechanics!.history.some((h) => h.event === "fortified")).toBe(
      false,
    );
    cellAt(next, 1, 0)!.fortification = 1;
    next = effect(next, library, ids[0], {
      type: "fortify",
      amount: 1,
      target: { kind: "self" },
    });
    expect(next.cards[ids[0]].modifier).toBe(1);
    next = effect(next, library, ids[0], {
      type: "overthrow",
      amount: 1,
      target: { kind: "column", column: 4 },
    });
    expect(
      next
        .mechanics!.history.filter((h) => h.event === "captured")
        .reduce((n, h) => n + h.count, 0),
    ).toBe(3);
    expect(
      next
        .mechanics!.history.filter((h) => h.event === "lost")
        .reduce((n, h) => n + h.count, 0),
    ).toBe(3);
  });
});
describe("pure scoring and compatibility", () => {
  it("validates advanced sandbox modifiers at the same numerical bound as ordinary advanced gameplay", () => {
    const { state, library, content, ids } = setup(
      [aura()],
      [{ definition: "bee" }],
    );
    const next = effect(state, library, ids[0], {
      type: "power",
      amount: 5000,
      target: { kind: "self" },
    });
    expect(
      validateScenario({
        id: "large",
        name: "Large modifier",
        description: "",
        content,
        state: next,
        savedAt: "2026-11-26",
      }).filter((i) => i.severity === "error"),
    ).toEqual([]);
    next.cards[ids[0]].permanentEnhancement = 1;
    expect(() => assertInvariants(next, library)).toThrow(/inconsistent/);
  });
  it("rolls back an unsafe advanced action, preserving a readable valid battlefield and no competitive result", () => {
    const c = card("unsafe", {
      abilities: [
        {
          id: "unsafe",
          trigger: "placement",
          effects: [
            { type: "power", amount: 100000, target: { kind: "self" } },
          ],
        },
      ],
    });
    const { state, library, ids } = setup(
      [c],
      [{ definition: "unsafe", zone: "hand" }],
    );
    const next = act(
      state,
      { type: "play", player: 0, card: ids[0], row: 0, col: 0 },
      library,
    );
    expect(next.phase).toBe("fault");
    expect(next.result).toBeNull();
    expect(next.fault).toMatch(/safety bound/);
    expect(next.board).toEqual(state.board);
    expect(next.cards).toEqual(state.cards);
    expect(() => scoreGame(next, library)).not.toThrow();
    expect(() => assertInvariants(next, library)).not.toThrow();
  });
  it.each(["standard", "free"] as const)(
    "enforces resolution ceilings and atomic rollback in %s mode",
    (mode) => {
      const c = card("limited", {
        continuous: [
          { id: "a", kind: "power", amount: 1, target: { kind: "self" } },
        ],
        abilities: [
          {
            id: "loop",
            trigger: "placement",
            effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
          },
        ],
      });
      const { state, library, ids } = setup(
        [c],
        [{ definition: "limited", zone: "hand" }],
      );
      state.config.mode = mode;
      state.config.safeguards.maxResolutionSteps = 1;
      const next = act(
        state,
        { type: "play", player: 0, card: ids[0], row: 0, col: 0 },
        library,
      );
      expect(next.phase).toBe("fault");
      expect(next.result).toBeNull();
      expect(next.board).toEqual(state.board);
      expect(next.fault).toMatch(/Resolution limit/);
    },
  );
  it.each(["classic", "domination"])(
    "separates row power, tactical and capped card bonuses in %s without mutations or actions",
    (scoring) => {
      const c = card("score", {
        scoring: [
          { id: "row", when: "rowWon", amount: 2 },
          {
            id: "position",
            when: "survives",
            amount: 3,
            condition: { kind: "position", col: 0 },
          },
        ],
      });
      const { state, library } = setup([c], [{ definition: "score" }]);
      state.config.scoring = scoring;
      const before = signature(state),
        score = scoreGame(state, library);
      expect(score.rows[1].powers).toEqual([3, 0]);
      expect(score.totals).toEqual([scoring === "classic" ? 8 : 9, 0]);
      expect(score.breakdown).toMatchObject({
        ordinary: [3, 0],
        tactical: [scoring === "classic" ? 0 : 1, 0],
        bonuses: [5, 0],
      });
      expect(signature(state)).toBe(before);
      expect(scoreGame(state, library)).toEqual(score);
    },
  );
  it("does not let a tied row win itself through its own bonus", () => {
    const c = card("score", {
      scoring: [{ id: "row", when: "rowWon", amount: 100 }],
    });
    const { state, library } = setup(
      [c],
      [{ definition: "score" }, { definition: "score", owner: 1, col: 4 }],
    );
    expect(scoreGame(state, library).totals).toEqual([0, 0]);
  });
  it("reconstructs advanced records deterministically and rejects mislabeled legacy interpretation", () => {
    const { state, library, ids } = setup(
      [aura(), card("wolf")],
      [
        { definition: "bee", row: 0 },
        { definition: "wolf", zone: "hand" },
      ],
    );
    const action = {
        type: "play" as const,
        player: 0 as const,
        card: ids[1],
        row: 1,
        col: 0,
      },
      next = act(state, action, library);
    const r = appendRecord(
      newRecord(state, library, [[], []], "advanced-test"),
      action,
      next,
    );
    expect(r.engineVersion).toBe("1.3.0");
    expect(replayAt(r, 1).state).toEqual(next);
    expect(() => validateRecord(r)).not.toThrow();
    expect(() => replayAt({ ...r, engineVersion: "1.1.0" }, 1)).toThrow(
      /incompatible/,
    );
  });
  it("rejects advanced definitions mislabeled as legacy content without altering the originals", () => {
    const c = aura(),
      content = pack(c);
    expect(
      validatePack({ ...content, schema: 1, engineVersion: "1.1.0" }).some(
        (i) => i.severity === "error",
      ),
    ).toBe(true);
    expect(
      validatePack(baselineContent()).filter((i) => i.severity === "error"),
    ).toEqual([]);
  });
});
