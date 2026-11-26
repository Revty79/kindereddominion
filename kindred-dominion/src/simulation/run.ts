import { act, assertInvariants, createMatch } from "../engine/game";
import { chooseComputerAction, computerMulligan } from "../engine/ai";
import { scoreGame } from "../engine/scoring";
import { libraryOf, validatePack, validateRules } from "../content/validation";
import { ENGINE_VERSION } from "../content/types";
import { appendRecord, newRecord, signature } from "../replay/record";
import type { GameState, Player } from "../engine/types";
import type {
  CardStatistics,
  DeckStatistics,
  MatchSummary,
  SimulationReport,
  SimulationRequest,
} from "./types";
const emptyCard = (): CardStatistics => ({
  included: 0,
  drawn: 0,
  played: 0,
  replaced: 0,
  evolved: 0,
  destroyed: 0,
  resurrected: 0,
  abilities: 0,
  territory: 0,
  wins: 0,
  losses: 0,
});
const emptyDeck = (): DeckStatistics => ({
  attempted: 0,
  completed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  firstWins: 0,
  firstGames: 0,
  secondWins: 0,
  secondGames: 0,
  score: 0,
});
export function pairings(request: SimulationRequest): [number, number][] {
  if (request.pairings === "single") return [[0, 1]];
  return request.decks.flatMap((_, i) =>
    request.decks.slice(i).map((__, j) => [i, i + j] as [number, number]),
  );
}
export function validateSimulation(request: SimulationRequest): void {
  const errors = [
    ...validatePack(request.content),
    ...validateRules(request.config),
  ].filter((i) => i.severity === "error");
  if (errors.length)
    throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  if (
    request.decks.length < 2 ||
    request.decks.length > 20 ||
    !Number.isInteger(request.matches) ||
    request.matches < 1 ||
    request.matches > 10000 ||
    !Number.isInteger(request.maxActions) ||
    request.maxActions < 1 ||
    request.maxActions > 2000 ||
    !Number.isSafeInteger(request.seed) ||
    request.seed < 0 ||
    request.seed > 4294967295
  )
    throw new Error(
      "Choose 2–20 decks, 1–10,000 matches per pairing, a 32-bit seed and 1–2,000 action ceiling.",
    );
  // Validate actual deck compositions, rather than silently repairing them for a simulation.
  const lib = libraryOf(request.content);
  for (const deck of request.decks) {
    if (deck.cards.length !== request.config.deckSize)
      throw new Error(
        `${deck.name}: deck size does not match the selected ruleset.`,
      );
    const counts: Record<string, number> = {};
    for (const id of deck.cards) {
      if (!lib[id]) throw new Error(`${deck.name}: missing card ${id}.`);
      counts[id] = (counts[id] ?? 0) + 1;
      if (
        request.config.collection !== "mixed" &&
        lib[id].kindred !== request.config.collection
      )
        throw new Error(`${deck.name}: collection restriction violated.`);
    }
    for (const [id, count] of Object.entries(counts))
      if (
        count >
        (request.config.mode === "free"
          ? request.config.deckSize
          : (lib[id].maxCopies ?? request.config.maxCopies))
      )
        throw new Error(`${deck.name}: duplicate limit exceeded for ${id}.`);
  }
}
export function runOne(
  request: SimulationRequest,
  pair: [number, number],
  index: number,
  pairIndex = 0,
) {
  const lib = libraryOf(request.content);
  const swap = request.mirrored && Math.floor(index / 2) % 2 === 1;
  const selected = swap
    ? [request.decks[pair[1]], request.decks[pair[0]]]
    : [request.decks[pair[0]], request.decks[pair[1]]];
  const decks: [string[], string[]] = [selected[0].cards, selected[1].cards];
  const seed =
    (request.seed +
      Math.imul(pairIndex + 1, 0x9e3779b9) +
      Math.imul(index + 1, 0x85ebca6b)) >>>
    0;
  const starter = (index % 2) as Player;
  const stats: Record<string, CardStatistics> = {};
  const count = (id: string) => stats[id] ?? (stats[id] = emptyCard());
  for (const deck of decks) deck.forEach((id) => count(id).included++);
  let state: GameState | undefined;
  let record: ReturnType<typeof newRecord> | undefined;
  let actions = 0;
  const summary: MatchSummary = {
    seed,
    pairing: [selected[0].id, selected[1].id],
    starter,
    status: "fault",
    winner: null,
    actions: 0,
    scores: [0, 0],
    reason: "",
    signature: "",
  };
  try {
    state = createMatch(decks, lib, request.config, seed, starter);
    record = newRecord(state, lib, decks, request.content.id);
    for (const p of state.players)
      for (const id of p.hand) count(state.cards[id].definitionId).drawn++;
    while (
      (state.phase === "playing" || state.phase === "mulligan") &&
      actions < request.maxActions
    ) {
      const previous = state;
      const player =
        state.phase === "mulligan"
          ? !state.players[0].mulliganDone
            ? 0
            : 1
          : state.active;
      const action =
        state.phase === "mulligan"
          ? {
              type: "mulligan" as const,
              player: player as Player,
              cards: computerMulligan(state, lib, player as Player),
            }
          : chooseComputerAction(state, lib);
      state = act(state, action, lib);
      record = appendRecord(record, action, state);
      actions++;
      // Only the current match is held. Detailed histories are discarded unless sampled or failed.
      for (const card of Object.values(state.cards)) {
        const prior = previous.cards[card.id];
        if (prior?.location === "draw" && card.location === "hand")
          count(card.definitionId).drawn++;
        if (prior?.location === "battlefield" && card.location === "stack")
          count(prior.definitionId).evolved++;
      }
      for (const event of state.events.slice(previous.events.length))
        if (event.card && state.cards[event.card]) {
          const cs = count(state.cards[event.card].definitionId);
          if (["placement", "evolution", "replacement"].includes(event.type)) {
            if (event.text.includes("resurrected")) cs.resurrected++;
            else cs.played++;
          }
          if (event.type === "sacrifice") cs.replaced++;
          if (["destruction", "sacrifice", "power"].includes(event.type))
            cs.destroyed++;
          if (event.type === "ability") cs.abilities++;
          if (event.type === "influence") cs.territory++;
        }
      if (state.phase === "fault") break;
      assertInvariants(state, lib);
    }
    summary.actions = actions;
    summary.signature = signature(state);
    summary.scores = scoreGame(state, lib).totals;
    if (state.phase === "fault") {
      summary.status = /invariant|unique logical location|Invalid occupying creature/i.test(state.fault??'')?'invariant':'fault';
      summary.reason = summary.status==='invariant'?'invariant':'engine-fault';
      summary.error = state.fault ?? "Engine fault";
    } else if (state.phase !== "finished") {
      summary.status = "timeout";
      summary.reason = "simulation-action-limit";
      summary.error = `Simulation ceiling of ${request.maxActions} actions reached. This is not a game draw.`;
    } else {
      summary.status = "completed";
      summary.reason = state.result!.reason;
      summary.winner = state.result!.winner;
    }
  } catch (error) {
    summary.status = String(error).includes("invariant")
      ? "invariant"
      : "fault";
    summary.error = error instanceof Error ? error.message : String(error);
    summary.reason = summary.status;
    summary.actions = actions;
  }
  if (record) summary.replay = record;
  return { summary, stats };
}
export function aggregateMatch(
  report: SimulationReport,
  s: MatchSummary,
  stats: Record<string, CardStatistics>,
): void {
  const request = report.request;
  report.attempted++;
  for (const id of s.pairing) (report.decks[id] ??= emptyDeck()).attempted++;
  for (const [id, cs] of Object.entries(stats)) {
    const target = report.cards[id] ?? (report.cards[id] = emptyCard());
    for (const k of Object.keys(cs) as (keyof CardStatistics)[])
      target[k] += cs[k];
  }
  if (s.status === "completed") {
    report.completed++;
    report.draws += Number(s.winner === null);
    report.first.games++;
    report.first.wins += Number(s.winner === s.starter);
    report.actions.sum += s.actions;
    report.actions.min =
      report.completed === 1
        ? s.actions
        : Math.min(report.actions.min, s.actions);
    report.actions.max = Math.max(report.actions.max, s.actions);
    report.scores[0] += s.scores[0];
    report.scores[1] += s.scores[1];
    report.scoreDifference += Math.abs(s.scores[0] - s.scores[1]);
    report.reasons[s.reason] = (report.reasons[s.reason] ?? 0) + 1;
    const matchup =
      report.matchups[s.pairing.join(" vs ")] ??
      (report.matchups[s.pairing.join(" vs ")] = {
        completed: 0,
        wins: [0, 0],
        draws: 0,
      });
    matchup.completed++;
    if (s.winner === null) matchup.draws++;
    else matchup.wins[s.winner]++;
    s.pairing.forEach((id, seat) => {
      const deck = report.decks[id];
      deck.completed++;
      deck.score += s.scores[seat];
      const first = seat === s.starter;
      if (first) deck.firstGames++;
      else deck.secondGames++;
      if (s.winner === null) deck.draws++;
      else if (s.winner === seat) {
        deck.wins++;
        if (first) deck.firstWins++;
        else deck.secondWins++;
      } else deck.losses++;
      for (const card of request.decks.find((d) => d.id === id)!.cards) {
        const cs = report.cards[card];
        if (s.winner === seat) cs.wins++;
        else if (s.winner !== null) cs.losses++;
      }
    });
    if (request.retainExamples && report.examples.length < 3)
      report.examples.push(s);
  } else {
    if (s.status === "timeout") report.timeouts++;
    else if (s.status === "invariant") report.invariants++;
    else report.faults++;
    if (s.error?.includes("possible effect loop")) report.loopSafeguards++;
    // Failure seeds, exact inputs and action records remain reproducible; cap verbose records, keep every seed.
    report.failures.push({
      ...s,
      ...(report.failures.length >= 10 ? { replay: undefined } : {}),
    });
  }
}
export async function runSimulation(
  request: SimulationRequest,
  options: {
    cancelled?: () => boolean;
    progress?: (report: SimulationReport, total: number) => void;
    yield?: () => Promise<void>;
  } = {},
): Promise<SimulationReport> {
  validateSimulation(request);
  const start = performance.now();
  const pairs = pairings(request);
  const total = pairs.length * request.matches;
  const report: SimulationReport = {
    schema: 1,
    engineVersion: ENGINE_VERSION,
    id: `simulation-${request.seed}-${Date.now().toString(36)}`,
    name: `${request.matches} matches per pairing · ${request.config.scoring}`,
    request: structuredClone(request),
    attempted: 0,
    completed: 0,
    draws: 0,
    timeouts: 0,
    faults: 0,
    invariants: 0,
    loopSafeguards: 0,
    cancelled: false,
    elapsedMs: 0,
    actions: { sum: 0, min: 0, max: 0 },
    scores: [0, 0],
    scoreDifference: 0,
    first: { games: 0, wins: 0 },
    reasons: {},
    decks: {},
    cards: {},
    matchups: {},
    examples: [],
    failures: [],
    digest: "00000000",
  };
  let rolling = 2166136261;
  let lastProgress = 0;
  outer: for (let p = 0; p < pairs.length; p++)
    for (let i = 0; i < request.matches; i++) {
      if (options.cancelled?.()) {
        report.cancelled = true;
        break outer;
      }
      const { summary: s, stats } = runOne(request, pairs[p], i, p);
      aggregateMatch(report, s, stats);
      for (const ch of `${s.seed}/${s.status}/${s.signature}/${s.winner}`)
        rolling = Math.imul(rolling ^ ch.charCodeAt(0), 16777619);
      report.digest = (rolling >>> 0).toString(16).padStart(8, "0");
      report.elapsedMs = performance.now() - start;
      if (report.elapsedMs - lastProgress > 200 || report.attempted === total) {
        lastProgress = report.elapsedMs;
        options.progress?.(structuredClone(report), total);
      }
      if (options.yield) await options.yield();
    }
  report.elapsedMs = performance.now() - start;
  options.progress?.(structuredClone(report), total);
  return report;
}
export function reportCSV(report: SimulationReport): string {
  const quote = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
  const rows: unknown[][] = [
    [
      "deck",
      "attempted",
      "completed",
      "wins",
      "losses",
      "draws",
      "win_rate",
      "first_win_rate",
      "second_win_rate",
      "sample_conditions",
    ],
    ...Object.entries(report.decks).map(([id, d]) => [
      id,
      d.attempted,
      d.completed,
      d.wins,
      d.losses,
      d.draws,
      d.completed ? d.wins / d.completed : 0,
      d.firstGames ? d.firstWins / d.firstGames : 0,
      d.secondGames ? d.secondWins / d.secondGames : 0,
      `${report.request.content.id}; ${report.request.config.scoring}; one-ply AI; seed ${report.request.seed}`,
    ]),
  ];
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}
