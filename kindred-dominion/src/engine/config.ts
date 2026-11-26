import type { BattlefieldConfig, GameConfig } from "./types";
export function battlefield(rows = 3, cols = 5): BattlefieldConfig {
  return {
    rows,
    cols,
    maxTokens: 3,
    maxFortification: 3,
    starts: [
      {
        player: 0,
        positions: Array.from({ length: rows }, (_, row) => ({ row, col: 0 })),
        tokens: 1,
        fortification: 0,
      },
      {
        player: 1,
        positions: Array.from({ length: rows }, (_, row) => ({
          row,
          col: cols - 1,
        })),
        tokens: 1,
        fortification: 0,
      },
    ],
  };
}
export const DEFAULT_CONFIG: GameConfig = {
  battlefield: battlefield(),
  scoring: "classic",
  mode: "standard",
  collection: "mixed",
  deckSize: 15,
  openingHand: 5,
  maxCopies: 2,
  safeguards: {
    maxResolutionSteps: 300,
    maxGeneratedPerMatch: 30,
    maxResurrections: 2,
    maxCards: 100,
  },
};
