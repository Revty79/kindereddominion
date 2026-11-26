export type Player = 0 | 1;
// Collections are content identifiers. The five founding names are baseline data, not an engine limit.
export type Kindred = string;
export type Location =
  | "draw"
  | "hand"
  | "battlefield"
  | "graveyard"
  | "stack"
  | "exile";
export type Position = { row: number; col: number };
export type Offset = { x: number; y: number };
export type Influence = Offset & {
  mechanic: "expansion" | "fortification" | "overthrow";
  amount: number;
};
export type Protection = "destruction" | "weakening";
export type Trigger =
  | "placement"
  | "evolution"
  | "replacement"
  | "destruction"
  | "sacrifice"
  | "turnStart"
  | "turnEnd"
  | "otherPlacement"
  | "otherDestruction";
export type Target = {
  kind: "self" | "event" | "all" | "pattern";
  relation?: "friendly" | "enemy" | "any";
  offsets?: Offset[];
  excludeSelf?: boolean;
  tags?: string[];
};
export type Condition =
  | { kind: "friendlyCount"; atLeast: number }
  | { kind: "sourcePower"; atLeast: number }
  | { kind: "eventFriendly" };
export type Effect =
  | {
      type: "power" | "tokens" | "fortify" | "capture" | "overthrow";
      amount: number;
      target: Target;
    }
  | { type: "destroy" | "return" | "banish"; target: Target }
  | { type: "protect"; protection: Protection; target: Target }
  | { type: "draw"; amount: number }
  | { type: "generate"; card: string; amount: number }
  | { type: "summon"; card: string; target: Target }
  | { type: "replace" | "evolve"; card: string; target: Target }
  | {
      type: "resurrect";
      target: "self" | "firstFriendly";
      limit: number;
      overrideEvolution?: boolean;
    };
export type Ability = {
  id: string;
  trigger: Trigger;
  effects: Effect[];
  condition?: Condition;
  limit?: { perTurn?: number; perMatch?: number; perEvent?: number };
  allowOnResurrect?: boolean;
};
export type Prerequisite = {
  definitions?: string[];
  tags?: string[];
  minPower?: number;
};
export type CardDefinition = {
  id: string;
  name: string;
  kindred: Kindred;
  rank: 1 | 2 | 3;
  power: number;
  type: "standard" | "replacement" | "evolution";
  tags: string[];
  influence: Influence[];
  abilities: Ability[];
  text: string;
  glyph: string;
  prerequisite?: Prerequisite;
  protections?: Protection[];
  maxCopies?: number;
};
export type CardLibrary = Record<string, CardDefinition>;
export type CardInstance = {
  id: string;
  definitionId: string;
  owner: Player;
  location: Location;
  lineage: string;
  modifier: number;
  statuses: Protection[];
  stack: string[];
  activations: Record<string, number>;
  resurrections: number;
};
export type Lineage = {
  activations: Record<string, number>;
  resurrections: number;
};
export type Cell = Position & {
  owner: Player | null;
  tokens: number;
  fortification: number;
  creature: string | null;
};
export type PlayerState = {
  draw: string[];
  hand: string[];
  graveyard: string[];
  exile: string[];
  mulliganDone: boolean;
  turns: number;
};
export type BattlefieldConfig = {
  rows: number;
  cols: number;
  maxTokens: number;
  maxFortification: number;
  starts: {
    player: Player;
    positions: Position[];
    tokens: number;
    fortification: number;
  }[];
};
export type Safeguards = {
  maxResolutionSteps: number;
  maxGeneratedPerMatch: number;
  maxResurrections: number;
  maxCards: number;
};
export type GameConfig = {
  battlefield: BattlefieldConfig;
  scoring: string;
  mode: "standard" | "free";
  collection: Kindred | "mixed";
  deckSize: number;
  openingHand: number;
  maxCopies: number;
  safeguards: Safeguards;
};
export type GameEvent = {
  id: number;
  turn: number;
  type: string;
  text: string;
  player?: Player;
  card?: string;
};
export type Score = {
  rows: { powers: [number, number]; points: [number, number] }[];
  columns: [number, number][];
  creatures: [number, number];
  totals: [number, number];
};
export type MatchResult = {
  winner: Player | null;
  reason: "passes" | "surrender" | "ruleset";
  scores: [number, number];
};
export type GameState = {
  version: 1;
  config: GameConfig;
  seed: number;
  rng: number;
  startingPlayer: Player;
  active: Player;
  phase: "mulligan" | "playing" | "finished" | "fault";
  turn: number;
  passes: number;
  players: [PlayerState, PlayerState];
  board: Cell[];
  cards: Record<string, CardInstance>;
  lineages: Record<string, Lineage>;
  events: GameEvent[];
  nextEvent: number;
  nextCard: number;
  generated: number;
  result: MatchResult | null;
  fault: string | null;
};
export type Action =
  | { type: "mulligan"; player: Player; cards: string[] }
  | { type: "play"; player: Player; card: string; row: number; col: number }
  | { type: "pass"; player: Player }
  | { type: "surrender"; player: Player };

export type DiagnosticStep = {
  sequence: number;
  kind: string;
  message: string;
  details: unknown;
  state?: GameState;
};
export type ResolutionObserver = {
  captureStates?: boolean;
  onStep: (step: DiagnosticStep) => void;
};
