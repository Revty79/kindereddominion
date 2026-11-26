import { CARD_LIST, KINDRED_COLORS, KINDREDS } from "../data/cards";
import { DECKS } from "../data/decks";
import { DEFAULT_CONFIG } from "../engine/config";
import type { CardMetadata, ContentPack, Workspace } from "./types";
import { ENGINE_VERSION } from "./types";
export const defaultMetadata = (): CardMetadata => ({
  status: "draft",
  description: "",
  flavor: "",
  rarity: "",
  artwork: "",
  notes: "",
});
export function baselineContent(): ContentPack {
  return {
    schema: 1,
    engineVersion: ENGINE_VERSION,
    id: "v1.1-baseline",
    name: "Original V1.1 — 30 provisional cards",
    createdAt: "2026-11-26T00:00:00Z",
    kind: "baseline",
    cards: structuredClone(CARD_LIST),
    metadata: Object.fromEntries(
      CARD_LIST.map((c) => [
        c.id,
        { ...defaultMetadata(), status: "provisional" },
      ]),
    ),
    collections: KINDREDS.map((id) => ({
      id,
      name: id,
      description:
        {
          Nature: "Expansion, cooperation and population",
          Mythical: "Power, destruction and resilience",
          Arcane: "Manipulation, transformation and disruption",
          Undead: "Sacrifice, resurrection and death",
          Constructs: "Fortification, protection and defense",
        }[id] ?? "",
      color: KINDRED_COLORS[id],
      glyph: "◇",
      target: 30,
    })),
    decks: DECKS.map((d) => ({
      ...structuredClone(d),
      strategy: d.subtitle,
      collection: "mixed",
    })),
    rulesets: ["classic", "domination"].map((id) => ({
      id,
      name: id === "classic" ? "Classic" : "Domination",
      description:
        id === "classic"
          ? "Full power of winning rows; tied rows score zero."
          : "Classic plus one point per surviving creature.",
      config: { ...structuredClone(DEFAULT_CONFIG), scoring: id },
      completion: "twoPasses",
    })),
  };
}
export function initialWorkspace(): Workspace {
  const base = baselineContent();
  return {
    schema: 1,
    revision: 0,
    working: {
      ...structuredClone(base),
      id: "working",
      name: "Working drafts",
      kind: "draft",
    },
    versions: [base],
    activeVersion: base.id,
    scenarios: [],
    replays: [],
    reports: [],
  };
}
