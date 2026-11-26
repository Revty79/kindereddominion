import { act, legalPlays } from "./game";
import { scoreGame } from "./scoring";
import type { Action, CardLibrary, GameState, Player } from "./types";
function evaluate(
  state: GameState,
  library: CardLibrary,
  player: Player,
): number {
  if (state.phase === "fault") return -1e9;
  if (state.result)
    return state.result.winner === player
      ? 1e6
      : state.result.winner === null
        ? 0
        : -1e6;
  const other = player === 0 ? 1 : 0;
  const score = scoreGame(state, library);
  const territory = state.board.reduce(
    (total, cell) =>
      total +
      (cell.owner === player ? 1 : cell.owner === other ? -1 : 0) *
        (1 + cell.tokens * 0.4 + cell.fortification * 0.15),
    0,
  );
  const powers = score.rows.reduce(
    (total, row) => total + row.powers[player] - row.powers[other],
    0,
  );
  return (
    (score.totals[player] - score.totals[other]) * 2 +
    powers +
    territory +
    (score.creatures[player] - score.creatures[other]) * 1.5
  );
}
// Deterministic one-ply search; every candidate runs through the human action validator.
export function chooseComputerAction(
  state: GameState,
  library: CardLibrary,
): Action {
  const player = state.active;
  const plays = legalPlays(state, library);
  const pass: Action = { type: "pass", player };
  if (!plays.length) return pass;
  let best: Action = pass;
  let value = evaluate(act(state, pass, library), library, player) - 0.25;
  for (const action of plays) {
    const candidate = act(state, action, library);
    const nextValue = evaluate(candidate, library, player);
    if (nextValue > value) {
      best = action;
      value = nextValue;
    }
  }
  return best;
}
export function computerMulligan(
  state: GameState,
  library: CardLibrary,
  player: Player,
): string[] {
  const hand = state.players[player].hand;
  let keptBasics = 0;
  return hand.filter((id) => {
    const card = library[state.cards[id].definitionId];
    if (card.type === "standard" && card.rank === 1 && keptBasics++ < 3)
      return false;
    return true;
  });
}
