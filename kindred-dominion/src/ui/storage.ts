import { assertInvariants } from "../engine/game";
import { CARDS } from "../data/cards";
import type { GameState, CardLibrary } from "../engine/types";
import type { MatchRecord } from "../replay/record";
export type Session = {
  schema: 1;
  game: GameState;
  decks: [string[], string[]];
  opponent: "computer" | "local";
  deckNames: [string, string];
  library?: CardLibrary;
  contentVersion?: string;
  record?: MatchRecord;
};
const KEY = "kindred-dominion:v1:match";
export function readSession(): Session | null {
  try {
    const saved = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Session | null;
    if (
      !saved ||
      saved.schema !== 1 ||
      saved.game.version !== 1 ||
      !["mulligan", "playing", "finished", "fault"].includes(saved.game.phase)
    )
      return null;
    if (
      saved.game.board.length !==
      saved.game.config.battlefield.rows * saved.game.config.battlefield.cols
    )
      return null;
    assertInvariants(saved.game, saved.library ?? CARDS);
    return saved;
  } catch {
    return null;
  }
}
export function saveSession(session: Session): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Storage may be disabled. */
  }
}
export function readCustomDecks(
  library: CardLibrary = CARDS,
  version = "v1.1-baseline",
): [string[], string[]] {
  try {
    const value = JSON.parse(
      localStorage.getItem(
        version === "v1.1-baseline"
          ? "kindred-dominion:v1:decks"
          : `kindred-dominion:decks:${version}`,
      ) ?? "null",
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(
        (deck) =>
          Array.isArray(deck) &&
          deck.length <= 15 &&
          deck.every((id) => typeof id === "string" && library[id]),
      )
    )
      return [value[0], value[1]];
  } catch {
    /* Use empty drafts if storage is unavailable. */
  }
  return [[], []];
}
export function saveCustomDecks(
  decks: [string[], string[]],
  version = "v1.1-baseline",
): boolean {
  try {
    localStorage.setItem(
      version === "v1.1-baseline"
        ? "kindred-dominion:v1:decks"
        : `kindred-dominion:decks:${version}`,
      JSON.stringify(decks),
    );
    return true;
  } catch {
    return false;
  }
}
