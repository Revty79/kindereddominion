import type { CardDefinition, Condition, Target } from "../engine/types";
import type { Numeric } from "../engine/advanced-types";
import type { ContentPack, Scenario } from "./types";
import { baselineContent, defaultMetadata } from "./baseline";
import { addInstance, emptyScenario } from "../sandbox/scenario";
import { battlefield, DEFAULT_CONFIG } from "../engine/config";
import { cellAt } from "../engine/game";

function buildLaboratoryCards(): CardDefinition[] {
  const friends: Target = {
      kind: "all",
      relation: "friendly",
      excludeSelf: true,
    },
    enemies: Target = { kind: "all", relation: "enemy" };
  const count = (
    target: Target,
    what:
      | "creatures"
      | "positions"
      | "tokens"
      | "fortification"
      | "power" = "creatures",
  ): Numeric => ({ kind: "count", what, target });
  const cap = (value: Numeric, max = 6): Numeric => ({
    kind: "clamp",
    min: 0,
    max,
    value,
  });
  const times = (value: Numeric, constant = 2): Numeric => ({
    kind: "multiply",
    value,
    constant,
  });
  const history = (
    event: "destroyed" | "sacrificed",
    relation: "friendly" | "enemy" = "enemy",
  ): Numeric => ({ kind: "history", event, filter: { relation } });
  const c = (
    id: string,
    name: string,
    patch: Partial<CardDefinition> = {},
  ): CardDefinition => ({
    id: `lab-${id}`,
    name: `LAB · ${name}`,
    kindred: "Nature",
    power: 3,
    rank: 1,
    type: "standard",
    tags: ["Laboratory"],
    influence: [
      { x: 1, y: 0, mechanic: "expansion", amount: 1 },
      { x: 0, y: 1, mechanic: "expansion", amount: 1 },
      { x: 0, y: -1, mechanic: "expansion", amount: 1 },
    ],
    abilities: [],
    glyph: "◇",
    text: "V1.3A mechanics fixture. Development only; not a commercial card.",
    ...patch,
  });
  const fortified: Condition = {
    kind: "compare",
    left: count({ kind: "self" }, "fortification"),
    operator: "gte",
    right: 2,
  };
  const cards: CardDefinition[] = [
    c("wolf", "Test Wolf", { tags: ["Wolf", "Beast"] }),
    c("bee", "Honeybee Aura", {
      tags: ["Insect"],
      continuous: [
        {
          id: "bee-adjacent",
          kind: "power",
          amount: 1,
          target: { kind: "adjacent", relation: "friendly", excludeSelf: true },
        },
      ],
    }),
    c("basilisk", "Basilisk Aura", {
      kindred: "Mythical",
      power: 4,
      tags: ["Beast"],
      continuous: [
        {
          id: "basilisk-adjacent",
          kind: "power",
          amount: -2,
          target: { kind: "orthogonal", relation: "enemy" },
        },
      ],
    }),
    c("alpha", "Population Alpha", {
      tags: ["Wolf"],
      scaling: [{ id: "pack", amount: cap(count(friends), 4) }],
    }),
    c("swarm", "Classification Swarm", {
      tags: ["Insect"],
      scaling: [
        {
          id: "insects",
          amount: cap(count({ ...friends, tags: ["Insect"] }), 4),
        },
      ],
    }),
    c("prism", "Enhanced Census", {
      kindred: "Arcane",
      scaling: [
        {
          id: "enhanced",
          amount: cap(times(count({ kind: "all", status: "enhanced" }))),
        },
      ],
    }),
    c("gloom", "Weakened Census", {
      kindred: "Undead",
      scaling: [
        {
          id: "weakened",
          amount: cap(times(count({ ...enemies, status: "weakened" }))),
        },
      ],
    }),
    c("chorus", "Reactive Weakening", {
      kindred: "Undead",
      abilities: [
        {
          id: "weaken-reaction",
          trigger: "otherWeakened",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
      ],
    }),
    c("firstlight", "First Enhancement", {
      kindred: "Mythical",
      abilities: [
        {
          id: "first-light",
          trigger: "firstEnhanced",
          effects: [
            {
              type: "power",
              amount: 2,
              target: {
                kind: "adjacent",
                relation: "friendly",
                excludeSelf: true,
              },
            },
          ],
        },
      ],
    }),
    c("dusk", "First Weakening", {
      kindred: "Undead",
      power: 4,
      abilities: [
        {
          id: "first-dusk",
          trigger: "firstWeakened",
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    }),
    c("threshold", "Threshold Sentry", {
      kindred: "Constructs",
      abilities: [
        {
          id: "threshold",
          trigger: "condition",
          condition: { kind: "sourcePower", atLeast: 5 },
          effects: [
            { type: "draw", amount: 1 },
            { type: "fortify", amount: 1, target: { kind: "self" } },
          ],
        },
      ],
    }),
    c("crossing", "Power Crossing", {
      kindred: "Arcane",
      power: 4,
      abilities: [
        {
          id: "crossing",
          trigger: "powerThreshold",
          threshold: { value: 5, direction: "up" },
          effects: [{ type: "fortify", amount: 2, target: { kind: "self" } }],
        },
      ],
    }),
    c("flytrap", "Variable Sacrifice", {
      type: "replacement",
      tags: ["Plant"],
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
    }),
    c("scavenger", "Destruction Memory", {
      kindred: "Undead",
      scaling: [{ id: "enemy-deaths", amount: cap(history("destroyed"), 4) }],
    }),
    c("carrion", "Sacrifice Memory", {
      kindred: "Undead",
      scaling: [
        {
          id: "friendly-sacrifices",
          amount: cap(history("sacrificed", "friendly"), 4),
        },
      ],
      scoring: [
        {
          id: "death-bonus",
          when: "survives",
          amount: cap(history("destroyed"), 3),
        },
      ],
    }),
    c("ward", "Conditional Allied Protection", {
      kindred: "Constructs",
      continuous: [
        {
          id: "adjacent-protection",
          kind: "protection",
          protection: "destruction",
          target: { kind: "adjacent", relation: "friendly", excludeSelf: true },
          condition: fortified,
        },
      ],
    }),
    c("selfward", "Conditional Weakening Protection", {
      kindred: "Constructs",
      continuous: [
        {
          id: "fortified-immunity",
          kind: "protection",
          protection: "weakening",
          target: { kind: "self" },
          condition: fortified,
        },
      ],
    }),
    c("herald", "Winning Row Bonus", {
      kindred: "Mythical",
      power: 4,
      scoring: [{ id: "row-bonus", when: "rowWon", amount: 2 }],
    }),
    c("marker", "Battlefield Position Bonus", {
      kindred: "Constructs",
      scoring: [
        {
          id: "position-bonus",
          when: "survives",
          amount: 3,
          condition: { kind: "position", row: 1, col: 0 },
        },
      ],
    }),
    c("census", "Territory and Population Score", {
      kindred: "Constructs",
      scoring: [
        {
          id: "population-points",
          when: "survives",
          amount: cap(count(friends), 3),
        },
        {
          id: "fortified-points",
          when: "survives",
          amount: cap(
            count(
              { kind: "all", territory: "friendly", minFortification: 1 },
              "positions",
            ),
            3,
          ),
        },
      ],
      scaling: [
        {
          id: "token-development",
          amount: cap(
            {
              kind: "divide",
              constant: 4,
              rounding: "floor",
              value: count({ kind: "all", territory: "friendly" }, "tokens"),
            },
            4,
          ),
        },
      ],
    }),
    c("echo", "Bounded Reactive Echo", {
      kindred: "Arcane",
      abilities: [
        {
          id: "echo",
          trigger: "otherEnhanced",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
      ],
    }),
    c("border", "Territory Claim Reaction", {
      kindred: "Constructs",
      abilities: [
        {
          id: "border-claim",
          trigger: "territoryClaimed",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "lost-border",
          trigger: "territoryLost",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [
            {
              type: "fortify",
              amount: 1,
              target: { kind: "all", territory: "friendly" },
            },
          ],
        },
      ],
    }),
    c("fortress", "Fortification Reaction", {
      kindred: "Constructs",
      abilities: [
        {
          id: "fortified",
          trigger: "territoryFortified",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "reduced",
          trigger: "fortificationReduced",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "draw", amount: 1 }],
        },
      ],
    }),
    c("gift", "Explicit Enhancement", {
      kindred: "Mythical",
      abilities: [
        {
          id: "gift",
          trigger: "placement",
          effects: [
            { type: "power", amount: 2, target: { ...friends, maxTargets: 1 } },
          ],
        },
      ],
    }),
    c("bruise", "Explicit Friendly Weakening", {
      kindred: "Arcane",
      abilities: [
        {
          id: "bruise",
          trigger: "placement",
          effects: [{ type: "power", amount: -1, target: friends }],
        },
      ],
    }),
    c("claw", "Enemy Weakening", {
      kindred: "Mythical",
      abilities: [
        {
          id: "claw",
          trigger: "placement",
          effects: [
            {
              type: "power",
              amount: -1,
              target: { ...enemies, maxTargets: 2 },
            },
          ],
        },
      ],
    }),
    c("bolt", "Seeded Random Target", {
      kindred: "Arcane",
      abilities: [
        {
          id: "bolt",
          trigger: "placement",
          effects: [
            {
              type: "power",
              amount: -2,
              target: { ...enemies, maxTargets: 1, order: "random" },
            },
          ],
        },
      ],
    }),
    c("dismiss", "Remove Aura Sources", {
      kindred: "Arcane",
      abilities: [
        {
          id: "dismiss",
          trigger: "placement",
          effects: [
            {
              type: "banish",
              target: {
                kind: "all",
                definitions: [
                  "lab-bee",
                  "lab-basilisk",
                  "lab-ward",
                  "lab-selfward",
                ],
              },
            },
          ],
        },
      ],
    }),
    c("rust", "Remove Friendly Fortification", {
      kindred: "Arcane",
      abilities: [
        {
          id: "rust",
          trigger: "placement",
          effects: [
            {
              type: "fortify",
              amount: -2,
              target: { kind: "all", territory: "friendly" },
            },
          ],
        },
      ],
    }),
    c("reaper", "Captured Destruction Power", {
      kindred: "Undead",
      abilities: [
        {
          id: "reap",
          trigger: "placement",
          effects: [{ type: "destroy", target: { ...enemies, maxTargets: 1 } }],
        },
        {
          id: "death-growth",
          trigger: "otherDestruction",
          eventFilter: { relation: "enemy" },
          limit: { perTurn: 1 },
          effects: [
            {
              type: "power",
              target: { kind: "self" },
              amount: cap({ kind: "value", value: "destroyedPower" }, 4),
            },
          ],
        },
      ],
    }),
    c("grave", "Resurrection Test", {
      kindred: "Undead",
      abilities: [
        {
          id: "restore",
          trigger: "placement",
          effects: [{ type: "resurrect", target: "firstFriendly", limit: 1 }],
        },
      ],
    }),
    c("keeper", "Resurrection and Exile Watcher", {
      kindred: "Undead",
      abilities: [
        {
          id: "resurrection-watch",
          trigger: "resurrected",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "tokens", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "banish-watch",
          trigger: "banished",
          limit: { perTurn: 1 },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "return-watch",
          trigger: "returned",
          limit: { perTurn: 1 },
          effects: [{ type: "power", amount: 1, target: { kind: "self" } }],
        },
      ],
    }),
    c("scribe", "Draw and Generation Watcher", {
      kindred: "Arcane",
      abilities: [
        {
          id: "draw-watch",
          trigger: "drawn",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "tokens", amount: 1, target: { kind: "self" } }],
        },
        {
          id: "generation-watch",
          trigger: "generated",
          eventFilter: { relation: "friendly" },
          limit: { perTurn: 1 },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    }),
    c("generator", "Generate and Draw", {
      kindred: "Arcane",
      abilities: [
        {
          id: "supply",
          trigger: "placement",
          effects: [
            { type: "generate", amount: 1, card: "lab-wolf" },
            { type: "draw", amount: 1 },
          ],
        },
      ],
    }),
    c("star-wolf", "Stack Depth Scaling", {
      kindred: "Mythical",
      type: "evolution",
      tags: ["Wolf"],
      prerequisite: { definitions: ["lab-wolf", "lab-alpha"] },
      scaling: [
        {
          id: "stages",
          amount: cap(
            times({
              kind: "subtract",
              left: { kind: "value", value: "stackDepth" },
              right: 1,
            }),
            6,
          ),
        },
      ],
    }),
    c("imperial-wolf", "Evolved Row Aura", {
      kindred: "Mythical",
      type: "evolution",
      tags: ["Wolf"],
      prerequisite: { definitions: ["lab-star-wolf"] },
      continuous: [
        {
          id: "row-aura",
          kind: "power",
          amount: 1,
          target: { kind: "row", relation: "friendly", excludeSelf: true },
        },
      ],
    }),
    c("dawn-wolf", "Branch and Column Score", {
      kindred: "Mythical",
      type: "evolution",
      tags: ["Wolf"],
      prerequisite: { tags: ["Wolf"] },
      scoring: [{ id: "column-bonus", when: "columnWon", amount: 2 }],
    }),
    c("combined", "Combined Conditional Chain", {
      kindred: "Arcane",
      abilities: [
        {
          id: "combined",
          trigger: "condition",
          condition: {
            kind: "and",
            conditions: [
              { kind: "friendlyCount", atLeast: 2 },
              { kind: "not", condition: { kind: "position", col: 4 } },
            ],
          },
          effects: [
            { type: "fortify", amount: 1, target: { kind: "self" } },
            { type: "draw", amount: 1 },
          ],
        },
      ],
    }),
    c("power-sum", "Pre-dynamic Power Aggregate", {
      kindred: "Arcane",
      scaling: [
        {
          id: "power-sum",
          amount: cap(
            {
              kind: "divide",
              value: count(friends, "power"),
              constant: 3,
              rounding: "floor",
            },
            6,
          ),
        },
      ],
    }),
    c("space", "Unoccupied Position Scaling", {
      kindred: "Constructs",
      scaling: [
        {
          id: "space",
          amount: cap(
            {
              kind: "divide",
              value: count(
                { kind: "all", territory: "friendly", occupied: "empty" },
                "positions",
              ),
              constant: 2,
              rounding: "floor",
            },
            4,
          ),
        },
      ],
    }),
    c("derived", "Opt-in Dynamic Reaction", {
      kindred: "Arcane",
      scaling: [{ id: "population", amount: cap(count(friends), 3) }],
      abilities: [
        {
          id: "derived-reaction",
          trigger: "enhanced",
          eventFilter: { powerChanges: ["dynamic"] },
          limit: { perTurn: 1, perMatch: 2 },
          effects: [{ type: "fortify", amount: 1, target: { kind: "self" } }],
        },
      ],
    }),
    c("recaller", "Return Event Producer", {
      kindred: "Arcane",
      abilities: [
        {
          id: "recall",
          trigger: "placement",
          effects: [{ type: "return", target: { ...enemies, maxTargets: 1 } }],
        },
      ],
    }),
    c("offering", "Incoming Replacement Context", {
      kindred: "Undead",
      abilities: [
        {
          id: "incoming-gift",
          trigger: "sacrifice",
          effects: [{ type: "power", amount: 1, target: { kind: "incoming" } }],
        },
      ],
    }),
    c("death-context", "Destroyed Context After Resurrection", {
      kindred: "Undead",
      abilities: [
        {
          id: "dead-context",
          trigger: "destruction",
          limit: { perMatch: 1 },
          effects: [
            { type: "resurrect", target: "self", limit: 1 },
            { type: "power", amount: 1, target: { kind: "destroyed" } },
          ],
        },
      ],
    }),
    c("sacrifice-context", "Sacrificed Context After Resurrection", {
      kindred: "Undead",
      abilities: [
        {
          id: "sacrifice-context",
          trigger: "sacrifice",
          limit: { perMatch: 1 },
          effects: [
            { type: "resurrect", target: "self", limit: 1 },
            { type: "power", amount: 1, target: { kind: "sacrificed" } },
          ],
        },
      ],
    }),
  ];

  return cards;
}
let cached: ContentPack | undefined;
export function laboratoryContent(): ContentPack {
  if (!cached) {
    const cards = buildLaboratoryCards();
    const base = baselineContent(),
      names = [
        [
          "laboratory-continuous",
          "Auras and populations",
          [
            "bee",
            "basilisk",
            "alpha",
            "swarm",
            "prism",
            "gloom",
            "power-sum",
            "space",
            "wolf",
            "gift",
            "claw",
            "ward",
            "dismiss",
            "star-wolf",
            "imperial-wolf",
          ],
        ],
        [
          "laboratory-reactive",
          "Reactions and transitions",
          [
            "wolf",
            "chorus",
            "firstlight",
            "dusk",
            "threshold",
            "crossing",
            "echo",
            "combined",
            "gift",
            "bruise",
            "border",
            "fortress",
            "scribe",
            "generator",
            "derived",
          ],
        ],
        [
          "laboratory-lifecycle",
          "Sacrifice and history",
          [
            "wolf",
            "offering",
            "flytrap",
            "scavenger",
            "carrion",
            "reaper",
            "grave",
            "keeper",
            "recaller",
            "death-context",
            "sacrifice-context",
            "gift",
            "star-wolf",
            "dawn-wolf",
            "imperial-wolf",
          ],
        ],
        [
          "laboratory-scoring",
          "Protection and scoring",
          [
            "wolf",
            "ward",
            "selfward",
            "herald",
            "marker",
            "census",
            "border",
            "fortress",
            "rust",
            "gift",
            "bolt",
            "power-sum",
            "space",
            "dawn-wolf",
            "derived",
          ],
        ],
      ] as const;
    cached = {
      ...base,
      schema: 2,
      engineVersion: "1.3.0",
      id: "mechanics-laboratory-v1.3a",
      name: "V1.3A · mechanics laboratory",
      kind: "testing",
      createdAt: "2026-11-26T00:00:00Z",
      cards: structuredClone(cards),
      metadata: Object.fromEntries(
        cards.map((c) => [
          c.id,
          {
            ...defaultMetadata(),
            notes:
              "Development fixture, separate from both preserved Founding Kindreds libraries.",
          },
        ]),
      ),
      decks: names.map(([id, name, ids]) => ({
        id,
        name,
        subtitle: "Development-only mechanics experiment",
        strategy: name,
        collection: "mixed",
        cards: ids.map((id) => `lab-${id}`),
      })),
      rulesets: [
        ...base.rulesets,
        ...base.rulesets.map((r) => ({
          ...r,
          id: `lab-wide-${r.id}`,
          name: `Laboratory 4×8 · ${r.name}`,
          config: {
            ...structuredClone(r.config),
            battlefield: battlefield(4, 8),
          },
        })),
      ],
    };
  }
  return structuredClone(cached);
}
type Placement = {
  card: string;
  owner?: 0 | 1;
  row?: number;
  col?: number;
  zone?: "hand" | "battlefield" | "graveyard" | "draw";
  modifier?: number;
  fortification?: number;
};
const board = (
  card: string,
  row = 1,
  col = 0,
  extra: Partial<Placement> = {},
): Placement => ({ card, row, col, ...extra });
const hand = (card: string): Placement => ({ card, zone: "hand" });
let scenarios: Scenario[] | undefined;
export function laboratoryScenarios(): Scenario[] {
  if (scenarios) return structuredClone(scenarios);
  const content = laboratoryContent();
  const entries: [string, string, string, Placement[]][] = [
    [
      "aura",
      "Continuous enhancement — remove its source",
      "Inspect the Wolf, execute Dismiss at an empty friendly position, then inspect the lost aura.",
      [board("bee", 0), board("wolf"), hand("dismiss")],
    ],
    [
      "weakening",
      "Continuous weakening — remove its source",
      "The Basilisk weakens an orthogonally adjacent enemy. Dismiss removes it and restores power.",
      [
        board("basilisk", 1, 3, { owner: 1 }),
        board("wolf", 1, 2),
        hand("dismiss"),
      ],
    ],
    [
      "population",
      "Dynamic friendly population",
      "Play another Wolf and inspect the Alpha increasing without a permanent modifier.",
      [board("alpha"), board("wolf", 0), hand("wolf")],
    ],
    [
      "classification",
      "Classification-based scaling",
      "Play the Honeybee; only its Insect classification qualifies for the Swarm.",
      [board("swarm"), board("wolf", 0), hand("bee")],
    ],
    [
      "enhanced",
      "Enhanced-creature scaling",
      "The enhanced Wolf qualifies before dynamic bonuses. Play Gift and inspect each layer.",
      [board("prism"), board("wolf", 0, 0, { modifier: 1 }), hand("gift")],
    ],
    [
      "weakened",
      "Weakened-enemy scaling",
      "Play Claw and compare the enemy weakening with the Gloom scaling contribution.",
      [
        board("gloom"),
        board("wolf", 1, 4, { owner: 1, modifier: -1 }),
        hand("claw"),
      ],
    ],
    [
      "react-weak",
      "Reactive weakening chain",
      "Bruise weakens other friendly creatures. Chorus reacts to real other-creature weakening once per turn.",
      [board("chorus"), board("wolf", 0), hand("bruise")],
    ],
    [
      "react-enhance",
      "First enhancement and a multi-step chain",
      "Gift enhances Firstlight; its first enhancement grants adjacent allies a permanent bonus.",
      [board("firstlight", 0), board("wolf"), hand("gift")],
    ],
    [
      "threshold",
      "False-to-true threshold",
      "Gift raises the Sentry to its power threshold, drawing and fortifying once this match.",
      [board("threshold"), hand("gift"), { card: "wolf", zone: "draw" }],
    ],
    [
      "crossing",
      "Power crossing event",
      "Gift crosses the configured threshold. Inspect the structured previous/new power event.",
      [board("crossing"), hand("gift")],
    ],
    [
      "sacrifice",
      "Captured variable sacrifice power",
      "Replace the enhanced Wolf with Flytrap; half the captured power is rounded down.",
      [
        board("wolf", 1, 0, { modifier: 2 }),
        hand("flytrap"),
        board("carrion", 0),
      ],
    ],
    [
      "protection",
      "Conditional protection disappears",
      "Ward protects the neighboring Wolf while fortified. Rust removes that qualification.",
      [board("ward", 0, 0, { fortification: 2 }), board("wolf"), hand("rust")],
    ],
    [
      "immunity",
      "Conditional weakening immunity",
      "Selfward is immune while fortified. Rust removes its continuous protection.",
      [
        board("selfward", 1, 0, { fortification: 2 }),
        hand("rust"),
        hand("bruise"),
      ],
    ],
    [
      "destruction",
      "Destruction history and immutable power",
      "Reaper destroys an enemy. Scavenger scales with history while Reaper uses captured power.",
      [board("scavenger"), board("wolf", 1, 4, { owner: 1 }), hand("reaper")],
    ],
    [
      "territory",
      "Claimed territory reactions",
      "Play a Wolf to expand into neutral territory; Border reacts only to a successful claim.",
      [board("border"), hand("wolf")],
    ],
    [
      "row-score",
      "Row-winning score bonus",
      "Inspect ordinary row power and the separate Herald bonus. Play another card to compare.",
      [board("herald"), board("wolf", 1, 4, { owner: 1 }), hand("wolf")],
    ],
    [
      "position-score",
      "Position score bonus",
      "Marker survives at row 1 / column 0. Inspect the separate card points.",
      [board("marker"), hand("wolf")],
    ],
    [
      "combined",
      "Combined AND / NOT conditions",
      "A second friendly creature makes the condition true. Inspect the fortification/draw chain.",
      [board("combined"), hand("wolf"), { card: "wolf", zone: "draw" }],
    ],
    [
      "evolution",
      "Branching and multi-stage evolution",
      "Evolve the Wolf into Star Wolf; the later Imperial form replaces its dynamic ability with a row aura.",
      [
        board("wolf"),
        hand("star-wolf"),
        hand("imperial-wolf"),
        hand("dawn-wolf"),
      ],
    ],
    [
      "resurrection",
      "Resurrection counter and reaction",
      "Grave restores a friendly Wolf. Keeper observes the real resurrection.",
      [board("keeper"), { card: "wolf", zone: "graveyard" }, hand("grave")],
    ],
    [
      "territory-score",
      "Fortified territory and token aggregation",
      "Inspect the token-derived scaling and fortified-territory score independently.",
      [
        board("census", 1, 0, { fortification: 2 }),
        board("fortress", 0),
        hand("rust"),
      ],
    ],
    [
      "draw-generate",
      "Draw and generation events",
      "Generator creates a Wolf and draws a card; Scribe observes both successful events.",
      [board("scribe"), hand("generator"), { card: "wolf", zone: "draw" }],
    ],
    [
      "derived",
      "Explicit opt-in derived power reaction",
      "Adding a friendly creature changes derived power; this card explicitly reacts to dynamic changes.",
      [board("derived"), hand("wolf")],
    ],
    [
      "power-sum",
      "Safe current-power aggregate",
      "The Sum reads eligible creatures before dynamic scaling, so it cannot recursively count its own bonus.",
      [board("power-sum"), board("wolf", 0), hand("bee")],
    ],
    [
      "first-weakened",
      "First weakening event",
      "Bruise weakens Dusk; its first successful weakening grants fortification once this match.",
      [board("dusk"), hand("bruise")],
    ],
    [
      "return",
      "Returned creature reaction",
      "Recall returns the enemy Wolf; Keeper reacts to the successful zone change.",
      [board("keeper"), board("wolf", 1, 4, { owner: 1 }), hand("recaller")],
    ],
    [
      "incoming",
      "Incoming replacement targeting",
      "Replace Offering with Flytrap. The sacrificed creature boosts the incoming replacement through its captured identity.",
      [board("offering"), hand("flytrap")],
    ],
    [
      "destroyed-context",
      "Destroyed context remains exact after resurrection",
      "Reaper destroys the enemy test creature, which resurrects and then targets its exact destroyed instance.",
      [board("death-context", 1, 4, { owner: 1 }), hand("reaper")],
    ],
    [
      "sacrificed-context",
      "Sacrificed context remains exact after resurrection",
      "Replace the test creature with Flytrap. It resurrects elsewhere, then targets its original sacrificed identity.",
      [board("sacrifice-context"), hand("flytrap")],
    ],
    [
      "capture",
      "Captured and lost territory reactions",
      "Player Two places a Wolf at A5 to capture A4. Border observes the real loss and fortifies remaining friendly territory.",
      [board("border"), { card: "wolf", zone: "hand", owner: 1 }],
    ],
  ];
  scenarios = entries.map(([id, name, description, placements]) => {
    let state = emptyScenario(content, DEFAULT_CONFIG).state;
    for (const p of placements) {
      state = addInstance(
        state,
        `lab-${p.card}`,
        p.owner ?? 0,
        p.zone ?? "battlefield",
        p.zone && p.zone !== "battlefield"
          ? undefined
          : { row: p.row ?? 1, col: p.col ?? 0 },
      );
      const instance = state.cards[`c${state.nextCard - 1}`];
      if (p.modifier !== undefined) instance.modifier = p.modifier;
      if (p.fortification !== undefined)
        cellAt(state, p.row ?? 1, p.col ?? 0)!.fortification = p.fortification;
    }
    if (id === "capture") {
      state.active = 1;
      Object.assign(cellAt(state, 0, 3)!, { owner: 0, tokens: 1 });
    }
    return {
      id: `lab-v1.3a-${id}`,
      name: `LAB · ${name}`,
      description,
      content: structuredClone(content),
      state,
      savedAt: "2026-11-26T00:00:00Z",
    };
  });
  return structuredClone(scenarios);
}
