import type {
  Ability,
  CardDefinition,
  CardLibrary,
  Influence,
  Kindred,
  Target,
} from "../engine/types";
const self: Target = { kind: "self" };
const friendly: Target = { kind: "all", relation: "friendly" };
const enemy: Target = { kind: "all", relation: "enemy" };
const front: Target = {
  kind: "pattern",
  relation: "enemy",
  offsets: [{ x: 1, y: 0 }],
};
const expansion = (x: number, y = 0, amount = 1): Influence => ({
  x,
  y,
  amount,
  mechanic: "expansion",
});
const fort = (x: number, y = 0, amount = 1): Influence => ({
  x,
  y,
  amount,
  mechanic: "fortification",
});
const ability = (
  id: string,
  trigger: Ability["trigger"],
  effects: Ability["effects"],
  extras: Partial<Ability> = {},
): Ability => ({ id, trigger, effects, ...extras });
type Draft = Omit<CardDefinition, "kindred" | "tags" | "type" | "abilities"> &
  Partial<Pick<CardDefinition, "tags" | "type" | "abilities">>;
const kindred = (name: Kindred, cards: Draft[]): CardDefinition[] =>
  cards.map((card) => ({
    type: "standard",
    abilities: [],
    ...card,
    kindred: name,
    tags: [name.toLowerCase(), ...(card.tags ?? [])],
  }));
export const CARD_LIST: CardDefinition[] = [
  ...kindred("Nature", [
    {
      id: "sprout",
      name: "Briar Sprout",
      rank: 1,
      power: 1,
      glyph: "❧",
      maxCopies: 3,
      tags: ["seedling"],
      influence: [expansion(1), expansion(0, -1), expansion(0, 1)],
      text: "Expand 1 ahead, above and below. Development copy limit: 3.",
    },
    {
      id: "leafguard",
      name: "Leafguard",
      rank: 1,
      power: 3,
      glyph: "♧",
      tags: ["seedling"],
      influence: [expansion(1)],
      text: "Expand 1 ahead. A sturdy opening creature.",
    },
    {
      id: "grove-tender",
      name: "Grove Tender",
      rank: 2,
      power: 3,
      glyph: "♧",
      influence: [expansion(1, -1), expansion(1, 1)],
      abilities: [
        ability(
          "grove-cooperation",
          "placement",
          [{ type: "power", amount: 1, target: friendly }],
          {
            condition: { kind: "friendlyCount", atLeast: 3 },
            limit: { perMatch: 1 },
          },
        ),
      ],
      text: "Expand 1 diagonally ahead. On placement, if you control at least 3 creatures, give all friendly creatures +1 power. Once per lineage per match.",
    },
    {
      id: "brood-bough",
      name: "Brood Bough",
      rank: 2,
      power: 2,
      glyph: "❦",
      influence: [expansion(1, -1), expansion(1, 1)],
      abilities: [
        ability(
          "bough-summon",
          "placement",
          [
            {
              type: "summon",
              card: "sprout",
              target: {
                kind: "pattern",
                offsets: [
                  { x: 1, y: -1 },
                  { x: 1, y: 1 },
                ],
              },
            },
          ],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 diagonally ahead, then summon a Briar Sprout onto each eligible empty friendly target. Once per lineage per match.",
    },
    {
      id: "elderroot",
      name: "Elderroot",
      type: "evolution",
      rank: 2,
      power: 5,
      glyph: "♜",
      prerequisite: { definitions: ["sprout", "leafguard"] },
      influence: [expansion(1, 0, 2)],
      abilities: [
        ability(
          "elder-growth",
          "evolution",
          [{ type: "power", amount: 1, target: friendly }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Evolve Briar Sprout or Leafguard. Expand 2 ahead. On evolution, give friendly creatures +1 power; once per lineage per match.",
    },
    {
      id: "wildcrown",
      name: "Wildcrown",
      type: "evolution",
      rank: 3,
      power: 8,
      glyph: "♛",
      prerequisite: { definitions: ["elderroot"] },
      influence: [expansion(1, -1, 2), expansion(1, 0, 2), expansion(1, 1, 2)],
      abilities: [
        ability(
          "wildcrown-harvest",
          "turnStart",
          [{ type: "draw", amount: 1 }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Evolve Elderroot. Expand 2 ahead and diagonally ahead. At the beginning of your turn, draw 1 extra card; once per lineage per match.",
    },
  ]),
  ...kindred("Mythical", [
    {
      id: "embercub",
      name: "Embercub",
      rank: 1,
      power: 3,
      glyph: "♨",
      maxCopies: 3,
      tags: ["beast"],
      influence: [expansion(1)],
      text: "Expand 1 ahead. Can evolve into Dawnwing. Development copy limit: 3.",
    },
    {
      id: "dawnwing",
      name: "Dawnwing",
      type: "evolution",
      rank: 2,
      power: 5,
      glyph: "✦",
      prerequisite: { definitions: ["embercub"] },
      influence: [expansion(1, 0, 2), expansion(0, -1)],
      abilities: [
        ability(
          "dawn-rally",
          "evolution",
          [{ type: "power", amount: 1, target: friendly }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Evolve Embercub. Expand 2 ahead and 1 above. On evolution, give friendly creatures +1 power; once per lineage per match.",
    },
    {
      id: "stormwyrm",
      name: "Stormwyrm",
      rank: 3,
      power: 8,
      glyph: "ϟ",
      influence: [expansion(1, 0, 2)],
      abilities: [
        ability(
          "storm-sweep",
          "placement",
          [{ type: "power", amount: -2, target: enemy }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 2 ahead. On placement, weaken all enemy creatures by 2 simultaneously. Once per lineage per match.",
    },
    {
      id: "ashen-phoenix",
      name: "Ashen Phoenix",
      rank: 2,
      power: 4,
      glyph: "✧",
      influence: [expansion(1), expansion(0, 1)],
      abilities: [
        ability(
          "phoenix-return",
          "destruction",
          [{ type: "resurrect", target: "self", limit: 1 }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 ahead and below. On destruction, resurrect on the first eligible friendly empty position. Once per lineage per match; power modifiers persist.",
    },
    {
      id: "rift-titan",
      name: "Rift Titan",
      type: "replacement",
      rank: 3,
      power: 7,
      glyph: "♜",
      prerequisite: { minPower: 2 },
      influence: [expansion(1, 0, 2)],
      abilities: [
        ability("titan-break", "replacement", [
          { type: "destroy", target: front },
        ]),
      ],
      text: "Replace a friendly creature with at least 2 current power. Expand 2 ahead. On replacement, directly destroy the enemy creature ahead.",
    },
    {
      id: "sunlance",
      name: "Sunlance",
      rank: 2,
      power: 4,
      glyph: "☼",
      influence: [expansion(1)],
      abilities: [
        ability(
          "sun-strike",
          "placement",
          [
            {
              type: "destroy",
              target: {
                kind: "pattern",
                relation: "enemy",
                offsets: [{ x: 2, y: 0 }],
              },
            },
          ],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 ahead. On placement, directly destroy the enemy creature two positions ahead. Once per lineage per match.",
    },
  ]),
  ...kindred("Arcane", [
    {
      id: "rune-initiate",
      name: "Rune Initiate",
      rank: 1,
      power: 2,
      glyph: "◇",
      maxCopies: 3,
      influence: [expansion(0), expansion(1)],
      abilities: [
        ability(
          "rune-copy",
          "placement",
          [{ type: "generate", card: "rune-initiate", amount: 1 }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Reinforce this position by 1 and expand 1 ahead. On placement, generate a Rune Initiate in hand; once per lineage per match. Development copy limit: 3.",
    },
    {
      id: "mirror-adept",
      name: "Mirror Adept",
      rank: 1,
      power: 1,
      glyph: "◈",
      influence: [expansion(1, -1), expansion(1, 1)],
      abilities: [
        ability("mirror-draw", "placement", [{ type: "draw", amount: 1 }], {
          limit: { perMatch: 1 },
        }),
      ],
      text: "Expand 1 diagonally ahead. On placement, draw 1 card. Once per lineage per match.",
    },
    {
      id: "hex-weaver",
      name: "Hex Weaver",
      rank: 2,
      power: 3,
      glyph: "✥",
      influence: [expansion(1)],
      abilities: [
        ability(
          "hex-bind",
          "placement",
          [
            {
              type: "power",
              amount: -2,
              target: {
                kind: "pattern",
                relation: "enemy",
                offsets: [
                  { x: 1, y: -1 },
                  { x: 1, y: 0 },
                  { x: 1, y: 1 },
                ],
              },
            },
          ],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 ahead. On placement, weaken enemy creatures ahead and diagonally ahead by 2 simultaneously; once per lineage per match.",
    },
    {
      id: "transmuter",
      name: "Transmuter",
      type: "replacement",
      rank: 2,
      power: 4,
      glyph: "⟐",
      influence: [expansion(1)],
      abilities: [
        ability("transmute-return", "replacement", [
          { type: "return", target: front },
        ]),
      ],
      text: "Replace any friendly creature. Expand 1 ahead. On replacement, return the enemy creature ahead (and its previous stages) to its owner’s hand, without death triggers.",
    },
    {
      id: "void-seer",
      name: "Void Seer",
      rank: 3,
      power: 5,
      glyph: "◉",
      influence: [expansion(1, 0, 2)],
      abilities: [
        ability(
          "void-exile",
          "placement",
          [
            {
              type: "banish",
              target: {
                kind: "pattern",
                relation: "enemy",
                offsets: [{ x: 2, y: 0 }],
              },
            },
          ],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 2 ahead. On placement, banish the enemy creature two positions ahead, including its evolution stack. No death triggers. Once per lineage per match.",
    },
    {
      id: "convergence",
      name: "Convergence",
      rank: 2,
      power: 2,
      glyph: "✳",
      influence: [expansion(1, 0, 2)],
      abilities: [
        ability(
          "convergence-wave",
          "placement",
          [{ type: "power", amount: -2, target: { kind: "all" } }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 2 ahead. On placement, weaken ALL creatures, including this one, by 2 simultaneously. Remove every defeated creature before death abilities resolve.",
    },
  ]),
  ...kindred("Undead", [
    {
      id: "bone-thrall",
      name: "Bone Thrall",
      rank: 1,
      power: 2,
      glyph: "♙",
      maxCopies: 3,
      influence: [expansion(1)],
      abilities: [
        ability(
          "bone-offering",
          "sacrifice",
          [{ type: "power", amount: 1, target: friendly }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 ahead. On sacrifice, give all surviving friendly creatures +1 power, including its replacement. Once per lineage per match. Development copy limit: 3.",
    },
    {
      id: "grave-acolyte",
      name: "Grave Acolyte",
      rank: 1,
      power: 1,
      glyph: "♟",
      influence: [expansion(1), expansion(0, -1)],
      abilities: [
        ability(
          "acolyte-grief",
          "otherDestruction",
          [{ type: "power", amount: 1, target: self }],
          {
            condition: { kind: "eventFriendly" },
            limit: { perTurn: 2, perMatch: 6 },
          },
        ),
      ],
      text: "Expand 1 ahead and above. When another friendly creature is destroyed or sacrificed, gain +1 power. At most twice per turn and six times per lineage per match.",
    },
    {
      id: "crypt-harvester",
      name: "Crypt Harvester",
      type: "replacement",
      rank: 2,
      power: 4,
      glyph: "♝",
      influence: [expansion(1), expansion(0, 1)],
      abilities: [
        ability("harvest-draw", "replacement", [{ type: "draw", amount: 1 }], {
          limit: { perMatch: 1 },
        }),
      ],
      text: "Replace any friendly creature. Expand 1 ahead and below. On replacement, draw 1 card; once per lineage per match.",
    },
    {
      id: "revenant",
      name: "Oathbound Revenant",
      rank: 2,
      power: 4,
      glyph: "♞",
      influence: [expansion(1, 0, 2)],
      abilities: [
        ability(
          "revenant-rise",
          "destruction",
          [{ type: "resurrect", target: "self", limit: 1 }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 2 ahead. On destruction, resurrect on the first eligible friendly empty position. Once per lineage per match; power modifiers persist.",
    },
    {
      id: "death-shepherd",
      name: "Death Shepherd",
      rank: 3,
      power: 5,
      glyph: "♗",
      influence: [expansion(1)],
      abilities: [
        ability(
          "shepherd-recall",
          "placement",
          [{ type: "resurrect", target: "firstFriendly", limit: 1 }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 ahead. On placement, resurrect the first eligible friendly graveyard card. Each lineage may be recalled once by this effect. Evolution requires a matching predecessor.",
    },
    {
      id: "ossuary-monarch",
      name: "Ossuary Monarch",
      type: "evolution",
      rank: 3,
      power: 7,
      glyph: "♚",
      prerequisite: { definitions: ["crypt-harvester", "revenant"] },
      influence: [expansion(1, -1, 2), expansion(1, 1, 2)],
      abilities: [
        ability(
          "monarch-fall",
          "destruction",
          [{ type: "power", amount: -2, target: enemy }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Evolve Crypt Harvester or Oathbound Revenant. Expand 2 diagonally ahead. On destruction, weaken all enemies by 2 simultaneously; once per lineage per match.",
    },
  ]),
  ...kindred("Constructs", [
    {
      id: "brass-scout",
      name: "Brass Scout",
      rank: 1,
      power: 2,
      glyph: "⬡",
      maxCopies: 3,
      influence: [expansion(1), fort(0)],
      text: "Expand 1 ahead. Fortify this position by 1. Development copy limit: 3.",
    },
    {
      id: "bastion",
      name: "Walking Bastion",
      rank: 2,
      power: 4,
      glyph: "▣",
      influence: [expansion(1), fort(0, 0, 2), fort(0, -1, 2), fort(0, 1, 2)],
      text: "Expand 1 ahead. Fortify this position and friendly positions above and below by 2.",
    },
    {
      id: "siege-walker",
      name: "Siege Walker",
      rank: 2,
      power: 3,
      glyph: "⌘",
      influence: [
        { x: 1, y: 0, mechanic: "overthrow", amount: 2 },
        expansion(0, -1),
      ],
      text: "Overthrow unoccupied enemy territory ahead, clearing fortification and establishing 2 tokens. Expand 1 above. Overthrow does not claim neutral territory.",
    },
    {
      id: "aegis-core",
      name: "Aegis Core",
      rank: 2,
      power: 3,
      glyph: "◈",
      influence: [expansion(1), fort(0)],
      protections: ["destruction"],
      abilities: [
        ability(
          "aegis-ward",
          "placement",
          [{ type: "protect", protection: "weakening", target: friendly }],
          { limit: { perMatch: 1 } },
        ),
      ],
      text: "Expand 1 ahead and fortify here by 1. Immune to direct destruction, but can be sacrificed. On placement, give current friendly creatures protection from weakening; once per lineage per match.",
    },
    {
      id: "iron-colossus",
      name: "Iron Colossus",
      type: "replacement",
      rank: 3,
      power: 7,
      glyph: "♜",
      prerequisite: { tags: ["constructs"] },
      influence: [expansion(1, 0, 2), fort(0, -1, 3), fort(0, 1, 3)],
      abilities: [
        ability("colossus-wall", "replacement", [
          { type: "fortify", amount: 2, target: self },
        ]),
      ],
      text: "Replace a friendly Construct. Expand 2 ahead. Fortify friendly positions above and below by 3, then fortify this position by 2.",
    },
    {
      id: "watchwork",
      name: "Watchwork",
      rank: 1,
      power: 1,
      glyph: "⚙",
      influence: [expansion(1)],
      abilities: [
        ability(
          "watch-wind",
          "turnStart",
          [{ type: "power", amount: 1, target: self }],
          { limit: { perTurn: 1, perMatch: 3 } },
        ),
        ability(
          "watch-reinforce",
          "turnEnd",
          [
            {
              type: "tokens",
              amount: 1,
              target: {
                kind: "pattern",
                relation: "friendly",
                offsets: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                ],
              },
            },
          ],
          { limit: { perTurn: 1 } },
        ),
      ],
      text: "Expand 1 ahead. At your turn start gain +1 power, up to 3 times per lineage per match. At your turn end reinforce this and the friendly position ahead by 1 token.",
    },
  ]),
];
export const CARDS: CardLibrary = Object.fromEntries(
  CARD_LIST.map((card) => [card.id, card]),
);
export const KINDREDS: Kindred[] = [
  "Nature",
  "Mythical",
  "Arcane",
  "Undead",
  "Constructs",
];
export const KINDRED_COLORS: Record<Kindred, string> = {
  Nature: "#79b290",
  Mythical: "#da9c71",
  Arcane: "#aca0db",
  Undead: "#9baab1",
  Constructs: "#c6b77d",
};
