import input from "./owner-design-input.json";
import registry from "./collectible-registry.json";
import { DEFAULT_CONFIG } from "../engine/config";
import { OWNER_ENGINE_VERSION } from "../engine/versions";
import type { Ability, CardDefinition, Condition, Effect, Influence, Protection, Target, Trigger } from "../engine/types";
import type { Numeric } from "../engine/advanced-types";
import type { ContentPack, TestDeck } from "./types";

export const OWNER_CONTENT_ID = "founding-kindreds-owner-v1";
export const FOUNDING_SET_ID = "founding-kindreds-001";
export const FOUNDING_EXPANSION_ID = "foundation";
export const OWNER_DESIGN_INPUT = input;

const classifications: Record<string, string[]> = {
  Nature: ["Mammal,Rodent", "Mammal,Wolf,Juvenile", "Mammal,Fox", "Mammal,Hare", "Insect,Bee", "Arachnid,Spider", "Reptile,Tortoise", "Mammal,Mole", "Insect,Larva", "Mammal,Otter", "Mammal,Porcupine", "Bird,Corvid", "Mammal,Boar", "Bird,Raptor", "Reptile,Snake", "Mammal,Feline", "Mammal,Deer", "Reptile,Crocodilian", "Cephalopod,Octopus", "Mammal,Bear", "Mammal,Rhinoceros", "Mammal,Elephant", "Plant,Tree", "Bird,Scavenger", "Mammal,Hyena,Scavenger", "Plant,Carnivorous", "Mammal,Wolf", "Mammal,Wolf", "Insect,Butterfly", "Arachnid,Spider"],
  Mythical: ["Dragon,Reptile,Juvenile", "Griffin,Hybrid,Bird,Juvenile", "Bird,Fire", "Hybrid,Mammal,Hare", "Hybrid,Faun", "Hybrid,Peryton", "Construct,Stone,Gargoyle", "Hybrid,Bird,Harpy", "Spirit,Horse", "Spirit,Mammal,Fox", "Mammal,Unicorn,Juvenile", "Hybrid,Bird,Reptile", "Hybrid,Centaur", "Hybrid,Minotaur", "Griffin,Hybrid,Bird", "Reptile,Basilisk", "Hybrid,Manticore", "Hybrid,Horse", "Giant,Cyclops", "Dragon,Reptile", "Hydra,Reptile", "Bird,Roc", "SeaMonster,Leviathan", "Hybrid,Chimera", "Hybrid,Sphinx", "Mammal,Hound,Cerberus", "Bird,Fire,Phoenix", "Griffin,Hybrid,Bird", "Dragon,Reptile", "Spirit,Mammal,Fox"],
  Arcane: ["Spirit,Wisp", "Familiar,Magical", "Spirit,Sprite,Lightning", "Spirit,Sprite,Ice", "Spirit,Sprite,Fire", "Spirit,Sprite,Water", "Spirit,Sprite,Earth", "Spirit,Sprite,Mirror", "Spirit,Shadow", "Shapeshifter,Mimic", "Insect,Moth,Magical", "Construct,Artifact,Orb", "Elemental,Air", "Elemental,Lightning", "Elemental,Crystal", "Ooze,Magical", "Illusion,Beast", "Construct,Artifact,Book", "Serpent,Magical", "SeaMonster,Leviathan,Magical", "Elemental,Storm", "Dragon,Astral", "Spirit,Void", "Parasite,Magical", "Shapeshifter,Mirror", "Ooze,Void", "Elemental,Fire", "Elemental,Ice", "Elemental,Water", "Elemental,Earth"],
  Undead: ["Undead,Skeletal", "Undead,Zombie", "Undead,Spirit", "Undead,Hand", "Undead,Mammal,Rodent", "Undead,Skeletal,Mammal,Hound", "Undead,Spirit", "Undead,Ghoul", "Undead,Skeletal,Skull", "Undead,Insect,Beetle", "Undead,Bird,Corvid", "Undead,Mammal,Bat,Vampire", "Undead,Mummy", "Undead,Spirit,Banshee", "Undead,Wight", "Undead,Spirit,Wraith", "Undead,Vampire", "Undead,Revenant", "Undead,Skeletal,Mammal,Horse", "Undead,Lich", "Undead,Skeletal,Dragon", "Undead,Giant", "Undead,Rider", "Undead,Amalgam", "Undead,Spirit,Collector", "Undead,Devourer", "Undead,Skeletal", "Undead,Skeletal", "Undead,Vampire", "Undead,Spirit,Phantom"],
  Constructs: ["Construct,Mechanical,Beetle", "Construct,Mechanical,Spider", "Construct,Mechanical,Soldier", "Construct,Wood,Broom", "Construct,Mechanical,Hound", "Construct,Wood,Puppet", "Construct,Shield", "Construct,Mechanical,Drone", "Construct,Mechanical,Beetle", "Construct,Mechanical,Rodent", "Construct,Mechanical,Automaton", "Construct,Clay,Golem", "Construct,Stone,Golem", "Construct,Armor", "Construct,Mechanical,Automaton", "Construct,Mechanical,Tortoise", "Construct,Mechanical,Sentinel", "Construct,Mechanical,Siege", "Construct,Golem", "Construct,Metal,Golem", "Construct,Stone,Giant", "Construct,Mechanical,Dragon", "Construct,Fortress", "Construct,Mechanical,Automaton", "Construct,Metal,Giant", "Construct,Metal,Golem", "Construct,Metal,Soldier", "Construct,Metal,Sentinel", "Construct,Mechanical,Scorpion", "Construct,Stone,Guardian"],
};
const DIRECTIONS: Record<string, [number, number]> = { F: [1, 0], B: [-1, 0], U: [0, -1], D: [0, 1], S: [0, 0], FU: [1, -1], FD: [1, 1], F2: [2, 0] };
export function parseOwnerInfluence(text: string): Influence[] {
  return text.split(";").flatMap(part => {
    const [key, positions] = part.trim().split(":");
    const mechanic = ({ E: "expansion", G: "fortification", O: "overthrow" } as const)[key as "E" | "G" | "O"];
    if (!mechanic || !positions) throw new Error(`Invalid owner influence: ${text}`);
    return positions.split(",").map(raw => {
      const match = /^([A-Z0-9]+)(?:×([1-3]))?$/.exec(raw.trim());
      if (!match || !DIRECTIONS[match[1]]) throw new Error(`Invalid owner direction: ${raw}`);
      const [x, y] = DIRECTIONS[match[1]];
      return { x, y, mechanic, amount: Number(match[2] ?? 1) };
    });
  });
}
const self: Target = { kind: "self" };
const adjacent = (relation: "friendly" | "enemy" | "any" = "friendly", extra: Partial<Target> = {}): Target => ({ kind: "orthogonal", relation, ...extra });
const pattern = (directions: string[], relation: "friendly" | "enemy" | "any" = "enemy", extra: Partial<Target> = {}): Target => ({ kind: "pattern", relation, offsets: directions.map(d => ({ x: DIRECTIONS[d][0], y: DIRECTIONS[d][1] })), ...extra });
const front = (extra: Partial<Target> = {}) => pattern(["F"], "enemy", extra);
const all = (relation: "friendly" | "enemy" | "any", extra: Partial<Target> = {}): Target => ({ kind: "all", relation, ...extra });
const count = (target: Target, what: "creatures" | "positions" | "tokens" | "fortification" | "power" = "creatures"): Numeric => ({ kind: "count", what, target });
const clamp = (value: Numeric, max: number): Numeric => ({ kind: "clamp", value, min: 0, max });
const history = (relation: "friendly" | "enemy", tags?: string[]): Numeric => ({ kind: "history", event: "destroyed", filter: { relation, ...(tags ? { tags } : {}) } });
const compare = (left: Numeric, operator: "gte" | "eq" | "gt", right: Numeric): Condition => ({ kind: "compare", left, operator, right });
const halfSacrifice = (max: number): Numeric => clamp({ kind: "divide", value: { kind: "value", value: "sacrificedPower" }, constant: 2, rounding: "floor" }, max);
const sacrificed = (max: number): Numeric => clamp({ kind: "value", value: "sacrificedPower" }, max);
const power = (amount: Numeric, target: Target = self): Effect => ({ type: "power", amount, target });
const weaken = (amount: number, target = front()): Effect => power(-amount, target);
const resurrect = (): Effect => ({ type: "resurrect", target: "self", limit: 1 });
const aura = (amount: number, target = adjacent()): Partial<CardDefinition> => ({ continuous: [{ id: "continuous-power", kind: "power", amount, target }] });
const scaling = (amount: Numeric, condition?: Condition): Partial<CardDefinition> => ({ scaling: [{ id: "dynamic-power", amount, ...(condition ? { condition } : {}) }] });
const shield = (protection: Protection, target = self, condition?: Condition) => ({ id: `continuous-${protection}`, kind: "protection" as const, protection, target, ...(condition ? { condition } : {}) });
const bonuses = (amount: Numeric, when: "survives" | "rowWon" = "survives"): Partial<CardDefinition> => ({ scoring: [{ id: "score-bonus", when, amount }] });
const trigger = (event: Trigger, effects: Effect[], options: Partial<Ability> = {}): Partial<CardDefinition> => ({ abilities: [{ id: "owner-ability", trigger: event, effects, limit: { perEvent: 1, perMatch: 1 }, ...options }] });
const placement = (...effects: Effect[]) => trigger("placement", effects);
const replacement = (...effects: Effect[]) => trigger("replacement", effects);
const evolution = (...effects: Effect[]) => trigger("evolution", effects);
const death = (...effects: Effect[]) => trigger("destruction", effects);
const prey = (relation: "friendly" | "enemy" | "any", amount: number, perMatch: number, id?: string) => trigger("otherDestruction", [power(amount)], { limit: { perEvent: 1, perMatch }, eventFilter: { relation }, ...(id ? { id } : {}) });
const ownFortification = count(self, "fortification");
const fullFortification: Condition = { kind: "and", conditions: [compare(ownFortification, "gt", 0), compare(ownFortification, "eq", { kind: "value", value: "maximumFortification" })] };

function implementedRules(): Record<string, Partial<CardDefinition>> {
  return {
    n001: { maxCopies: 3 },
    n005: aura(1), n006: placement(weaken(1)), n007: { protections: ["destruction"] },
    n011: trigger("firstWeakened", [weaken(1, adjacent("enemy"))]), n012: prey("any", 1, 3),
    n015: placement(weaken(1, pattern(["F", "FU", "FD"]))), n016: placement(weaken(2)),
    n017: aura(1, adjacent("friendly", { tags: ["Mammal"] })),
    n018: placement({ type: "destroy", target: front({ maxPower: 2 }) }), n019: placement(weaken(1, adjacent("enemy"))),
    n020: scaling(2, compare(count(adjacent()), "eq", 0)), n022: placement(power(1, adjacent())), n023: aura(2),
    n024: scaling(clamp(history("friendly"), 5)),
    n025: trigger("replacement", [power(2)], { condition: compare(history("enemy"), "gte", 1) }), n026: replacement(power(halfSacrifice(5))),
    n027: scaling(clamp(count(all("friendly", { tags: ["Wolf"], excludeSelf: true })), 4)),
    n028: aura(2, all("friendly", { tags: ["Wolf"], excludeSelf: true })),
    n029: evolution({ type: "generate", card: "n009", amount: 1 }), n030: aura(-1, adjacent("enemy")),

    m005: placement(power(1, pattern(["B"], "friendly"))), m007: { protections: ["weakening"] },
    m008: placement(weaken(1, pattern(["U"]))), m009: placement(weaken(1)),
    m011: placement({ type: "protect", protection: "weakening", target: pattern(["B"], "friendly") }),
    m012: placement({ type: "destroy", target: front({ minPower: 1, maxPower: 1 }) }), m013: placement(power(1, pattern(["B"], "friendly"))),
    m016: aura(-2, front()), m017: placement(weaken(2, pattern(["FU", "FD"]))), m018: bonuses(2, "rowWon"),
    m020: placement(weaken(2, pattern(["F", "FU", "FD"]))),
    m021: scaling(clamp({ kind: "multiply", value: count(adjacent("enemy")), constant: 2 }, 6)),
    m023: placement(weaken(1, { kind: "row", relation: "any", excludeSelf: true })), m024: replacement(power(halfSacrifice(5))),
    m025: bonuses(3, "rowWon"), m026: replacement({ type: "destroy", target: front({ maxPower: 4 }) }),
    m027: death(resurrect()), m028: evolution(power(1, adjacent())), m029: evolution(weaken(3, pattern(["F", "FU", "FD"]))),
    m030: evolution({ type: "return", target: front() }),

    a002: placement({ type: "draw", amount: 1 }), a003: trigger("placement", [power(1)], { condition: { kind: "friendlyCount", atLeast: 3 } }),
    a004: placement(weaken(1)), a005: placement(weaken(1, pattern(["D"]))),
    a008: trigger("firstEnhanced", [power(2, pattern(["B"], "friendly"))]), a009: aura(-1, front()),
    a010: scaling(clamp({ kind: "divide", value: count(pattern(["B"], "friendly"), "power"), constant: 2, rounding: "floor" }, 3)),
    a011: trigger("otherEnhanced", [power(1)], { eventFilter: { relation: "friendly" }, limit: { perEvent: 1, perMatch: 3 } }),
    a013: placement({ type: "return", target: front({ maxPower: 2 }) }), a014: placement(weaken(1, pattern(["F", "FU", "FD"]))),
    a015: aura(1), a016: scaling(clamp(count(all("enemy", { status: "weakened" })), 4)), a017: placement(weaken(1)),
    a018: trigger("turnStart", [{ type: "draw", amount: 1 }], { limit: { perEvent: 1, perMatch: 2 } }),
    a019: scaling(clamp(count(all("friendly", { status: "enhanced", excludeSelf: true })), 4)),
    a020: aura(-1, { kind: "row", relation: "enemy" }), a021: placement(weaken(1, all("enemy"))),
    a022: scaling(clamp(count(all("friendly", { status: "enhanced", excludeSelf: true })), 5)),
    a023: placement({ type: "banish", target: front({ maxPower: 3 }) }),
    a024: replacement(power({ kind: "multiply", value: halfSacrifice(3), constant: -1 }, adjacent("enemy"))),
    a025: replacement(power(sacrificed(6))), a026: replacement({ type: "return", target: front() }),
    a027: aura(-1, adjacent("enemy")), a028: aura(-1, pattern(["F", "FU", "FD"])), a029: aura(1),
    a030: { continuous: [shield("weakening", self, compare(ownFortification, "gte", 2))] },

    u002: death(resurrect()), u005: death({ type: "generate", card: "u005", amount: 1 }),
    u006: trigger("sacrifice", [power(1, { kind: "incoming", relation: "friendly" })], { eventFilter: { causes: ["sacrifice"] } }),
    u007: death(power(1, adjacent())), u008: prey("friendly", 1, 3), u009: death(weaken(1, adjacent("enemy"))),
    u010: death({ type: "tokens", amount: 1, target: adjacent("friendly", { territory: "friendly" }) }), u011: death({ type: "draw", amount: 1 }),
    u012: prey("enemy", 1, 3), u013: { protections: ["weakening"] }, u014: death(weaken(2, adjacent("enemy"))),
    u015: placement(power(clamp(history("friendly"), 3))), u016: aura(-1, front()), u017: prey("enemy", 2, 2, "owner-vampire-feeding"),
    u018: death(resurrect()), u019: trigger("sacrifice", [{ type: "protect", protection: "weakening", target: { kind: "incoming", relation: "friendly" } }], { eventFilter: { causes: ["sacrifice"] } }),
    u020: placement({ type: "resurrect", target: "firstFriendly", limit: 1 }), u021: death(weaken(3, pattern(["F", "FU", "FD"]))),
    u022: scaling(clamp(history("friendly"), 5)), u023: bonuses(clamp(history("enemy"), 4)),
    u024: replacement(power(sacrificed(6))), u025: prey("friendly", 1, 4),
    u026: replacement({ type: "resurrect", target: "firstFriendly", limit: 1 }), u027: death({ type: "generate", card: "u001", amount: 1 }),
    u028: aura(1, all("friendly", { tags: ["Skeletal"], excludeSelf: true })), u029: prey("enemy", 2, 3, "owner-vampire-feeding"),
    u030: death(weaken(1, { kind: "row", relation: "enemy" })),

    c005: placement({ type: "fortify", amount: 1, target: pattern(["B"], "friendly", { territory: "friendly" }) }),
    c006: death({ type: "tokens", amount: 1, target: adjacent("friendly", { territory: "friendly" }) }),
    c007: { continuous: [shield("destruction", self, compare(ownFortification, "gte", 2))] },
    c011: placement(power(1, adjacent("friendly", { status: "weakened" }))), c013: { protections: ["destruction"] },
    c014: { protections: ["weakening"] }, c015: placement(weaken(3, pattern(["F2"]))), c016: scaling(2, fullFortification),
    c017: { continuous: [shield("destruction", adjacent())] },
    c019: trigger("turnStart", [power(1, adjacent("friendly", { status: "weakened" }))], { limit: { perEvent: 1, perMatch: 3 } }),
    c020: { continuous: [shield("destruction", self, fullFortification), shield("weakening", self, fullFortification)] },
    c021: scaling(clamp(count(adjacent("friendly", { territory: "friendly", minFortification: 1 }), "positions"), 4)),
    c022: placement(weaken(2)), c023: bonuses(clamp(count({ kind: "row", relation: "friendly", territory: "friendly", minFortification: 1 }, "positions"), 5)),
    c024: replacement({ type: "tokens", amount: 1, target: adjacent("friendly", { territory: "friendly" }) }),
    c025: scaling(clamp(history("friendly", ["Construct"]), 5)), c026: replacement(weaken(2, pattern(["F", "FU", "FD"]))),
    c027: { protections: ["destruction"] }, c028: { continuous: [shield("weakening", adjacent())] },
    c029: evolution(weaken(2, pattern(["FU", "FD"]))), c030: aura(1),
  };
}
const prerequisites: Record<string, string[]> = {
  n027: ["n002"], n028: ["n027"], n029: ["n009"], n030: ["n006"],
  m027: ["m003"], m028: ["m002", "m015"], m029: ["m001", "m020"], m030: ["m010"],
  a027: ["a005"], a028: ["a004"], a029: ["a006"], a030: ["a007"],
  u027: ["u001"], u028: ["u027"], u029: ["u017"], u030: ["u003", "u007"],
  c027: ["c003"], c028: ["c027"], c029: ["c002"], c030: ["c013"],
};
const collectionInfo = [
  { id: "Nature", name: "Nature", description: "Strength through growth: evolution, population and cooperation.", color: "#7cae8f", glyph: "◇", target: 30 },
  { id: "Mythical", name: "Mythical", description: "Strength through legendary power: offense, individual power and overthrow.", color: "#d4a365", glyph: "✧", target: 30 },
  { id: "Arcane", name: "Arcane", description: "Strength through manipulation: auras, reactive combinations and disruption.", color: "#ad9bd3", glyph: "✦", target: 30 },
  { id: "Undead", name: "Undead", description: "Strength through death: sacrifice, resurrection and historical deaths.", color: "#93a6bc", glyph: "☽", target: 30 },
  { id: "Constructs", name: "Constructs", description: "Strength through defense: fortification, reinforcement and protection.", color: "#c4af79", glyph: "⬡", target: 30 },
];
const decks: [string, string, string, string, string][] = [
  ["nature-wildwood", "Wildwood Assembly", "Nature", "Population, cooperation and Wolf evolution", "n001 n002 n003 n004 n005 n006 n008 n010 n013 n014 n017 n021 n026 n027 n028"],
  ["mythical-host", "Legendary Host", "Mythical", "Legendary power, Dragon progression and Phoenix", "m001 m002 m003 m004 m005 m006 m010 m011 m013 m014 m019 m020 m027 m029 m030"],
  ["arcane-conclave", "Elemental Conclave", "Arcane", "Positioned auras, enhancement reactions and Ice evolution", "a001 a002 a003 a004 a005 a007 a009 a011 a013 a015 a016 a019 a021 a025 a028"],
  ["undead-legion", "Restless Legion", "Undead", "Sacrifice, death effects and bounded resurrection", "u001 u002 u003 u005 u006 u007 u008 u011 u013 u014 u017 u020 u024 u026 u027"],
  ["constructs-bastion", "Iron Bastion", "Constructs", "Fortified formations and protected Soldier evolution", "c001 c002 c003 c004 c005 c008 c009 c011 c013 c015 c017 c018 c020 c027 c028"],
  ["mixed-pollination", "Cross-pollination", "mixed", "Wolf population meets Crystal aura and weakened-enemy scaling", "n001 n002 n005 n009 a002 a004 a005 a011 a015 a016 n017 n026 n027 n028 a028"],
  ["mixed-iron-legends", "Iron Legends", "mixed", "Construct protection supports individual legendary power", "c001 c003 c004 c005 c009 m001 m004 m005 m011 c013 c017 c020 m020 m029 c027"],
  ["mixed-bone-brass", "Bone and Brass", "mixed", "Death gifts strengthen replacements and historical Construct growth", "u001 u002 u005 u006 u007 c001 c003 c006 c011 u020 u024 u026 c024 c025 c027"],
  ["mixed-grave-echoes", "Echoes of the Grave", "mixed", "Arcane weakening feeds Undead death and sacrifice effects", "a001 a002 a004 a008 a011 u003 u008 u009 u012 a016 a020 a024 u017 u024 u030"],
  ["mixed-wild-legends", "Wild Legends", "mixed", "Mammal cooperation and expansion establish legendary evolutions", "n001 n002 n005 n010 m001 m004 m005 m010 m011 n017 n020 n027 m020 m029 m030"],
];

export function ownerContent(): ContentPack {
  const rules = implementedRules();
  const cards: CardDefinition[] = input.map(row => {
    if (!registry.entries.some(entry => entry.gameplayId === row.id && entry.number === row.number && !entry.retired)) throw new Error(`Permanent collectible registry mismatch: ${row.id}`);
    const serial = Number(row.number.slice(1));
    const type = row.type === "R" ? "replacement" : row.type === "Evo" ? "evolution" : "standard";
    const card: CardDefinition = {
      id: row.id, name: row.name, kindred: row.kindred, power: row.power, type,
      rank: type === "standard" ? ({ I: 1, II: 2, III: 3 } as const)[row.type as "I" | "II" | "III"] : type === "evolution" && ["n028", "m028", "m029", "u028", "u029", "c028", "c030"].includes(row.id) ? 3 : 2,
      tags: classifications[row.kindred][serial - 1].split(","), influence: parseOwnerInfluence(row.influence), abilities: [], text: row.ability,
      glyph: collectionInfo.find(c => c.id === row.kindred)!.glyph,
      collectible: { number: row.number, gameplayId: row.id, setId: FOUNDING_SET_ID, expansionId: FOUNDING_EXPANSION_ID, edition: "development", definitionRevision: 1, artworkId: row.id },
      ...(prerequisites[row.id] ? { prerequisite: { definitions: prerequisites[row.id] } } : {}),
      ...structuredClone(rules[row.id] ?? {}),
    };
    for (const ability of card.abilities) if (ability.id === "owner-ability") ability.id = `${card.id}-ability`;
    for (const rule of [...(card.continuous ?? []), ...(card.scaling ?? []), ...(card.scoring ?? [])]) rule.id = `${card.id}-${rule.id}`;
    return card;
  });
  return {
    id: OWNER_CONTENT_ID, name: "The Founding Kindreds — Owner Design V1", schema: 2, engineVersion: OWNER_ENGINE_VERSION,
    kind: "testing", createdAt: "2026-11-26T00:00:00Z", cards, collections: structuredClone(collectionInfo),
    metadata: Object.fromEntries(cards.map(card => [card.id, { status: "provisional", description: card.text, flavor: "", rarity: "Unassigned", artwork: "", artworkId: card.id, notes: "Owner-directed creature and ability. Provisional numerical balance. Final artwork pending separate approval." }])),
    decks: decks.map(([id, name, collection, strategy, cards]) => ({ id: `owner-${id}`, name, collection, strategy, subtitle: collection === "mixed" ? "Mixed-Kindred development combination" : `${collection} · owner-recommended`, cards: cards.split(" ") })) as TestDeck[],
    rulesets: ["classic", "domination"].map(id => ({ id, name: id === "classic" ? "Classic" : "Domination", description: id === "classic" ? "Score winning rows using effective creature power." : "Winning rows plus surviving creature points.", config: { ...structuredClone(DEFAULT_CONFIG), scoring: id }, completion: "twoPasses" })),
  };
}

export const collectibleRegistry = () => structuredClone(registry.entries);
export function artworkProductionManifest() {
  const content = ownerContent();
  return content.cards.map(card => ({ collectibleNumber: card.collectible!.number, gameplayId: card.id, name: card.name, kindred: card.kindred, classifications: card.tags, setId: FOUNDING_SET_ID, expansionId: FOUNDING_EXPANSION_ID, artworkId: card.collectible!.artworkId, productionPath: `assets/cards/${card.kindred.toLowerCase()}/${card.id}-<revision>.webp`, sourceDirectory: `artwork-source/cards/${card.kindred.toLowerCase()}/`, predecessors: card.prerequisite?.definitions ?? [], evolutions: content.cards.filter(c => c.prerequisite?.definitions?.includes(card.id)).map(c => c.id), subject: `${card.name}; ${card.tags.join(", ")}. Creature illustration only; independent of frame, numbers, text, statistics and diagrams.`, approval: "awaiting-owner-artwork-review" }));
}
