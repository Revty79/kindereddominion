import { describe, expect, it } from "vitest";
import {
  act,
  applyInfluence,
  assertInvariants,
  cellAt,
  createMatch,
  legalPlays,
  placementError,
  positionOf,
  relative,
  rematch,
  validateDeck,
} from "../src/engine/game";
import { battlefield, DEFAULT_CONFIG } from "../src/engine/config";
import { CARDS, CARD_LIST } from "../src/data/cards";
import { DECKS } from "../src/data/decks";
import { currentPower, scoreGame } from "../src/engine/scoring";
import { chooseComputerAction } from "../src/engine/ai";
import type {
  Ability,
  CardDefinition,
  CardLibrary,
  GameConfig,
  GameState,
  Player,
} from "../src/engine/types";

const config = (patch: Partial<GameConfig> = {}): GameConfig => ({
  ...structuredClone(DEFAULT_CONFIG),
  ...patch,
});
function fresh(library = CARDS, cfg = config(), starter: Player = 0) {
  const decks =
    library === CARDS
      ? [DECKS[0].cards, DECKS[1].cards]
      : [Array(15).fill("test"), Array(15).fill("test")];
  return createMatch(
    decks as [string[], string[]],
    library,
    library === CARDS ? cfg : { ...cfg, mode: "free" },
    9461,
    starter,
  );
}
function ready(state = fresh(), library = CARDS) {
  state = act(state, { type: "mulligan", player: 0, cards: [] }, library);
  return act(state, { type: "mulligan", player: 1, cards: [] }, library);
}
// Controlled fixtures relocate real, uniquely tracked instances. Every scenario ends with invariant validation.
function take(
  state: GameState,
  definitionId: string,
  player: Player = 0,
): string {
  let card = Object.values(state.cards).find(
    (c) =>
      c.definitionId === definitionId &&
      c.owner === player &&
      (c.location === "draw" || c.location === "hand"),
  );
  if (!card) {
    card = Object.values(state.cards).find(
      (c) =>
        c.owner === player && (c.location === "draw" || c.location === "hand"),
    )!;
    card.definitionId = definitionId;
  }
  for (const zone of ["draw", "hand"] as const)
    state.players[player][zone] = state.players[player][zone].filter(
      (id) => id !== card!.id,
    );
  card.location = "hand";
  state.players[player].hand.push(card.id);
  return card.id;
}
function field(
  state: GameState,
  def: string,
  row: number,
  col: number,
  owner: Player = 0,
): string {
  const id = take(state, def, owner);
  state.players[owner].hand = state.players[owner].hand.filter((c) => c !== id);
  state.cards[id].location = "battlefield";
  Object.assign(cellAt(state, row, col)!, { creature: id, owner, tokens: 3 });
  return id;
}
function play(
  state: GameState,
  definition: string,
  row: number,
  col: number,
  library = CARDS,
): GameState {
  const id = take(state, definition, state.active);
  const next = act(
    state,
    { type: "play", player: state.active, card: id, row, col },
    library,
  );
  expect(next.fault).toBeNull();
  assertInvariants(next, library);
  return next;
}
function testCard(abilities: Ability[] = []): CardDefinition {
  return {
    id: "test",
    name: "Test",
    kindred: "Arcane",
    rank: 1,
    power: 2,
    type: "standard",
    tags: ["test"],
    influence: [],
    abilities,
    text: "",
    glyph: "◇",
  };
}

describe("configuration, decks and initialization", () => {
  it("has exactly 30 provisional cards, six in each kindred, and four legal decks", () => {
    expect(CARD_LIST).toHaveLength(30);
    for (const kindred of [
      "Nature",
      "Mythical",
      "Arcane",
      "Undead",
      "Constructs",
    ])
      expect(CARD_LIST.filter((c) => c.kindred === kindred)).toHaveLength(6);
    DECKS.forEach((deck) =>
      expect(validateDeck(deck.cards, CARDS)).toEqual([]),
    );
  });
  it("initializes three rows, five columns, six one-token start cells, no creatures", () => {
    const s = fresh();
    expect(s.board).toHaveLength(15);
    expect(s.board.filter((c) => c.owner === 0)).toHaveLength(3);
    expect(s.board.filter((c) => c.owner === 1)).toHaveLength(3);
    expect(
      s.board.every(
        (c) =>
          c.fortification === 0 &&
          !c.creature &&
          c.tokens === (c.owner === null ? 0 : 1),
      ),
    ).toBe(true);
    expect(Object.keys(s.cards)).toHaveLength(30);
    assertInvariants(s, CARDS);
  });
  it.each([
    [3, 6],
    [4, 5],
    [4, 6],
    [4, 8],
  ])("supports %i by %i boards", (rows, cols) => {
    const s = fresh(CARDS, config({ battlefield: battlefield(rows, cols) }));
    expect(s.board).toHaveLength(rows * cols);
    expect(
      s.board.filter((c) => c.owner === 1).every((c) => c.col === cols - 1),
    ).toBe(true);
  });
  it("supports configured starting positions and caps; rejects overlaps", () => {
    const b = battlefield(4, 8);
    b.maxTokens = 5;
    b.maxFortification = 6;
    b.starts = [
      {
        player: 0,
        positions: [{ row: 2, col: 2 }],
        tokens: 4,
        fortification: 5,
      },
    ];
    const s = fresh(CARDS, config({ battlefield: b }));
    expect(cellAt(s, 2, 2)?.tokens).toBe(4);
    b.starts.push({ ...b.starts[0], player: 1 });
    expect(() => fresh(CARDS, config({ battlefield: b }))).toThrow(
      /overlapping/,
    );
  });
  it("validates exact deck size, unknown definitions, default limits and card overrides", () => {
    expect(validateDeck([], CARDS)[0]).toContain("15");
    expect(validateDeck(Array(15).fill("missing"), CARDS).join()).toContain(
      "Unknown",
    );
    expect(validateDeck(Array(15).fill("leafguard"), CARDS).join()).toContain(
      "limit of 2",
    );
    expect(validateDeck(DECKS[0].cards, CARDS)).toEqual([]);
    expect(
      validateDeck(
        Array(15).fill("leafguard"),
        CARDS,
        config({ mode: "free" }),
      ),
    ).toEqual([]);
  });
  it("validates single and mixed collections without rank requirements", () => {
    expect(
      validateDeck(
        Array(15).fill("sprout"),
        CARDS,
        config({ mode: "free", collection: "Nature" }),
      ),
    ).toEqual([]);
    expect(
      validateDeck(
        DECKS[0].cards,
        CARDS,
        config({ collection: "Nature" }),
      ).join(),
    ).toContain("outside Nature");
  });
  it("replays a seed deterministically and alternates rematch starters", () => {
    const s = fresh();
    expect(s).toEqual(fresh());
    expect(
      rematch(s, [DECKS[0].cards, DECKS[1].cards], CARDS, 7).startingPlayer,
    ).toBe(1);
    const starters = new Set(
      [1, 8192, 16384, 32768, 65536, 999999].map(
        (seed) =>
          createMatch([DECKS[0].cards, DECKS[1].cards], CARDS, config(), seed)
            .startingPlayer,
      ),
    );
    expect(starters.size).toBe(2);
  });
});
describe("mulligans, turns and validation", () => {
  it.each([0, 1, 5])(
    "exchanges %i individual instances before rejected cards return to the pile",
    (count) => {
      const s = fresh();
      const old = s.players[0].hand.slice();
      const reject = old.slice(0, count);
      const next = act(
        s,
        { type: "mulligan", player: 0, cards: reject },
        CARDS,
      );
      expect(next.players[0].hand).toHaveLength(5);
      expect(next.players[0].draw).toHaveLength(10);
      expect(
        reject.every(
          (id) =>
            !next.players[0].hand.includes(id) &&
            next.players[0].draw.includes(id),
        ),
      ).toBe(true);
      expect(next.players[1].hand).toEqual(s.players[1].hand);
      expect(next.events.filter((e) => e.type === "mulligan")[0].text).toBe(
        "Player 1 completed their mulligan.",
      );
      expect(() =>
        act(next, { type: "mulligan", player: 0, cards: [] }, CARDS),
      ).toThrow();
      assertInvariants(next, CARDS);
    },
  );
  it("rejects duplicate / foreign mulligan selections without mutating input", () => {
    const s = fresh();
    const copy = structuredClone(s);
    const id = s.players[0].hand[0];
    expect(() =>
      act(s, { type: "mulligan", player: 0, cards: [id, id] }, CARDS),
    ).toThrow();
    expect(s).toEqual(copy);
  });
  it("neither player draws on their opening turn, later turns draw one", () => {
    let s = ready();
    expect(s.players[0].hand).toHaveLength(5);
    s = act(s, { type: "pass", player: 0 }, CARDS);
    expect(s.players[1].hand).toHaveLength(5);
    s = play(s, "bone-thrall", 0, 4);
    expect(s.players[0].hand).toHaveLength(6);
    expect(s.active).toBe(0);
    expect(s.turn).toBe(3);
  });
  it("validates friendly empty ranked territory; lower ranks fit higher tokens", () => {
    const s = ready();
    const id = take(s, "grove-tender");
    expect(placementError(s, CARDS, 0, id, 0, 0)).toContain("Rank 2");
    cellAt(s, 0, 0)!.tokens = 3;
    expect(placementError(s, CARDS, 0, id, 0, 0)).toBeNull();
    expect(placementError(s, CARDS, 0, id, 0, 4)).toContain("control");
    field(s, "sprout", 0, 0);
    expect(placementError(s, CARDS, 0, id, 0, 0)).toContain("occupied");
  });
  it("rejects a second voluntary action after control transfers", () => {
    const s = play(ready(), "leafguard", 0, 0);
    expect(() => act(s, { type: "pass", player: 0 }, CARDS)).toThrow(
      "not your turn",
    );
  });
  it("does not defeat players with empty draw piles", () => {
    let s = ready();
    for (const p of [0, 1] as const) {
      for (const id of s.players[p].draw) {
        s.cards[id].location = "hand";
        s.players[p].hand.push(id);
      }
      s.players[p].draw = [];
    }
    s = play(s, "leafguard", 0, 0);
    s = play(s, "bone-thrall", 0, 4);
    expect(s.phase).toBe("playing");
    expect(s.fault).toBeNull();
  });
});
describe("territory and directional influence", () => {
  it("mirrors forward horizontally, preserves above/below, ignores out-of-bounds", () => {
    expect(relative({ row: 1, col: 4 }, 1, -1, 1)).toEqual({ row: 0, col: 3 });
    let s = play(ready(), "sprout", 0, 0);
    expect(cellAt(s, 0, 1)?.owner).toBe(0);
    expect(cellAt(s, 1, 0)?.tokens).toBe(2);
    s = play(s, "bone-thrall", 0, 4);
    expect(cellAt(s, 0, 3)?.owner).toBe(1);
  });
  it("reinforces tokens and fortification independently without consuming them", () => {
    const s = ready();
    const cell = cellAt(s, 0, 0)!;
    applyInfluence(s, cell, 0, "expansion", 8);
    applyInfluence(s, cell, 0, "fortification", 2);
    expect([cell.tokens, cell.fortification]).toEqual([3, 2]);
    const next = play(s, "leafguard", 0, 0);
    expect([
      cellAt(next, 0, 0)?.tokens,
      cellAt(next, 0, 0)?.fortification,
    ]).toEqual([3, 2]);
  });
  it("removes the last fortification without also capturing, then resets old tokens", () => {
    const s = ready();
    const cell = cellAt(s, 0, 4)!;
    cell.tokens = 3;
    cell.fortification = 2;
    applyInfluence(s, cell, 0, "expansion", 2);
    expect([cell.owner, cell.tokens, cell.fortification]).toEqual([1, 3, 0]);
    applyInfluence(s, cell, 0, "expansion", 2);
    expect([cell.owner, cell.tokens, cell.fortification]).toEqual([0, 2, 0]);
  });
  it("overthrows an unoccupied fortified enemy with defined new tokens", () => {
    const s = ready();
    const cell = cellAt(s, 0, 4)!;
    cell.fortification = 3;
    applyInfluence(s, cell, 0, "overthrow", 2);
    expect([cell.owner, cell.tokens, cell.fortification]).toEqual([0, 2, 0]);
  });
  it("protects occupied hostile territory from every ordinary influence mechanic", () => {
    const s = ready();
    field(s, "bone-thrall", 0, 4, 1);
    const cell = cellAt(s, 0, 4)!;
    cell.fortification = 3;
    const copy = structuredClone(cell);
    for (const mechanic of ["expansion", "overthrow", "fortification"] as const)
      applyInfluence(s, cell, 0, mechanic, 3);
    expect(cell).toEqual(copy);
    applyInfluence(s, cell, 1, "expansion", 1);
    applyInfluence(s, cell, 1, "fortification", 1);
    expect(cell.tokens).toBe(3);
  });
  it("starting territory has no capture protection", () => {
    const s = ready();
    applyInfluence(s, cellAt(s, 0, 4)!, 0, "expansion", 1);
    expect(cellAt(s, 0, 4)?.owner).toBe(0);
  });
});
describe("replacement, evolution and lifecycle", () => {
  it("places a replacement before sacrifice effects and preserves underlying territory", () => {
    const s = ready();
    const prior = field(s, "bone-thrall", 1, 0);
    cellAt(s, 1, 0)!.fortification = 2;
    s.cards[prior].modifier = 8;
    const next = play(s, "crypt-harvester", 1, 0);
    const id = cellAt(next, 1, 0)!.creature!;
    expect(currentPower(next, CARDS, id)).toBe(5);
    expect(next.players[0].graveyard).toContain(prior);
    expect([
      cellAt(next, 1, 0)!.tokens,
      cellAt(next, 1, 0)!.fortification,
    ]).toEqual([3, 2]);
    expect(next.events.some((e) => e.type === "sacrifice")).toBe(true);
  });
  it("checks replacement and branching evolution prerequisites", () => {
    const s = ready();
    field(s, "sprout", 0, 0);
    const titan = take(s, "rift-titan");
    expect(placementError(s, CARDS, 0, titan, 0, 0)).toContain("prerequisites");
    const elder = take(s, "elderroot");
    expect(placementError(s, CARDS, 0, elder, 0, 0)).toBeNull();
    const monarch = take(s, "ossuary-monarch");
    expect(placementError(s, CARDS, 0, monarch, 0, 0)).toContain(
      "prerequisites",
    );
  });
  it("retains modifiers, protections and lineage; supports multistage evolution without death", () => {
    const s = ready();
    const sprout = field(s, "sprout", 0, 0);
    s.cards[sprout].modifier = 2;
    s.cards[sprout].statuses = ["weakening"];
    s.lineages[s.cards[sprout].lineage].resurrections = 1;
    let next = play(s, "elderroot", 0, 0);
    const elder = cellAt(next, 0, 0)!.creature!;
    expect(next.cards[elder].modifier).toBe(3);
    expect(next.cards[elder].statuses).toContain("weakening");
    expect(next.players[0].graveyard).toEqual([]);
    next = act(next, { type: "pass", player: 1 }, CARDS);
    next = play(next, "wildcrown", 0, 0);
    const crown = cellAt(next, 0, 0)!.creature!;
    expect(next.cards[crown].stack).toEqual([sprout, elder]);
    expect(next.cards[crown].modifier).toBe(3);
    expect(next.lineages[next.cards[crown].lineage].resurrections).toBe(1);
  });
  it("destroys all evolution stages, but only active stage triggers death; territory persists", () => {
    let s = ready();
    const prior = field(s, "revenant", 0, 0);
    s = play(s, "ossuary-monarch", 0, 0);
    const monarch = cellAt(s, 0, 0)!.creature!;
    const enemy = field(s, "sunlance", 2, 4, 1);
    // Enemy Sunlance targets two ahead, so set a legal target position for this scenario.
    const old = cellAt(s, 0, 0)!;
    old.creature = null;
    Object.assign(cellAt(s, 0, 2)!, { owner: 0, tokens: 3, creature: monarch });
    s.players[1].hand.push(enemy);
    s.cards[enemy].location = "hand";
    cellAt(s, 2, 4)!.creature = null;
    cellAt(s, 0, 4)!.tokens = 2;
    s = act(s, { type: "play", player: 1, card: enemy, row: 0, col: 4 }, CARDS);
    expect(s.players[0].graveyard).toEqual(
      expect.arrayContaining([prior, monarch]),
    );
    expect(s.events.some((e) => e.text.includes("revenant-rise"))).toBe(false);
    expect(cellAt(s, 0, 2)?.owner).toBe(0);
    expect(s.fault).toBeNull();
    assertInvariants(s, CARDS);
  });
  it("return and banish move cards without death abilities", () => {
    let s = ready();
    const rev = field(s, "revenant", 0, 1, 1);
    field(s, "leafguard", 0, 0);
    s = play(s, "transmuter", 0, 0);
    expect(s.cards[rev].location).toBe("hand");
    expect(s.events.some((e) => e.text.includes("revenant-rise"))).toBe(false);
    s = act(s, { type: "pass", player: 1 }, CARDS);
    const doomed = field(s, "revenant", 1, 2, 1);
    cellAt(s, 1, 0)!.tokens = 3;
    s = play(s, "void-seer", 1, 0);
    expect(s.cards[doomed].location).toBe("exile");
  });
  it("allows replacement of a replacement on a full battlefield", () => {
    const s = ready();
    for (const c of s.board)
      field(
        s,
        c.owner === 1 ? "bone-thrall" : "brass-scout",
        c.row,
        c.col,
        c.owner === 1 ? 1 : 0,
      );
    let next = play(s, "crypt-harvester", 0, 0);
    expect(next.phase).toBe("playing");
    next = act(next, { type: "pass", player: 1 }, CARDS);
    next = play(next, "transmuter", 0, 0);
    expect(next.phase).toBe("playing");
  });
});
describe("effects, ordering and safeguards", () => {
  it("removes every simultaneous victim before resolving deaths", () => {
    const s = ready();
    const a = field(s, "bone-thrall", 0, 0);
    const b = field(s, "bone-thrall", 0, 4, 1);
    cellAt(s, 1, 0)!.tokens = 2;
    const next = play(s, "convergence", 1, 0);
    expect(next.cards[a].location).toBe("graveyard");
    expect(next.cards[b].location).toBe("graveyard");
    const removals = next.events.filter((e) => e.type === "power" && e.card);
    expect(removals).toHaveLength(3);
  });
  it("uses active-player priority and row/column order for simultaneous triggers", () => {
    const a: Ability = {
      id: "observe",
      trigger: "destruction",
      effects: [{ type: "draw", amount: 1 }],
    };
    const wave = testCard([
      {
        id: "wave",
        trigger: "placement",
        effects: [{ type: "power", amount: -2, target: { kind: "all" } }],
      },
    ]);
    const library = {
      test: wave,
      watcher: { ...testCard([a]), id: "watcher" },
    };
    const s = ready(fresh(library), library);
    const first = field(s, "watcher", 0, 0);
    const second = field(s, "watcher", 1, 0);
    const hostile = field(s, "watcher", 0, 4, 1);
    const next = play(s, "test", 2, 0, library);
    expect(
      next.events
        .filter((e) => e.type === "ability" && e.text.includes("observe"))
        .map((e) => e.card),
    ).toEqual([first, second, hostile]);
  });
  it("supports conditional enhancement, summoning and card generation caps", () => {
    let s = ready();
    field(s, "leafguard", 0, 0);
    field(s, "leafguard", 2, 0);
    cellAt(s, 1, 0)!.tokens = 2;
    s = play(s, "grove-tender", 1, 0);
    expect(currentPower(s, CARDS, cellAt(s, 1, 0)!.creature!)).toBe(4);
    s = act(s, { type: "pass", player: 1 }, CARDS);
    Object.assign(cellAt(s, 1, 1)!, { owner: 0, tokens: 2 });
    s = play(s, "brood-bough", 1, 1);
    expect(s.generated).toBe(2);
    expect(s.board.filter((c) => c.creature)).toHaveLength(6);
    s = act(s, { type: "pass", player: 1 }, CARDS);
    s.config.safeguards.maxGeneratedPerMatch = 2;
    Object.assign(cellAt(s, 2, 1)!, { owner: 0, tokens: 2 });
    s = play(s, "rune-initiate", 2, 1);
    expect(s.generated).toBe(2);
    expect(s.events.some((e) => e.type === "safeguard")).toBe(true);
  });
  it("supports data-driven ability replacements and evolutions beyond the voluntary placement", () => {
    const evolver = {
      ...testCard([
        {
          id: "evolve-all",
          trigger: "placement",
          effects: [
            {
              type: "evolve",
              card: "elderroot",
              target: { kind: "all", relation: "friendly", excludeSelf: true },
            },
          ],
        },
      ]),
      id: "evolver",
    };
    const replacer = {
      ...testCard([
        {
          id: "replace-all",
          trigger: "placement",
          effects: [
            {
              type: "replace",
              card: "crypt-harvester",
              target: { kind: "all", relation: "friendly", excludeSelf: true },
            },
          ],
        },
      ]),
      id: "replacer",
    };
    const library = { ...CARDS, evolver, replacer };
    let s = ready();
    const sprout = field(s, "sprout", 0, 0);
    const leaf = field(s, "leafguard", 2, 0);
    s = play(s, "evolver", 1, 0, library);
    expect(s.generated).toBe(2);
    expect(s.cards[sprout].location).toBe("stack");
    expect(s.cards[leaf].location).toBe("stack");
    expect(s.active).toBe(1);
    s = act(s, { type: "pass", player: 1 }, library);
    Object.assign(cellAt(s, 1, 1)!, { owner: 0, tokens: 2 });
    s = play(s, "replacer", 1, 1, library);
    expect(s.generated).toBe(5);
    expect(s.cards[sprout].location).toBe("graveyard");
    expect(s.cards[leaf].location).toBe("graveyard");
    expect(s.fault).toBeNull();
  });
  it("protects from direct destruction and weakening without preventing sacrifice", () => {
    let s = ready();
    const aegis = field(s, "aegis-core", 0, 2, 1);
    cellAt(s, 0, 0)!.tokens = 2;
    s = play(s, "sunlance", 0, 0);
    expect(s.cards[aegis].location).toBe("battlefield");
    s = play(s, "crypt-harvester", 0, 2);
    expect(s.cards[aegis].location).toBe("graveyard");
    expect(s.fault).toBeNull();
  });
  it("resurrects a directly destroyed creature once and preserves its limits", () => {
    let s = ready();
    const rev = field(s, "revenant", 0, 2, 1);
    cellAt(s, 0, 0)!.tokens = 2;
    s = play(s, "sunlance", 0, 0);
    expect(s.cards[rev].location).toBe("battlefield");
    expect(s.cards[rev].resurrections).toBe(1);
    s = act(s, { type: "pass", player: 1 }, CARDS);
    // Returned Revenant chose A3 (first available ranked territory), two ahead of A1.
    const shooter = take(s, "sunlance");
    const old = cellAt(s, 0, 0)!.creature!;
    s.players[0].graveyard.push(old);
    s.cards[old].location = "graveyard";
    cellAt(s, 0, 0)!.creature = null;
    s = act(
      s,
      { type: "play", player: 0, card: shooter, row: 0, col: 0 },
      CARDS,
    );
    expect(s.cards[rev].location).toBe("graveyard");
    expect(s.cards[rev].resurrections).toBe(1);
    expect(s.fault).toBeNull();
    assertInvariants(s, CARDS);
  });
  it("does not trigger placement abilities on resurrection by default", () => {
    const def = testCard([
      {
        id: "self-rise",
        trigger: "destruction",
        effects: [{ type: "resurrect", target: "self", limit: 1 }],
      },
      {
        id: "draw-once",
        trigger: "placement",
        effects: [{ type: "draw", amount: 1 }],
      },
    ]);
    const killer = {
      ...testCard([
        {
          id: "kill",
          trigger: "placement",
          effects: [
            { type: "destroy", target: { kind: "all", relation: "enemy" } },
          ],
        },
      ]),
      id: "killer",
    };
    const library = { test: def, killer };
    let s = ready(fresh(library), library);
    const victim = field(s, "test", 0, 4, 1);
    s = play(s, "killer", 0, 0, library);
    expect(s.cards[victim].resurrections).toBe(1);
    expect(s.events.some((e) => e.text.includes("draw-once"))).toBe(false);
  });
  it("halts unexpected loops with an explicit fault and no match result", () => {
    const loop = testCard([
      {
        id: "loop",
        trigger: "otherPlacement",
        effects: [{ type: "generate", card: "test", amount: 1 }],
      },
    ]);
    const cfg = config();
    cfg.safeguards.maxResolutionSteps = 1;
    const library = { test: loop };
    let s = ready(fresh(library, cfg), library);
    field(s, "test", 1, 0);
    s = act(
      s,
      { type: "play", player: 0, card: take(s, "test"), row: 0, col: 0 },
      library,
    );
    expect(s.phase).toBe("fault");
    expect(s.result).toBeNull();
    expect(s.fault).toContain("possible effect loop");
    expect(s.events.at(-1)?.type).toBe("fault");
  });
  it("detects an actual recurring destruction/resurrection chain before it can return a result", () => {
    const victim = testCard([
      {
        id: "self-destruct",
        trigger: "placement",
        allowOnResurrect: true,
        effects: [{ type: "destroy", target: { kind: "self" } }],
      },
    ]);
    const watcher = {
      ...testCard([
        {
          id: "endless-recall",
          trigger: "otherDestruction",
          effects: [
            { type: "resurrect", target: "firstFriendly", limit: 1000 },
          ],
        },
      ]),
      id: "watcher",
    };
    const library = { test: victim, watcher };
    const cfg = config();
    cfg.safeguards.maxResolutionSteps = 25;
    cfg.safeguards.maxResurrections = 1000;
    let s = ready(fresh(library, cfg), library);
    field(s, "watcher", 1, 0);
    s = act(
      s,
      { type: "play", player: 0, card: take(s, "test"), row: 0, col: 0 },
      library,
    );
    expect(s.phase).toBe("fault");
    expect(s.fault).toContain("possible effect loop");
    expect(s.result).toBeNull();
    expect(
      s.events.filter((e) => e.type === "destruction").length,
    ).toBeGreaterThan(2);
  });
  it("respects evolved resurrection prerequisites and supports an explicit override", () => {
    for (const override of [false, true]) {
      const recall: Ability = {
        id: "recall",
        trigger: "placement",
        effects: [
          {
            type: "resurrect",
            target: "firstFriendly",
            limit: 1,
            overrideEvolution: override,
          },
        ],
      };
      const library = {
        ...CARDS,
        caller: { ...testCard([recall]), id: "caller" },
      };
      const s = ready();
      const evolved = take(s, "elderroot");
      s.players[0].hand = s.players[0].hand.filter((id) => id !== evolved);
      s.players[0].graveyard.push(evolved);
      s.cards[evolved].location = "graveyard";
      cellAt(s, 1, 0)!.tokens = 3;
      const next = play(s, "caller", 0, 0, library);
      expect(next.cards[evolved].location).toBe(
        override ? "battlefield" : "graveyard",
      );
    }
    const library = {
      ...CARDS,
      caller: {
        ...testCard([
          {
            id: "recall",
            trigger: "placement",
            effects: [{ type: "resurrect", target: "firstFriendly", limit: 1 }],
          },
        ]),
        id: "caller",
      },
    };
    const s = ready();
    const prior = field(s, "sprout", 1, 0);
    const evolved = take(s, "elderroot");
    s.players[0].hand = s.players[0].hand.filter((id) => id !== evolved);
    s.players[0].graveyard.push(evolved);
    s.cards[evolved].location = "graveyard";
    const next = play(s, "caller", 0, 0, library);
    expect(next.cards[evolved].location).toBe("battlefield");
    expect(next.cards[evolved].stack).toEqual([prior]);
  });
  it("retains match-long activation restrictions when a card returns to hand and is replayed", () => {
    let s = ready();
    const rune = field(s, "rune-initiate", 0, 0);
    s.cards[rune].activations["rune-copy:match"] = 1;
    s.lineages[s.cards[rune].lineage].activations["rune-copy:match"] = 1;
    // Move through a real return effect, then replay the same instance.
    field(s, "bone-thrall", 0, 1, 1);
    s.active = 1;
    s = play(s, "transmuter", 0, 1);
    expect(s.cards[rune].location).toBe("hand");
    s = act(s, { type: "play", player: 0, card: rune, row: 0, col: 0 }, CARDS);
    expect(s.generated).toBe(0);
    expect(s.fault).toBeNull();
    assertInvariants(s, CARDS);
  });
  it("protects friendly creatures against simultaneous weakening after Aegis placement", () => {
    let s = ready();
    const ally = field(s, "leafguard", 1, 0);
    cellAt(s, 0, 0)!.tokens = 2;
    s = play(s, "aegis-core", 0, 0);
    cellAt(s, 0, 4)!.tokens = 3;
    s = play(s, "stormwyrm", 0, 4);
    expect(currentPower(s, CARDS, ally)).toBe(3);
    expect(s.cards[ally].statuses).toContain("weakening");
  });
  it("limits repeated simultaneous observer events per turn and counts each event only once", () => {
    const s = ready();
    const acolyte = field(s, "grave-acolyte", 2, 0);
    field(s, "bone-thrall", 0, 0);
    field(s, "bone-thrall", 0, 1);
    field(s, "bone-thrall", 0, 2);
    cellAt(s, 1, 0)!.tokens = 2;
    // Acolyte survives this effect; every other victim has exactly 2 power.
    s.cards[acolyte].modifier = 3;
    const next = play(s, "convergence", 1, 0);
    expect(currentPower(next, CARDS, acolyte)).toBe(4);
    expect(
      next.lineages[next.cards[acolyte].lineage].activations[
        "acolyte-grief:match"
      ],
    ).toBe(2);
  });
  it("maintains once-per-turn and match activation records across turns", () => {
    let s = ready();
    const watch = field(s, "watchwork", 0, 0);
    s = act(s, { type: "pass", player: 0 }, CARDS);
    s = play(s, "bone-thrall", 0, 4);
    expect(currentPower(s, CARDS, watch)).toBe(2);
    expect(cellAt(s, 0, 0)!.tokens).toBe(3);
    expect(
      s.lineages[s.cards[watch].lineage].activations["watch-wind:match"],
    ).toBe(1);
  });
});
describe("completion, scoring and complete matches", () => {
  it("scores winning rows, tied rows and domination creature counts", () => {
    const s = ready();
    field(s, "leafguard", 0, 0);
    field(s, "bone-thrall", 0, 4, 1);
    field(s, "bone-thrall", 1, 0);
    field(s, "bone-thrall", 1, 4, 1);
    expect(scoreGame(s, CARDS).totals).toEqual([3, 0]);
    expect(scoreGame(s, CARDS).rows[1].points).toEqual([0, 0]);
    s.config.scoring = "domination";
    const score = scoreGame(s, CARDS);
    expect(score.totals).toEqual([5, 2]);
    expect(score.columns[0]).toEqual([2, 0]);
  });
  it("does not count evolution stages as surviving creatures", () => {
    const s = ready();
    field(s, "sprout", 0, 0);
    const next = play(s, "elderroot", 0, 0);
    expect(scoreGame(next, CARDS).creatures).toEqual([1, 0]);
  });
  it("finishes on two consecutive passes, allows resuming and resets passes on play", () => {
    let s = ready();
    s = act(s, { type: "pass", player: 0 }, CARDS);
    s = play(s, "bone-thrall", 0, 4);
    expect(s.passes).toBe(0);
    s = play(s, "leafguard", 0, 0);
    s = act(s, { type: "pass", player: 1 }, CARDS);
    s = act(s, { type: "pass", player: 0 }, CARDS);
    expect(s.phase).toBe("finished");
    expect(s.result?.winner).toBe(0);
    expect(s.result?.reason).toBe("passes");
  });
  it("ends tied empty matches as draws and supports surrender", () => {
    let s = ready();
    s = act(s, { type: "pass", player: 0 }, CARDS);
    s = act(s, { type: "pass", player: 1 }, CARDS);
    expect(s.result?.winner).toBeNull();
    s = act(ready(), { type: "surrender", player: 0 }, CARDS);
    expect(s.result).toMatchObject({ winner: 1, reason: "surrender" });
  });
  it.each(["classic", "domination"])(
    "plays 12 seeded complete computer matches under %s without faults",
    (scoring) => {
      for (let seed = 1; seed <= 12; seed++) {
        let s = ready(
          createMatch(
            [DECKS[seed % 4].cards, DECKS[(seed + 1) % 4].cards],
            CARDS,
            config({ scoring }),
            seed * 397,
            (seed % 2) as Player,
          ),
        );
        let turns = 0;
        while (s.phase === "playing" && turns++ < 200) {
          const action = chooseComputerAction(s, CARDS);
          if (action.type === "play")
            expect(legalPlays(s, CARDS)).toContainEqual(action);
          s = act(s, action, CARDS);
          assertInvariants(s, CARDS);
        }
        expect(s.fault, `seed ${seed}`).toBeNull();
        expect(s.phase, `seed ${seed}, turns ${turns}`).toBe("finished");
        expect(s.result).not.toBeNull();
      }
    },
  );
});
