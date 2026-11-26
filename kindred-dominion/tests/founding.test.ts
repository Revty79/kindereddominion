import { expect, it } from "vitest";
import { baselineContent } from "../src/content/baseline";
import { foundingContent } from "../src/content/founding";
import {
  deckAnalysis,
  evolutionEdges,
  libraryOf,
  validatePack,
} from "../src/content/validation";
import { DEFAULT_CONFIG } from "../src/engine/config";
import { validateDeck } from "../src/engine/game";
import { act, cellAt } from "../src/engine/game";
import {
  addInstance,
  emptyScenario,
  validateScenario,
} from "../src/sandbox/scenario";
import { runSimulation } from "../src/simulation/run";
const content = foundingContent(baselineContent());
it("provides exactly 150 unique provisional definitions and preserves the 30 originals verbatim", () => {
  expect(content.cards).toHaveLength(150);
  expect(new Set(content.cards.map((c) => c.id)).size).toBe(150);
  for (const card of baselineContent().cards)
    expect(content.cards.find((c) => c.id === card.id)).toEqual(card);
  expect(
    content.cards.every((c) => content.metadata[c.id].status === "provisional"),
  ).toBe(true);
  expect(validatePack(content).filter((i) => i.severity === "error")).toEqual(
    [],
  );
});
it.each(["Nature", "Mythical", "Arcane", "Undead", "Constructs"])(
  "%s has the recommended distribution, viable unique-card starter and diverse mechanical tools",
  (kindred) => {
    const cards = content.cards.filter((c) => c.kindred === kindred);
    expect(cards).toHaveLength(30);
    expect(
      [1, 2, 3].map(
        (rank) =>
          cards.filter((c) => c.type === "standard" && c.rank === rank).length,
      ),
    ).toEqual([12, 7, 4]);
    expect(cards.filter((c) => c.type === "replacement")).toHaveLength(3);
    expect(cards.filter((c) => c.type === "evolution")).toHaveLength(4);
    const deck = content.decks.find((d) => d.collection === kindred)!;
    expect(new Set(deck.cards).size).toBe(15);
    expect(deck.cards.every((id) => cards.some((c) => c.id === id))).toBe(true);
    expect(
      validateDeck(deck.cards, libraryOf(content), {
        ...DEFAULT_CONFIG,
        collection: kindred,
      }),
    ).toEqual([]);
    expect(
      deckAnalysis(deck.cards, content, DEFAULT_CONFIG).openings,
    ).toBeGreaterThanOrEqual(8);
    for (const mechanic of ["expansion", "fortification", "overthrow"])
      expect(
        cards.some((c) => c.influence.some((e) => e.mechanic === mechanic)),
      ).toBe(true);
    expect(
      cards.some((c) => c.type === "evolution" && c.prerequisite?.tags?.length),
    ).toBe(true);
    expect(
      cards.some(
        (c) => c.type === "evolution" && c.prerequisite?.definitions?.length,
      ),
    ).toBe(true);
  },
);
it("includes five functional mixed strategies and readable branching/multistage relationships", () => {
  expect(content.decks.filter((d) => d.collection === "mixed")).toHaveLength(5);
  for (const deck of content.decks)
    expect(
      validateDeck(deck.cards, libraryOf(content), DEFAULT_CONFIG),
    ).toEqual([]);
  const edges = evolutionEdges(content.cards);
  expect(
    edges.filter((e) => e.from === "rune-initiate").length,
  ).toBeGreaterThanOrEqual(2);
  expect(edges).toContainEqual({
    from: "rune-adept",
    to: "archmage",
    criteria: false,
  });
  expect(edges).toContainEqual({
    from: "grave-knight",
    to: "night-regent",
    criteria: false,
  });
});
it("all ten decks complete real-engine smoke matches in both rulesets", async () => {
  for (const scoring of ["classic", "domination"]) {
    for (let pair = 0; pair < content.decks.length; pair += 2) {
      const report = await runSimulation({
        content,
        decks: content.decks.slice(pair, pair + 2),
        pairings: "single",
        matches: 4,
        seed: 9765,
        config: { ...DEFAULT_CONFIG, scoring },
        maxActions: 200,
        mirrored: true,
        retainExamples: false,
      });
      expect(report.completed).toBe(4);
      expect(report.faults + report.invariants + report.timeouts).toBe(0);
    }
  }
});
it("all 150 definitions can execute a legal real-engine action in a controlled scenario", () => {
  const library = libraryOf(content);
  for (const definition of content.cards) {
    const scenario = emptyScenario(content, DEFAULT_CONFIG);
    let state = scenario.state;
    state = addInstance(state, "brass-scout", 0, "battlefield", {
      row: 0,
      col: 0,
    });
    state = addInstance(state, "leafguard", 0, "battlefield", {
      row: 2,
      col: 0,
    });
    if (definition.type !== "standard") {
      const req = definition.prerequisite;
      const predecessor = content.cards.find(
        (c) =>
          c.id !== definition.id &&
          (!req?.definitions || req.definitions.includes(c.id)) &&
          (!req?.tags || req.tags.some((t) => c.tags.includes(t))),
      )!;
      state = addInstance(state, predecessor.id, 0, "battlefield", {
        row: 1,
        col: 0,
      });
      const id = cellAt(state, 1, 0)!.creature!;
      state.cards[id].modifier = Math.max(
        0,
        (req?.minPower ?? 0) - predecessor.power,
      );
    }
    cellAt(state, 1, 0)!.tokens = 3;
    Object.assign(cellAt(state, 0, 1)!, {
      owner: 1,
      tokens: 3,
      fortification: 3,
    });
    Object.assign(cellAt(state, 0, 2)!, { owner: 0, tokens: 3 });
    state = addInstance(state, "bone-thrall", 1, "battlefield", {
      row: 1,
      col: 1,
    });
    state = addInstance(state, "sprout", 0, "graveyard");
    state = addInstance(state, definition.id, 0, "hand");
    expect(
      validateScenario({ ...scenario, state }).filter(
        (i) => i.severity === "error",
      ),
      definition.id,
    ).toEqual([]);
    const id = state.players[0].hand.at(-1)!;
    const next = act(
      state,
      { type: "play", player: 0, card: id, row: 1, col: 0 },
      library,
    );
    expect(next.fault, definition.id).toBeNull();
  }
});
