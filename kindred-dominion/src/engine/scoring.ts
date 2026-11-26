import type { CardLibrary, GameState, Player, Score } from "./types";
import {
  evaluateCondition,
  evaluateNumber,
  powerBreakdown,
  powerTable,
} from "./evaluation";
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
  return state.mechanics
    ? powerBreakdown(state, library, id).effective
    : library[card.definitionId].power + card.modifier;
}
function classic(state: GameState, library: CardLibrary): Score {
  const powers = state.mechanics ? powerTable(state, library) : null;
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
        powers
          ? powers[cell.creature].effective
          : currentPower(state, library, cell.creature),
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
export const scoreGame = (state: GameState, library: CardLibrary): Score => {
  const score = SCORING_RULES[state.config.scoring].score(state, library);
  if (!state.mechanics) return score;
  const powers = powerTable(state, library);
  const scoreBound = (n: number) => {
    if (
      !Number.isSafeInteger(n) ||
      Math.abs(n) > 100000 * state.config.safeguards.maxCards * 2
    )
      throw new Error("Score safety ceiling exceeded.");
    return n;
  };
  const ordinary: [number, number] = [0, 0],
    tactical: [number, number] =
      state.config.scoring === "domination" ? [...score.creatures] : [0, 0],
    bonuses: [number, number] = [0, 0];
  for (const row of score.rows) {
    ordinary[0] += row.points[0];
    ordinary[1] += row.points[1];
  }
  const sources: NonNullable<Score["breakdown"]>["sources"] = [];
  const columns: [number, number][] = Array.from(
    { length: state.config.battlefield.cols },
    () => [0, 0],
  );
  for (const cell of state.board)
    if (cell.creature)
      columns[cell.col][state.cards[cell.creature].owner] += Math.max(
        0,
        powers[cell.creature].effective,
      );
  for (const cell of state.board)
    if (cell.creature) {
      const card = state.cards[cell.creature],
        other = card.owner === 0 ? 1 : 0;
      for (const b of library[card.definitionId].scoring ?? []) {
        if (
          (b.when === "rowWon" &&
            score.rows[cell.row].powers[card.owner] <=
              score.rows[cell.row].powers[other]) ||
          (b.when === "columnWon" &&
            columns[cell.col][card.owner] <= columns[cell.col][other])
        )
          continue;
        const e = {
          state,
          library,
          source: card.id,
          power: (id: string) => powers[id]?.effective ?? 0,
          statusPower: (id: string) => powers[id]?.preDynamic ?? 0,
        };
        if (!evaluateCondition(b.condition, e)) continue;
        const points = Math.max(0, evaluateNumber(b.amount, e));
        bonuses[card.owner] = scoreBound(bonuses[card.owner] + points);
        sources.push({
          source: card.id,
          ability: b.id,
          player: card.owner,
          points,
        });
      }
    }
  score.breakdown = { ordinary, tactical, bonuses, sources };
  score.totals = [
    scoreBound(score.totals[0] + bonuses[0]),
    scoreBound(score.totals[1] + bonuses[1]),
  ];
  return score;
};
