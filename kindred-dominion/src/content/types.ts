import type { CardDefinition, GameConfig, GameState } from "../engine/types";
import type { MatchRecord } from "../replay/record";
import type { SimulationReport } from "../simulation/types";
export const ENGINE_VERSION = "1.1.0";
export const FORMAT_VERSION = 1;
export type CardStatus = "draft" | "provisional" | "approved" | "archived";
export type CardMetadata = {
  status: CardStatus;
  description: string;
  flavor: string;
  rarity: string;
  artwork: string;
  notes: string;
  sourceArtwork?: string;
  artworkId?: string;
  artworkApproval?: "experimental" | "testing" | "production";
  artworkRef?: { id: string; revision: string };
};
export type Collection = {
  id: string;
  name: string;
  description: string;
  color: string;
  glyph: string;
  target: number;
};
export type TestDeck = {
  id: string;
  name: string;
  subtitle: string;
  strategy: string;
  cards: string[];
  collection: string | "mixed";
};
export type Ruleset = {
  id: string;
  name: string;
  description: string;
  config: GameConfig;
  completion: "twoPasses";
};
export type ContentPack = {
  schema: 1 | 2;
  engineVersion: string;
  id: string;
  name: string;
  createdAt: string;
  kind: "baseline" | "draft" | "checkpoint" | "testing" | "archived";
  cards: CardDefinition[];
  metadata: Record<string, CardMetadata>;
  collections: Collection[];
  decks: TestDeck[];
  rulesets: Ruleset[];
  assets?: import("../assets/types").OfficialAsset[];
};
export type Scenario = {
  id: string;
  name: string;
  description: string;
  content: ContentPack;
  state: GameState;
  savedAt: string;
};
export type Workspace = {
  schema: 1;
  revision: number;
  working: ContentPack;
  versions: ContentPack[];
  activeVersion: string;
  scenarios: Scenario[];
  replays: MatchRecord[];
  reports: SimulationReport[];
};
export type Issue = {
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
};
export type EntityType =
  | "cards"
  | "collections"
  | "decks"
  | "rulesets"
  | "scenarios"
  | "replays"
  | "reports"
  | "content"
  | "backup";
export type Transfer = {
  format: "kindred-dominion-studio";
  schema: 1;
  engineVersion: string;
  type: EntityType;
  exportedAt: string;
  data: unknown;
};
