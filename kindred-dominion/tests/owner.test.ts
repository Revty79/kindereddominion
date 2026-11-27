import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ownerContent, OWNER_DESIGN_INPUT, artworkProductionManifest, collectibleRegistry } from "../src/content/owner";
import { libraryOf, validatePack } from "../src/content/validation";
import { compareCollectibles } from "../src/engine/identity";
import { validateDeck } from "../src/engine/game";
import { DEFAULT_CONFIG } from "../src/engine/config";
import { powerBreakdown } from "../src/engine/evaluation";
import { scoreGame } from "../src/engine/scoring";
import { newRecord, validateRecord } from "../src/replay/record";
import { duplicateCard, saveCard } from "../src/content/operations";
import { executeOwnerCardScenario, ownerCardScenario } from "./helpers/owner-scenarios";

const pack = ownerContent(), library = libraryOf(pack);
it("matches every supplied owner table without replacing identities, power, types, influence or intent", () => {
  const table = readFileSync("docs/V1.3BC-BRIEF.md", "utf8").split(/\r?\n/).filter(l => /^\| [NMAUC]\d{3} \|/.test(l)).map(l => l.split("|").slice(1, -1).map(x => x.trim()));
  expect(table).toHaveLength(150);
  for (const [number, name, type, power, influence, ability] of table) expect(OWNER_DESIGN_INPUT.find(c => c.number === number)).toMatchObject({ name, type, power: Number(power), influence, ability });
  expect(validatePack(pack).filter(i => i.severity === "error")).toEqual([]);
  expect(new Set(pack.cards.map(c => c.collectible!.number)).size).toBe(150);
  expect(new Set(pack.cards.map(c => c.id)).size).toBe(150);
  for (const collection of pack.collections) expect(pack.cards.filter(c => c.kindred === collection.id)).toHaveLength(30);
});
it("keeps collectible numbering numeric beyond 999 and independent of names, editions and art", () => {
  const cards = ["N1000", "N999", "N002", "N100000000000000000000000000000"].map((number, i) => ({ ...pack.cards[0], id: `future-${i}`, collectible: { ...pack.cards[0].collectible!, number } }));
  expect(cards.sort(compareCollectibles).map(c => c.collectible.number)).toEqual(["N002", "N999", "N1000", "N100000000000000000000000000000"]);
  const updated = saveCard(pack, { ...pack.cards[0], name: "Renamed Field Mouse" }, { ...pack.metadata.n001, artworkId: "future-artwork" }, "n001");
  expect(updated.cards[0].collectible).toEqual(pack.cards[0].collectible);
  expect(saveCard(pack, { ...pack.cards[0], power: 2 }, pack.metadata.n001, "n001").cards[0].collectible!.definitionRevision).toBe(2);
  expect(() => saveCard(pack, { ...pack.cards[0], collectible: { ...pack.cards[0].collectible!, number: "N031" } }, pack.metadata.n001, "n001")).toThrow(/Permanent collectible/);
  expect(duplicateCard(pack, "n001", "new-mouse").card.collectible).toBeUndefined();
  const registry=collectibleRegistry();expect(registry.filter(r=>r.setId===pack.cards[0].collectible!.setId)).toHaveLength(150);expect(new Set(registry.map(r=>r.number)).size).toBe(registry.length);expect(new Set(registry.map(r=>r.gameplayId)).size).toBe(registry.length);
});
it("enforces shared competitive copy limits across alternative editions and validates their identical rules", () => {
  const foil = { ...structuredClone(library.n001), id: "n001-foil", collectible: { ...library.n001.collectible!, edition: "foil" } };
  const variants = { ...library, [foil.id]: foil };
  expect(validateDeck(["n001", "n001", foil.id, foil.id, ...pack.decks[0].cards.slice(1, 12)], variants)).toContainEqual(expect.stringContaining("4 copies exceeds the limit of 3"));
  expect(validateDeck(Array(15).fill(foil.id), variants, { ...DEFAULT_CONFIG, mode: "free" })).toEqual([]);
  const bad = structuredClone(pack); bad.cards.push({ ...foil, power: 9 }); bad.metadata[foil.id] = bad.metadata.n001;
  expect(validatePack(bad).some(i => i.message.includes("Alternative editions"))).toBe(true);
});
it("keeps the five exact recommended 15-distinct-card decks and at least five legal mixed combinations", () => {
  expect(pack.decks).toHaveLength(10);
  const supplied = readFileSync("docs/V1.3BC-BRIEF.md", "utf8").split(/\r?\n/).filter(line => /^[NMAUC]\d{3}, /.test(line)).map(line => line.replace(/\.$/, "").split(", ").map(number => number.toLowerCase()));
  expect(pack.decks.slice(0, 5).map(d => d.cards)).toEqual(supplied);
  for (const deck of pack.decks) {
    expect(deck.cards).toHaveLength(15); expect(new Set(deck.cards).size).toBe(15);
    expect(validateDeck(deck.cards, library, { ...DEFAULT_CONFIG, collection: deck.collection })).toEqual([]);
    if (deck.collection !== "mixed") expect(deck.cards.filter(id => library[id].type === "standard" && library[id].rank === 1)).toHaveLength(8);
  }
  expect(validateDeck(pack.decks[1].cards, library, { ...DEFAULT_CONFIG, collection: "Nature" })).toContainEqual(expect.stringContaining("outside Nature"));
});
it("keeps precise Wolf, Mammal, Skeletal and Construct classifications and all 20 evolution relationships", () => {
  expect(pack.cards.filter(c => c.tags.includes("Wolf")).map(c => c.id)).toEqual(["n002", "n027", "n028"]);
  for (const card of pack.cards.filter(c => c.kindred === "Constructs")) expect(card.tags).toContain("Construct");
  expect(library.u028.tags).toContain("Skeletal");
  const evolutions = pack.cards.filter(c => c.type === "evolution"); expect(evolutions).toHaveLength(20);
  for (const card of evolutions) for (const predecessor of card.prerequisite!.definitions!) expect(library[predecessor]).toBeDefined();
  expect(library.m028.prerequisite!.definitions).toEqual(["m002", "m015"]);
  expect(library.m029.prerequisite!.definitions).toEqual(["m001", "m020"]);
});
it("provides 150 independent placeholder artwork associations and evolution-aware production records", () => {
  const manifest = artworkProductionManifest(); expect(manifest).toHaveLength(150);
  for (const entry of manifest) {
    expect(entry.artworkId).toBe(entry.gameplayId);
    expect(entry.productionPath).toMatch(/assets\/cards\/[a-z]+\/[nmauc]\d{3}-<revision>\.webp/);
    expect(entry.approval).toBe("awaiting-owner-artwork-review");
    expect(pack.metadata[entry.gameplayId].artworkRef).toBeUndefined();
  }
});
describe("all 150 owner cards execute in the real engine with controlled declared stimuli and verified replay", () => {
  it.each(pack.cards.map(c => [c.collectible!.number, c.id] as const))("%s", (_, id) => {
    const result = executeOwnerCardScenario(id);
    expect(result.final.fault).toBeNull();
    expect(result.placed.cards[result.source].definitionId).toBe(id);
    const ability = library[id].abilities[0];
    if (ability) expect(Object.keys(result.final.cards[result.source].activations).some(k => k.startsWith(ability.id + ":"))).toBe(true);
  });
});
it("documents Phoenix's actual prerequisite restriction instead of silently overriding it", () => {
  const result = executeOwnerCardScenario("m027");
  expect(result.final.cards[result.source].location).toBe("graveyard");
  expect(result.final.events.some(e => e.type === "resurrected" && e.card === result.source)).toBe(false);
  const supported = executeOwnerCardScenario("m027", state => {
    const ally = state.board.find(c => c.row === 1 && c.col === 0)!.creature!;
    state.cards[ally].definitionId = "m003";
  });
  expect(supported.final.cards[supported.source].location).toBe("battlefield");
  expect(supported.final.cards[supported.source].resurrections).toBe(1);
});
it("counts sacrifices as one death and keeps scaling distinct from permanent sacrifice growth", () => {
  const vulture = executeOwnerCardScenario("n024");
  expect(powerBreakdown(vulture.placed, vulture.library, vulture.source).dynamic).toBe(3);
  const flytrap = executeOwnerCardScenario("n026");
  expect(flytrap.placed.cards[flytrap.source].modifier).toBe(3);
  expect(powerBreakdown(flytrap.placed, flytrap.library, flytrap.source).dynamic).toBe(0);
});
it("uses the actual configurable fortification cap, requires positive fortification, and preserves old engine boundaries", () => {
  for (const cap of [0, 1, 3, 5]) for (const id of ["c016", "c020"]) {
    const r = executeOwnerCardScenario(id), state = structuredClone(r.placed);
    state.config.battlefield.maxFortification = cap;
    const cell = state.board.find(c => c.creature === r.source)!; cell.fortification = cap;
    const p = powerBreakdown(state, r.library, r.source);
    if (id === "c016") expect(p.dynamic).toBe(cap > 0 ? 2 : 0);
    else expect(p.continuousProtections).toHaveLength(cap > 0 ? 2 : 0);
    const replay = newRecord(state, r.library, [[], []]); expect(replay.engineVersion).toBe("1.3.1");
    expect(() => validateRecord({ ...replay, engineVersion: "1.3.0" })).toThrow(/incompatible/);
  }
});
it("calculates owner score bonuses independently and without mutating state", () => {
  for (const id of ["m018", "m025", "u023", "c023"]) {
    const r = executeOwnerCardScenario(id), before = JSON.stringify(r.placed);
    scoreGame(r.placed, r.library); scoreGame(r.placed, r.library);
    expect(JSON.stringify(r.placed)).toBe(before);
  }
});
