import type { ContentPack, TestDeck } from "../content/types";
import type { GameConfig, Player } from "../engine/types";
import type { MatchRecord } from "../replay/record";
export type SimulationRequest = {
  content: ContentPack;
  decks: TestDeck[];
  pairings: "single" | "roundRobin";
  matches: number;
  seed: number;
  config: GameConfig;
  maxActions: number;
  mirrored: boolean;
  retainExamples: boolean;
};
export type CardStatistics = {
  included: number;
  drawn: number;
  played: number;
  replaced: number;
  evolved: number;
  destroyed: number;
  resurrected: number;
  abilities: number;
  territory: number;
  wins: number;
  losses: number;
};
export type MatchSummary = {
  seed: number;
  pairing: [string, string];
  starter: Player;
  status: "completed" | "timeout" | "fault" | "invariant";
  winner: Player | null;
  actions: number;
  scores: [number, number];
  reason: string;
  signature: string;
  error?: string;
  replay?: MatchRecord;
};
export type DeckStatistics = {
  attempted: number;
  completed: number;
  wins: number;
  losses: number;
  draws: number;
  firstWins: number;
  firstGames: number;
  secondWins: number;
  secondGames: number;
  score: number;
};
export type SimulationReport = {
  schema: 1;
  engineVersion: string;
  id: string;
  name: string;
  request: SimulationRequest;
  attempted: number;
  completed: number;
  draws: number;
  timeouts: number;
  faults: number;
  invariants: number;
  loopSafeguards: number;
  cancelled: boolean;
  elapsedMs: number;
  actions: { sum: number; min: number; max: number };
  scores: [number, number];
  scoreDifference: number;
  first: { games: number; wins: number };
  reasons: Record<string, number>;
  decks: Record<string, DeckStatistics>;
  cards: Record<string, CardStatistics>;
  matchups: Record<
    string,
    { completed: number; wins: [number, number]; draws: number }
  >;
  examples: MatchSummary[];
  failures: MatchSummary[];
  digest: string;
};
