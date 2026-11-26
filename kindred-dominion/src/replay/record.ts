import {
  act,
  assertInvariants,
  createMatch,
  validateConfig,
} from "../engine/game";
import { scoreGame } from "../engine/scoring";
import type {
  Action,
  CardLibrary,
  DiagnosticStep,
  GameConfig,
  GameState,
  Player,
} from "../engine/types";
import { ENGINE_VERSION } from "../content/types";
import { ADVANCED_ENGINE_VERSION } from "../engine/advanced-types";
import { hasAdvancedMechanics } from "../engine/evaluation";
import { engineVersionFor, SUPPORTED_ENGINES, OWNER_ENGINE_VERSION, requiresOwnerRules } from "../engine/versions";
export type RecordedAction = {
  action: Action;
  signature: string;
  turn?: number;
};
export type MatchRecord = {
  schema: 1;
  engineVersion: string;
  id: string;
  name: string;
  contentVersion: string;
  library: CardLibrary;
  config: GameConfig;
  seed: number;
  startingPlayer: Player;
  decks: [string[], string[]];
  initialState: GameState;
  actions: RecordedAction[];
  finalResult: GameState["result"];
  artwork?: Record<string, string>;
};
export function signature(state: GameState): string {
  const string = JSON.stringify(state);
  let hash = 2166136261;
  for (let i = 0; i < string.length; i++)
    hash = Math.imul(hash ^ string.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function newRecord(
  state: GameState,
  library: CardLibrary,
  decks: [string[], string[]],
  contentVersion = "v1.1-baseline",
  name = "Recorded match",
): MatchRecord {
  return structuredClone({
    schema: 1,
    engineVersion: engineVersionFor(library),
    id: `match-${state.seed}-${signature(state)}`,
    name,
    contentVersion,
    library,
    config: state.config,
    seed: state.seed,
    startingPlayer: state.startingPlayer,
    decks,
    initialState: state,
    actions: [],
    finalResult: state.result,
  });
}
export function appendRecord(
  record: MatchRecord,
  action: Action,
  next: GameState,
): MatchRecord {
  return {
    ...record,
    actions: [
      ...record.actions,
      {
        action: structuredClone(action),
        signature: signature(next),
        turn: next.turn,
      },
    ],
    finalResult: structuredClone(next.result),
  };
}
export function replayAt(
  record: MatchRecord,
  index: number,
  captureLast = false,
): { state: GameState; steps: DiagnosticStep[] } {
  if (
    record.schema !== 1 ||
    !SUPPORTED_ENGINES.includes(record.engineVersion) ||
    (record.engineVersion !== OWNER_ENGINE_VERSION && requiresOwnerRules(record.library)) ||
    (record.engineVersion === ENGINE_VERSION &&
      (record.initialState.mechanics || hasAdvancedMechanics(record.library)))
  )
    throw new Error(
      "Replay engine version is incompatible. The record has not been reconstructed.",
    );
  if (!Number.isInteger(index) || index < 0 || index > record.actions.length)
    throw new Error("Replay action index is outside this record.");
  let state = structuredClone(record.initialState);
  assertInvariants(state, record.library);
  const steps: DiagnosticStep[] = [];
  for (let i = 0; i < index; i++) {
    state = act(
      state,
      record.actions[i].action,
      record.library,
      captureLast && i === index - 1
        ? { captureStates: true, onStep: (step) => steps.push(step) }
        : undefined,
    );
    if (signature(state) !== record.actions[i].signature)
      throw new Error(
        `Replay diverged at action ${i + 1}. Historical content or engine compatibility has changed.`,
      );
  }
  return { state, steps };
}
export function validateRecord(value: unknown): void {
  const record = value as MatchRecord;
  if (
    !record ||
    record.schema !== 1 ||
    !SUPPORTED_ENGINES.includes(record.engineVersion) ||
    !record.library ||
    !record.initialState ||
    !Array.isArray(record.actions) ||
    record.actions.length > 2000
  )
    throw new Error("Invalid or incompatible replay.");
  validateConfig(record.initialState.config);
  for (const item of record.actions) {
    const action = item.action;
    if (
      !action ||
      !["mulligan", "play", "pass", "surrender"].includes(action.type) ||
      ![0, 1].includes(action.player)
    )
      throw new Error("Replay contains an unsupported action.");
    if (
      action.type === "play" &&
      (!Number.isInteger(action.row) ||
        !Number.isInteger(action.col) ||
        typeof action.card !== "string")
    )
      throw new Error("Replay placement fields are invalid.");
  }
  for (const url of Object.values(record.artwork ?? {}))
    if (
      typeof url !== "string" ||
      !/^((\.\/|\/)?assets\/[a-z0-9/_\-.]+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(
        url,
      )
    )
      throw new Error(
        "Replay artwork must use portable local assets or experimental embedded raster previews.",
      );
  const result = replayAt(record, record.actions.length).state.result;
  if (JSON.stringify(result) !== JSON.stringify(record.finalResult))
    throw new Error("Replay final result does not match its action sequence.");
}
export function traceAction(
  state: GameState,
  action: Action,
  library: CardLibrary,
) {
  const steps: DiagnosticStep[] = [];
  const before = scoreGame(state, library);
  const next = act(state, action, library, {
    captureStates: true,
    onStep: (step) => steps.push(step),
  });
  steps.push({
    sequence: steps.length,
    kind: "score",
    message: `Score ${before.totals.join("–")} becomes ${scoreGame(next, library).totals.join("–")}.`,
    details: { before, after: scoreGame(next, library) },
    state: structuredClone(next),
  });
  return { state: next, steps };
}
