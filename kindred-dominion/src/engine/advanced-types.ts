import type {
  CardDefinition,
  Player,
  Position,
  Protection,
  Target,
  Condition,
} from "./types";

export const ADVANCED_ENGINE_VERSION = "1.3.0";
export const MAX_POWER = 100_000;
export const MAX_EXPRESSION_DEPTH = 8;
export const HISTORY_EVENTS = [
  "played",
  "destroyed",
  "sacrificed",
  "resurrected",
  "evolved",
  "replaced",
  "enhanced",
  "weakened",
  "generated",
  "drawn",
  "claimed",
  "captured",
  "lost",
  "fortified",
  "fortificationReduced",
  "banished",
  "returned",
] as const;
export type HistoryEvent = (typeof HISTORY_EVENTS)[number];
export type HistoryFilter = {
  relation?: "friendly" | "enemy" | "any";
  definitions?: string[];
  tags?: string[];
  kindreds?: string[];
  causes?: string[];
};
export type Numeric =
  | number
  | {
      kind: "value";
      value:
        | "sourceBase"
        | "sourcePower"
        | "sourceIntrinsic"
        | "sourcePreDynamic"
        | "targetBase"
        | "targetPower"
        | "targetIntrinsic"
        | "targetPreDynamic"
        | "eventPower"
        | "sacrificedPower"
        | "destroyedPower"
        | "incomingPower"
        | "stackDepth";
    }
  | {
      kind: "count";
      what: "creatures" | "positions" | "tokens" | "fortification" | "power";
      target: Target;
    }
  | { kind: "history"; event: HistoryEvent; filter?: HistoryFilter }
  | { kind: "add" | "subtract"; left: Numeric; right: Numeric }
  | {
      kind: "multiply" | "divide";
      value: Numeric;
      constant: number;
      rounding?: "floor" | "ceil" | "nearest" | "truncate";
    }
  | { kind: "clamp"; value: Numeric; min: number; max: number };
export type AdvancedCondition =
  | { kind: "and" | "or"; conditions: Condition[] }
  | { kind: "not"; condition: Condition }
  | {
      kind: "compare";
      left: Numeric;
      operator: "gte" | "gt" | "lte" | "lt" | "eq" | "ne";
      right: Numeric;
    }
  | { kind: "position"; row?: number; col?: number; edge?: boolean }
  | {
      kind: "evolutionStage";
      definitions?: string[];
      tags?: string[];
      atLeast?: number;
      target?: Target;
    };
export type ContinuousEffect = {
  id: string;
  target: Target;
  condition?: Condition;
} & (
  | { kind: "power"; amount: Numeric }
  | { kind: "protection"; protection: Protection }
);
export type DynamicScaling = {
  id: string;
  amount: Numeric;
  condition?: Condition;
};
export type ScoringBonus = {
  id: string;
  when: "survives" | "rowWon" | "columnWon";
  amount: Numeric;
  condition?: Condition;
};
export type EventParticipant = {
  id: string;
  definitionId: string;
  name: string;
  owner: Player;
  tags: string[];
  kindred: string;
  basePower: number;
  effectivePower: number;
  modifier: number;
  protections: Protection[];
  stackDepth: number;
  position?: Position;
  cause?: string;
};
export type PowerChange = {
  eventId: number;
  creature: string;
  previous: number;
  current: number;
  amount: number;
  source?: string;
  cause: string;
  kind: "permanent" | "aura" | "dynamic";
  permanent: boolean;
  continuous: boolean;
  dynamic: boolean;
  components: { permanent: number; aura: number; dynamic: number };
};
export type EventContext = {
  id: number;
  card?: string;
  player: Player;
  resurrected?: boolean;
  actor?: Player;
  cause?: string;
  participant?: EventParticipant;
  removed?: EventParticipant;
  incoming?: EventParticipant;
  change?: PowerChange;
  chain?: string[];
  position?: Position;
  firstKinds?: PowerChange["kind"][];
};
export type EventFilter = HistoryFilter & {
  excludeSelf?: boolean;
  powerChanges?: PowerChange["kind"][];
};
export type HistoryBucket = {
  event: HistoryEvent;
  player: Player;
  definitionId?: string;
  tags: string[];
  kindred?: string;
  cause: string;
  count: number;
};
export type MechanicsState = {
  version: 2;
  history: HistoryBucket[];
  thresholds: Record<string, boolean>;
  firstChanges: Record<string, boolean>;
};
export type PowerContribution = {
  source: string;
  ability: string;
  amount: number;
};
export type PowerBreakdown = {
  base: number;
  permanent: number;
  permanentEnhancement: number;
  permanentWeakening: number;
  intrinsic: number;
  aura: number;
  preDynamic: number;
  dynamic: number;
  effective: number;
  auras: PowerContribution[];
  scaling: PowerContribution[];
  permanentProtections: Protection[];
  continuousProtections: {
    source: string;
    ability: string;
    protection: Protection;
  }[];
};
export type AdvancedCard = Pick<
  CardDefinition,
  "continuous" | "scaling" | "scoring"
>;
