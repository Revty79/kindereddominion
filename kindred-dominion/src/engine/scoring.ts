import type { CardLibrary, GameState, Player, Score } from "./types";
export type ScoringRule = {
  name: string;
  description: string;
  score: (state: GameState, library: CardLibrary) => Score;
  complete?: (state: GameState) => boolean;
};
export function currentPower(
  state: GameState,
  library: CardLibrary,
  id: string,
): number {
  const card = state.cards[id];
  return library[card.definitionId].power + card.modifier;
}
function classic(state: GameState, library: CardLibrary): Score {
  const rows: Score["rows"] = Array.from(
    { length: state.config.battlefield.rows },
    () => ({ powers: [0, 0], points: [0, 0] }),
  );
  const columns: Score["columns"] = Array.from(
    { length: state.config.battlefield.cols },
    () => [0, 0],
  );
  const creatures: [number, number] = [0, 0];
  for (const cell of state.board)
    if (cell.creature) {
      const owner = state.cards[cell.creature].owner;
      rows[cell.row].powers[owner] += Math.max(
        0,
        currentPower(state, library, cell.creature),
      );
      columns[cell.col][owner]++;
      creatures[owner]++;
    }
  const totals: [number, number] = [0, 0];
  for (const row of rows) {
    if (row.powers[0] !== row.powers[1]) {
      const winner: Player = row.powers[0] > row.powers[1] ? 0 : 1;
      row.points[winner] = row.powers[winner];
      totals[winner] += row.points[winner];
    }
  }
  return { rows, columns, creatures, totals };
}
export const SCORING_RULES: Record<string, ScoringRule> = {
  classic: {
    name: "Classic",
    description:
      "Win rows. Score the full power of each row you win. Ties score zero.",
    score: classic,
  },
  domination: {
    name: "Domination",
    description:
      "Classic scoring, plus one point for every surviving creature.",
    score: (state, library) => {
      const score = classic(state, library);
      score.totals = [
        score.totals[0] + score.creatures[0],
        score.totals[1] + score.creatures[1],
      ];
      return score;
    },
  },
};
export const scoreGame = (state: GameState, library: CardLibrary): Score =>
  SCORING_RULES[state.config.scoring].score(state, library);
