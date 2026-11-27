import { gameplayId, matchesDefinition } from "./identity";
import {ResolutionPause} from "./observation";
import { DEFAULT_CONFIG } from "./config";
import { currentPower, SCORING_RULES, scoreGame } from "./scoring";
import { AdvancedRuntime } from "./advanced-runtime";
import {
  bound,
  emptyMechanics,
  evaluateCondition,
  evaluateNumber,
  hasAdvancedMechanics,
  participant,
  powerTable,
  selectTargets,
} from "./evaluation";
import type { EventContext, EventParticipant, Numeric } from "./advanced-types";
import {
  validateAdvancedLibrary,
  validateMechanicsState,
} from "./advanced-validation";
import type {
  Ability,
  Action,
  CardInstance,
  CardLibrary,
  Cell,
  Effect,
  GameConfig,
  GameState,
  Player,
  Position,
  Target,
  Trigger,
  ResolutionObserver,
} from "./types";

export const opponent = (player: Player): Player => (player === 0 ? 1 : 0);
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
export const cellAt = (state: GameState, row: number, col: number) =>
  state.board.find((cell) => cell.row === row && cell.col === col);
export const positionOf = (state: GameState, id: string) =>
  state.board.find((cell) => cell.creature === id);
export function relative(
  position: Position,
  x: number,
  y: number,
  player: Player,
): Position {
  return { row: position.row + y, col: position.col + (player === 0 ? x : -x) };
}
export function random(state: GameState): number {
  let x = state.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
function shuffle(state: GameState, cards: string[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}
export function log(
  state: GameState,
  type: string,
  text: string,
  player?: Player,
  card?: string,
): number {
  const id = state.nextEvent++;
  state.events.push({ id, turn: state.turn, type, text, player, card });
  return id;
}
export function validateDeck(
  deck: string[],
  library: CardLibrary,
  config: GameConfig = DEFAULT_CONFIG,
): string[] {
  const errors: string[] = [];
  if (deck.length !== config.deckSize)
    errors.push(
      `A deck must contain exactly ${config.deckSize} cards (has ${deck.length}).`,
    );
  const counts: Record<string, number> = {};
  for (const id of deck) {
    const definition = library[id];
    if (!definition) {
      errors.push(`Unknown card: ${id}.`);
      continue;
    }
    const identity = gameplayId(definition);
    counts[identity] = (counts[identity] ?? 0) + 1;
    if (
      config.collection !== "mixed" &&
      config.collection !== definition.kindred
    )
      errors.push(`${definition.name} is outside ${config.collection}.`);
  }
  for (const [id, count] of Object.entries(counts)) {
    const variants = Object.values(library).filter(c => gameplayId(c) === id);
    const representative = variants[0];
    const max =
      config.mode === "free"
        ? config.deckSize
        : Math.min(...variants.map(c => c.maxCopies ?? config.maxCopies));
    if (count > max)
      errors.push(
        `${representative.name}: ${count} copies exceeds the limit of ${max}.`,
      );
  }
  return [...new Set(errors)];
}
export function validateConfig(config: GameConfig): void {
  const b = config.battlefield;
  for (const [key, value] of Object.entries({
    rows: b.rows,
    cols: b.cols,
    maxTokens: b.maxTokens,
    maxFortification: b.maxFortification,
    deckSize: config.deckSize,
    openingHand: config.openingHand,
    maxCopies: config.maxCopies,
    ...config.safeguards,
  })) {
    if (
      !Number.isSafeInteger(value) ||
      value < (key === "maxFortification" ? 0 : 1)
    )
      throw new Error(`Invalid configuration: ${key}.`);
  }
  if (
    b.rows * b.cols > 1000 ||
    config.openingHand > config.deckSize ||
    config.deckSize * 2 > config.safeguards.maxCards
  )
    throw new Error("Configuration exceeds supported safety bounds.");
  if (!SCORING_RULES[config.scoring])
    throw new Error("Unknown tactical ruleset.");
  const occupied = new Set<string>();
  for (const start of b.starts) {
    if (
      ![0, 1].includes(start.player) ||
      !Number.isInteger(start.tokens) ||
      start.tokens < 0 ||
      start.tokens > b.maxTokens ||
      !Number.isInteger(start.fortification) ||
      start.fortification < 0 ||
      start.fortification > b.maxFortification
    )
      throw new Error("Invalid starting territory.");
    for (const p of start.positions) {
      const key = `${p.row},${p.col}`;
      if (
        !Number.isInteger(p.row) ||
        !Number.isInteger(p.col) ||
        p.row < 0 ||
        p.col < 0 ||
        p.row >= b.rows ||
        p.col >= b.cols ||
        occupied.has(key)
      )
        throw new Error("Invalid or overlapping starting position.");
      occupied.add(key);
    }
  }
}
export function createMatch(
  decks: [string[], string[]],
  library: CardLibrary,
  config: GameConfig = DEFAULT_CONFIG,
  seed = 1,
  startingPlayer?: Player,
): GameState {
  validateConfig(config);
  decks.forEach((deck) => {
    const errors = validateDeck(deck, library, config);
    if (errors.length) throw new Error(errors.join(" "));
  });
  const empty = () => ({
    draw: [] as string[],
    hand: [] as string[],
    graveyard: [] as string[],
    exile: [] as string[],
    mulliganDone: false,
    turns: 0,
  });
  const state: GameState = {
    version: 1,
    config: structuredClone(config),
    seed,
    rng: seed >>> 0 || 1,
    startingPlayer: 0,
    active: 0,
    phase: "mulligan",
    turn: 0,
    passes: 0,
    players: [empty(), empty()],
    board: [],
    cards: {},
    lineages: {},
    events: [],
    nextEvent: 1,
    nextCard: 1,
    generated: 0,
    result: null,
    fault: null,
  };
  if (hasAdvancedMechanics(library)) {
    validateAdvancedLibrary(library);
    state.mechanics = emptyMechanics();
  }
  state.startingPlayer = startingPlayer ?? (random(state) < 0.5 ? 0 : 1);
  state.active = state.startingPlayer;
  const b = config.battlefield;
  for (let row = 0; row < b.rows; row++)
    for (let col = 0; col < b.cols; col++)
      state.board.push({
        row,
        col,
        owner: null,
        tokens: 0,
        fortification: 0,
        creature: null,
      });
  for (const start of b.starts)
    for (const p of start.positions)
      Object.assign(cellAt(state, p.row, p.col)!, {
        owner: start.player,
        tokens: start.tokens,
        fortification: start.fortification,
      });
  decks.forEach((deck, p) => {
    const player = p as Player;
    deck.forEach((definition) => {
      const card = newCard(state, definition, player, "draw");
      state.players[player].draw.push(card.id);
    });
    shuffle(state, state.players[player].draw);
    drawCards(state, player, config.openingHand);
  });
  log(
    state,
    "match",
    `Match created. Player ${state.startingPlayer + 1} will start.`,
    state.startingPlayer,
  );
  assertInvariants(state, library);
  return state;
}
function newCard(
  state: GameState,
  definitionId: string,
  owner: Player,
  location: CardInstance["location"],
): CardInstance {
  const id = `c${state.nextCard++}`;
  const card: CardInstance = {
    id,
    definitionId,
    owner,
    location,
    lineage: id,
    modifier: 0,
    statuses: [],
    stack: [],
    activations: {},
    resurrections: 0,
  };
  state.cards[id] = card;
  state.lineages[id] = { activations: {}, resurrections: 0 };
  return card;
}
function drawCards(state: GameState, player: Player, amount: number): void {
  let drawn = 0;
  while (drawn < amount && state.players[player].draw.length) {
    const id = state.players[player].draw.shift()!;
    state.cards[id].location = "hand";
    state.players[player].hand.push(id);
    drawn++;
  }
  if (drawn)
    log(
      state,
      "draw",
      `Player ${player + 1} drew ${drawn} card${drawn === 1 ? "" : "s"}.`,
      player,
    );
}
function eligible(
  state: GameState,
  library: CardLibrary,
  incoming: string,
  previous: string,
): boolean {
  const req = library[incoming].prerequisite;
  if (!req) return true;
  const previousDef = library[state.cards[previous].definitionId];
  return (
    (!req.definitions || matchesDefinition(previousDef, req.definitions)) &&
    (!req.tags || req.tags.some((tag) => previousDef.tags.includes(tag))) &&
    (req.minPower === undefined ||
      currentPower(state, library, previous) >= req.minPower)
  );
}
export type PlacementIssue = {code:"turn"|"hand"|"territory"|"opponent"|"occupied"|"tokens"|"host"|"prerequisite";message:string};
export function placementIssue(
  state: GameState,
  library: CardLibrary,
  player: Player,
  cardId: string,
  row: number,
  col: number,
): PlacementIssue | null {
  if (state.phase !== "playing" || state.active !== player)
    return {code:"turn",message:"It is not your placement turn."};
  const card = state.cards[cardId];
  if (
    !card ||
    card.owner !== player ||
    !state.players[player].hand.includes(cardId)
  )
    return {code:"hand",message:"Choose a card from your hand."};
  const cell = cellAt(state, row, col);
  const def = library[card.definitionId];
  if (!cell || cell.owner !== player) return {code:cell?.owner!==null&&cell?.owner!==undefined?"opponent":"territory",message:"You must control this territory."};
  if (def.type === "standard") {
    if (cell.creature) return {code:"occupied",message:"This position is occupied."};
    if (cell.tokens < def.rank) return {code:"tokens",message:`Requires Rank ${def.rank} territory.`};
  } else {
    if (!cell.creature || state.cards[cell.creature].owner !== player)
      return {code:"host",message:`Requires a friendly creature to ${def.type === "evolution" ? "evolve" : "replace"}.`};
    if (!eligible(state, library, def.id, cell.creature))
      return {code:"prerequisite",message:"The predecessor does not meet this card’s prerequisites."};
  }
  return null;
}
export function placementError(state:GameState,library:CardLibrary,player:Player,cardId:string,row:number,col:number):string|null{return placementIssue(state,library,player,cardId,row,col)?.message??null;}
export function legalPlays(
  state: GameState,
  library: CardLibrary,
  player = state.active,
): Extract<Action, { type: "play" }>[] {
  if (state.phase !== "playing" || state.active !== player) return [];
  return state.players[player].hand.flatMap((card) =>
    state.board
      .filter(
        (c) => !placementError(state, library, player, card, c.row, c.col),
      )
      .map((c) => ({
        type: "play" as const,
        player,
        card,
        row: c.row,
        col: c.col,
      })),
  );
}

// An influence point removes ONE fortification OR captures OR reinforces, never two of these.
export function applyInfluence(
  state: GameState,
  cell: Cell,
  player: Player,
  mechanic: "expansion" | "fortification" | "overthrow",
  amount: number,
): void {
  const b = state.config.battlefield;
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100)
    throw new Error("Invalid influence strength.");
  if (cell.owner !== player && cell.creature) return;
  if (mechanic === "fortification") {
    if (cell.owner === player)
      cell.fortification = clamp(
        cell.fortification + amount,
        b.maxFortification,
      );
    return;
  }
  if (mechanic === "overthrow") {
    if (cell.owner !== null && cell.owner !== player && amount > 0) {
      cell.owner = player;
      cell.tokens = clamp(amount, b.maxTokens);
      cell.fortification = 0;
    }
    return;
  }
  for (let i = 0; i < amount; i++) {
    if (cell.owner === player)
      cell.tokens = clamp(cell.tokens + 1, b.maxTokens);
    else if (cell.owner !== null && cell.fortification > 0)
      cell.fortification--;
    else {
      cell.owner = player;
      cell.tokens = Math.min(1, b.maxTokens);
      cell.fortification = 0;
    }
  }
}
export type Source = {
  id: string;
  player: Player;
  position: Position;
  snapshot?: EventParticipant;
};
export type Queued = {
  source: Source;
  ability: Ability;
  context: EventContext;
  index: number;
};
export class Resolver {
  queue: Queued[] = [];
  steps = 0;
  advanced?: AdvancedRuntime;
  constructor(
    readonly state: GameState,
    readonly library: CardLibrary,
    readonly observer?: ResolutionObserver,
  ) {
    if (state.mechanics) this.advanced = new AdvancedRuntime(this);
  }
  event(type: string, text: string, player?: Player, card?: string) {
    return log(this.state, type, text, player, card);
  }
  amount(
    n: Numeric,
    source: Source,
    context: EventContext,
    target?: string,
  ): number {
    return typeof n === "number"
      ? n
      : evaluateNumber(n, {
          state: this.state,
          library: this.library,
          source: source.id,
          sourceSnapshot: source.snapshot,
          context,
          target,
          origin: source.position,
        });
  }
  draw(
    player: Player,
    amount: number,
    source?: Source,
    context?: EventContext,
  ) {
    const before = this.state.players[player].hand.length;
    if (amount > 0 && this.state.players[player].draw.length)
      this.diagnostic("before-private-draw", "Private draw begins after this recorded boundary.", { player });
    drawCards(this.state, player, amount);
    this.advanced?.drawn(
      this.state.players[player].hand.slice(before),
      "draw",
      source,
      context,
    );
  }
  diagnostic(kind: string, message: string, details: unknown = null): void {
    if (!this.observer) return;
    this.observer.onStep({
      sequence: this.steps,
      kind,
      message,
      details: structuredClone(details),
      ...((typeof this.observer.captureStates==="function"?this.observer.captureStates(kind):this.observer.captureStates)
        ? { state: structuredClone(this.state) }
        : {}),
    });
  }
  step() {
    if (++this.steps > this.state.config.safeguards.maxResolutionSteps)
      throw new Error(
        `Resolution limit (${this.state.config.safeguards.maxResolutionSteps}) reached: possible effect loop. Match halted without a result.`,
      );
  }
  source(id: string, position?: Position): Source {
    return {
      id,
      player: this.state.cards[id].owner,
      position: position ?? positionOf(this.state, id) ?? { row: -1, col: -1 },
    };
  }
  collect(source: Source, trigger: Trigger, context: EventContext): Queued[] {
    return this.library[
      this.state.cards[source.id].definitionId
    ].abilities.flatMap((ability, index) =>
      ability.trigger === trigger ? [{ source, ability, context, index }] : [],
    );
  }
  enqueue(items: Queued[]): void {
    // Active player first, then top-to-bottom / left-to-right, then declaration order, then event ID.
    items.sort(
      (a, b) =>
        Number(b.source.player === this.state.active) -
          Number(a.source.player === this.state.active) ||
        a.source.position.row - b.source.position.row ||
        a.source.position.col - b.source.position.col ||
        a.index - b.index ||
        a.context.id - b.context.id,
    );
    this.queue.push(...items);
  }
  drain(): void {
    this.advanced?.settle();
    while (this.queue.length) {
      this.step();
      const task = this.queue.shift()!;
      const { source, ability, context } = task;
      const card = this.state.cards[source.id];
      if (this.advanced && !this.advanced.canRun(ability, source, context))
        continue;
      this.diagnostic(
        "trigger",
        `${ability.id}: evaluating ${ability.trigger}`,
        { source, ability, context },
      );
      if (
        context.resurrected &&
        !ability.allowOnResurrect &&
        (!this.advanced ||
          ["placement", "evolution", "replacement", "otherPlacement"].includes(
            ability.trigger,
          ))
      ) {
        this.diagnostic(
          "blocked",
          "Resurrection-triggered activation is disabled.",
          { ability: ability.id },
        );
        continue;
      }
      const condition = ability.condition;
      if (
        this.advanced &&
        !evaluateCondition(condition, {
          state: this.state,
          library: this.library,
          source: source.id,
          sourceSnapshot: source.snapshot,
          context,
          origin: source.position,
        })
      ) {
        this.diagnostic("condition", "Structured condition did not pass.", {
          condition,
          context,
        });
        continue;
      }
      if (
        !this.advanced &&
        condition?.kind === "eventFriendly" &&
        context.player !== source.player
      ) {
        this.diagnostic("condition", "Friendly-event condition did not pass.", {
          condition,
          context,
          source,
        });
        continue;
      }
      if (
        !this.advanced &&
        condition?.kind === "friendlyCount" &&
        this.state.board.filter(
          (c) =>
            c.creature && this.state.cards[c.creature].owner === source.player,
        ).length < condition.atLeast
      ) {
        this.diagnostic(
          "condition",
          "Friendly-population condition did not pass.",
          {
            condition,
            count: this.state.board.filter(
              (c) =>
                c.creature &&
                this.state.cards[c.creature].owner === source.player,
            ).length,
          },
        );
        continue;
      }
      if (
        !this.advanced &&
        condition?.kind === "sourcePower" &&
        currentPower(this.state, this.library, source.id) < condition.atLeast
      ) {
        this.diagnostic("condition", "Source-power condition did not pass.", {
          condition,
          power: currentPower(this.state, this.library, source.id),
        });
        continue;
      }
      this.diagnostic(
        "condition",
        condition
          ? "Supported condition passed."
          : "No conditional restriction.",
        { condition },
      );
      const counters = [
        card.activations,
        this.state.lineages[card.lineage].activations,
      ];
      const keys: [string, number][] = [
        [`${ability.id}:event:${context.id}`, ability.limit?.perEvent ?? 1],
      ];
      if (ability.limit?.perTurn !== undefined)
        keys.push([
          `${ability.id}:turn:${this.state.turn}`,
          ability.limit.perTurn,
        ]);
      if (ability.limit?.perMatch !== undefined)
        keys.push([`${ability.id}:match`, ability.limit.perMatch]);
      else if (
        this.advanced &&
        (["firstEnhanced", "firstWeakened"].includes(ability.trigger) ||
          (["condition", "powerThreshold"].includes(ability.trigger) &&
            !ability.repeatable))
      )
        keys.push([`${ability.id}:match`, 1]);
      if (
        keys.some(([key, max]) =>
          counters.some((counts) => (counts[key] ?? 0) >= max),
        )
      ) {
        this.diagnostic("limit", "Activation limit reached; ability skipped.", {
          ability: ability.id,
          keys,
          counters,
        });
        continue;
      }
      this.diagnostic("limit", "Activation restrictions permit this ability.", {
        ability: ability.id,
        keys,
        counters,
      });
      for (const counts of counters)
        for (const [key] of keys) counts[key] = (counts[key] ?? 0) + 1;
      log(
        this.state,
        "ability",
        `${this.library[card.definitionId].name}: ${ability.trigger} ability (${ability.id}).`,
        source.player,
        source.id,
      );
      for (const effect of ability.effects) {
        this.step();
        this.diagnostic(
          "effect-start",
          `Resolve ${effect.type}. Multi-target effects select one simultaneous group; effects execute in declaration order.`,
          { effect, source },
        );
        const effectContext =
          this.advanced?.chain(ability, source, context) ?? context;
        this.effect(effect, source, effectContext);
        this.advanced?.settle(effect.type, source, effectContext);
        this.diagnostic("effect-end", `${effect.type} completed.`, { effect });
      }
    }
  }
  targets(target: Target, source: Source, context: EventContext): Cell[] {
    if (this.advanced)
      return selectTargets(target, {
        state: this.state,
        library: this.library,
        source: source.id,
        context,
        origin: source.position,
        random: () => {this.diagnostic("before-random","Random target selection resolves after confirmation.");return random(this.state);},
      });
    let cells: Cell[];
    if (target.kind === "self") {
      const p = positionOf(this.state, source.id);
      cells = p ? [p] : [];
    } else if (target.kind === "event") {
      const p = context.card ? positionOf(this.state, context.card) : undefined;
      cells = p ? [p] : [];
    } else if (target.kind === "all") cells = this.state.board.slice();
    else
      cells = (target.offsets ?? [])
        .map((o) => relative(source.position, o.x, o.y, source.player))
        .map((p) => cellAt(this.state, p.row, p.col))
        .filter((c): c is Cell => !!c);
    return [...new Set(cells)].filter((c) => {
      const owner = c.creature ? this.state.cards[c.creature].owner : c.owner;
      if (target.excludeSelf && c.creature === source.id) return false;
      if (target.relation === "friendly" && owner !== source.player)
        return false;
      if (
        target.relation === "enemy" &&
        (owner === null || owner === source.player)
      )
        return false;
      if (
        target.tags &&
        (!c.creature ||
          !target.tags.some((tag) =>
            this.library[
              this.state.cards[c.creature!].definitionId
            ].tags.includes(tag),
          ))
      )
        return false;
      return true;
    });
  }
  influence(id: string, parent?: EventContext): void {
    const source = this.source(id);
    const position = positionOf(this.state, id);
    if (!position) return;
    for (const influence of this.library[this.state.cards[id].definitionId]
      .influence) {
      this.step();
      const p = relative(position, influence.x, influence.y, source.player);
      const cell = cellAt(this.state, p.row, p.col);
      if (cell) {
        const previous =
          this.observer || this.advanced ? structuredClone(cell) : null;
        const before = `${cell.owner}/${cell.tokens}/${cell.fortification}`;
        applyInfluence(
          this.state,
          cell,
          source.player,
          influence.mechanic,
          influence.amount,
        );
        this.diagnostic(
          "territory",
          `${influence.mechanic} ${influence.amount} at ${coordinate(cell)}.`,
          { source: id, influence, before: previous, after: cell },
        );
        if (before !== `${cell.owner}/${cell.tokens}/${cell.fortification}`)
          log(
            this.state,
            "influence",
            `${influence.mechanic} ${influence.amount} at ${coordinate(cell)}: Player ${cell.owner! + 1}, ${cell.tokens} tokens, ${cell.fortification} fortification.`,
            source.player,
            id,
          );
        if (previous) this.advanced?.territory(previous, cell, source, parent);
      }
    }
  }
  placed(
    id: string,
    trigger: "placement" | "evolution" | "replacement",
    resurrected = false,
    parent?: EventContext,
  ): void {
    const source = this.source(id);
    let context: EventContext = {
      id: log(
        this.state,
        trigger,
        `${this.library[this.state.cards[id].definitionId].name} ${resurrected ? "resurrected" : trigger === "evolution" ? "evolved" : "placed"} at ${coordinate(source.position)}.`,
        source.player,
        id,
      ),
      card: id,
      player: source.player,
      resurrected,
      ...(parent?.chain ? { chain: parent.chain } : {}),
    };
    if (this.advanced)
      context = this.advanced.placed(id, trigger, resurrected, context);
    const tasks = this.collect(source, trigger, context);
    if (trigger === "replacement")
      tasks.push(...this.collect(source, "placement", context));
    for (const cell of this.state.board)
      if (cell.creature && cell.creature !== id)
        tasks.push(
          ...this.collect(
            this.source(cell.creature),
            "otherPlacement",
            context,
          ),
        );
    this.enqueue(tasks);
  }
  remove(
    ids: string[],
    cause: "destruction" | "sacrifice" | "power" | "return" | "banish",
    parent?: EventContext,
  ): void {
    this.diagnostic(
      "lifecycle",
      `${cause}: select batch before death triggers.`,
      { instances: ids, cause },
    );
    const watchers = this.state.board
      .filter((c) => c.creature)
      .map((c) => {
        const source = this.source(c.creature!);
        if (this.advanced)
          source.snapshot = participant(
            this.state,
            this.library,
            c.creature!,
            cause,
          );
        return source;
      });
    const removed: { source: Source; context: EventContext }[] = [];
    const snapshots = this.advanced
      ? new Map(
          ids
            .filter((id) => positionOf(this.state, id))
            .map((id) => [
              id,
              participant(this.state, this.library, id, cause),
            ]),
        )
      : null;
    const protectedBatch =
      this.advanced && cause === "destruction"
        ? new Set(ids.filter((id) => this.protected(id, "destruction")))
        : null;
    // Remove the complete batch BEFORE scheduling any death ability.
    for (const id of [...new Set(ids)]) {
      const card = this.state.cards[id];
      const cell = positionOf(this.state, id);
      if (!cell) continue;
      if (
        cause === "destruction" &&
        (protectedBatch
          ? protectedBatch.has(id)
          : this.protected(id, "destruction"))
      ) {
        log(
          this.state,
          "protection",
          `${this.library[card.definitionId].name} resisted direct destruction.`,
          card.owner,
          id,
        );
        continue;
      }
      const source = this.source(id, { row: cell.row, col: cell.col });
      if (snapshots?.has(id)) source.snapshot = snapshots.get(id);
      cell.creature = null;
      const location =
        cause === "return"
          ? "hand"
          : cause === "banish"
            ? "exile"
            : "graveyard";
      const stages = [...card.stack, id];
      card.stack = [];
      for (const stage of stages) {
        this.state.cards[stage].location = location;
        this.state.players[card.owner][location].push(stage);
      }
      const eventId = log(
        this.state,
        cause,
        `${this.library[card.definitionId].name}: ${cause}${stages.length > 1 ? ` (${stages.length} evolution stages)` : ""}.`,
        card.owner,
        id,
      );
      const context = snapshots?.get(id)
        ? this.advanced!.removed(snapshots.get(id)!, eventId, cause, parent)
        : { id: eventId, card: id, player: card.owner };
      if (location === "graveyard")
        removed.push({
          source,
          context,
        });
    }
    const tasks: Queued[] = [];
    for (const { source, context } of removed) {
      tasks.push(...this.collect(source, "destruction", context));
      if (cause === "sacrifice")
        tasks.push(...this.collect(source, "sacrifice", context));
      for (const watcher of watchers)
        if (watcher.id !== source.id)
          tasks.push(...this.collect(watcher, "otherDestruction", context));
    }
    this.enqueue(tasks);
  }
  protected(id: string, status: "destruction" | "weakening"): boolean {
    if (this.advanced) return this.advanced.protected(id, status);
    const card = this.state.cards[id];
    return (
      card.statuses.includes(status) ||
      !!this.library[card.definitionId].protections?.includes(status)
    );
  }
  effect(effect: Effect, source: Source, context: EventContext): void {
    const amount =
      "amount" in effect ? this.amount(effect.amount, source, context) : 0;
    if (effect.type === "draw") {
      this.draw(source.player, Math.max(0, amount), source, context);
      return;
    }
    if (effect.type === "generate") {
      if (!this.library[effect.card])
        throw new Error(`Unknown generated card ${effect.card}.`);
      if(amount>0)this.diagnostic("before-private-generate","Hand generation resolves after confirmation.");
      for (let i = 0; i < amount; i++) {
        if (
          this.state.generated >=
            this.state.config.safeguards.maxGeneratedPerMatch ||
          Object.keys(this.state.cards).length >=
            this.state.config.safeguards.maxCards
        ) {
          log(
            this.state,
            "safeguard",
            "Card generation limit reached. Further generation prevented.",
          );
          break;
        }
        const card = newCard(this.state, effect.card, source.player, "hand");
        this.state.players[source.player].hand.push(card.id);
        this.state.generated++;
        log(
          this.state,
          "generate",
          `${this.library[effect.card].name} generated.`,
          source.player,
          card.id,
        );
        this.advanced?.drawn([card.id], "generate", source, context);
      }
      return;
    }
    if (effect.type === "resurrect") {
      this.resurrect(effect, source, context);
      return;
    }
    const cells = this.targets(effect.target, source, context);
    const ids = cells.flatMap((c) => (c.creature ? [c.creature] : []));
    this.diagnostic(
      "targets",
      `${cells.length} eligible position(s), ${ids.length} creature(s).`,
      { effect, cells, instances: ids },
    );
    switch (effect.type) {
      case "power": {
        const changes = ids.map((id) => ({
          id,
          amount: this.amount(effect.amount, source, context, id),
          blocked: this.protected(id, "weakening"),
        }));
        for (const { id, amount, blocked } of changes)
          if (!(amount < 0 && blocked)) {
            const c = this.state.cards[id];
            if (this.advanced) {
              c.permanentEnhancement ??= Math.max(0, c.modifier);
              c.permanentWeakening ??= Math.min(0, c.modifier);
              if (amount > 0)
                c.permanentEnhancement = bound(c.permanentEnhancement + amount);
              else c.permanentWeakening = bound(c.permanentWeakening + amount);
            }
            c.modifier = this.advanced
              ? bound(c.modifier + amount)
              : c.modifier + amount;
            this.advanced?.powerEffect(id, amount);
          } else
            this.diagnostic(
              "protection",
              "Weakening was prevented; no successful power-change event is emitted.",
              { card: id, amount },
            );
        log(
          this.state,
          "power",
          `${typeof effect.amount === "number" && amount >= 0 ? "+" : ""}${typeof effect.amount === "number" ? amount : "Variable"} power to ${ids.length} eligible creature(s).`,
          source.player,
        );
        if (!this.advanced)
          this.remove(
            ids.filter((id) => currentPower(this.state, this.library, id) <= 0),
            "power",
          );
        break;
      }
      case "destroy":
        this.remove(ids, "destruction", context);
        break;
      case "return":
        this.remove(ids, "return", context);
        break;
      case "banish":
        this.remove(ids, "banish", context);
        break;
      case "protect":
        for (const id of ids)
          if (!this.state.cards[id].statuses.includes(effect.protection))
            this.state.cards[id].statuses.push(effect.protection);
        break;
      case "tokens":
        for (const { cell, amount } of cells.map((cell) => ({
          cell,
          amount: this.amount(
            effect.amount,
            source,
            context,
            cell.creature ?? "",
          ),
        })))
          if (cell.owner === source.player)
            cell.tokens = clamp(
              cell.tokens + amount,
              this.state.config.battlefield.maxTokens,
            );
        break;
      case "fortify":
        for (const { cell, amount } of cells.map((cell) => ({
          cell,
          amount: this.amount(
            effect.amount,
            source,
            context,
            cell.creature ?? "",
          ),
        })))
          if (cell.owner === source.player) {
            const previous = this.advanced ? structuredClone(cell) : null;
            cell.fortification = clamp(
              cell.fortification + amount,
              this.state.config.battlefield.maxFortification,
            );
            if (previous)
              this.advanced?.territory(previous, cell, source, context);
          }
        break;
      case "capture":
      case "overthrow":
        for (const { cell, amount } of cells.map((cell) => ({
          cell,
          amount: this.amount(
            effect.amount,
            source,
            context,
            cell.creature ?? "",
          ),
        }))) {
          const previous = this.advanced ? structuredClone(cell) : null;
          applyInfluence(
            this.state,
            cell,
            source.player,
            effect.type === "capture" ? "expansion" : "overthrow",
            this.advanced ? Math.max(0, Math.min(100, amount)) : amount,
          );
          if (previous)
            this.advanced?.territory(previous, cell, source, context);
        }
        break;
      case "replace":
      case "evolve": {
        const def = this.library[effect.card];
        if (
          !def ||
          def.type !== (effect.type === "replace" ? "replacement" : "evolution")
        )
          throw new Error(
            "An ability placement needs a matching card placement type.",
          );
        const placements: {
          cell: Cell;
          card: CardInstance;
          previous: string;
        }[] = [];
        for (const cell of cells) {
          if (
            !cell.creature ||
            cell.owner !== source.player ||
            !eligible(this.state, this.library, def.id, cell.creature)
          )
            continue;
          if (
            this.state.generated >=
              this.state.config.safeguards.maxGeneratedPerMatch ||
            Object.keys(this.state.cards).length >=
              this.state.config.safeguards.maxCards
          ) {
            log(
              this.state,
              "safeguard",
              "Ability placement generation limit reached.",
            );
            break;
          }
          const card = newCard(
            this.state,
            def.id,
            source.player,
            "battlefield",
          );
          this.state.generated++;
          this.advanced?.prepareIncoming(card.id, cell.creature);
          placements.push({ cell, card, previous: cell.creature });
        }
        if (effect.type === "evolve")
          for (const p of placements) this.evolve(p.card.id, p.previous);
        else {
          const pending = this.queue.splice(0);
          this.remove(
            placements.map((p) => p.previous),
            "sacrifice",
            context,
          );
          for (const p of placements) p.cell.creature = p.card.id;
          // Every incoming creature is present before this simultaneous sacrifice branch resolves.
          this.drain();
          this.queue.push(...pending);
        }
        this.remove(
          placements
            .filter(
              (p) => currentPower(this.state, this.library, p.card.id) <= 0,
            )
            .map((p) => p.card.id),
          "power",
        );
        for (const p of placements)
          if (positionOf(this.state, p.card.id)) {
            this.influence(p.card.id, context);
            this.placed(
              p.card.id,
              def.type as "replacement" | "evolution",
              false,
              context,
            );
          }
        break;
      }
      case "summon": {
        const def = this.library[effect.card];
        if (!def) throw new Error(`Unknown summoned card ${effect.card}.`);
        for (const cell of cells) {
          if (
            cell.creature ||
            cell.owner !== source.player ||
            cell.tokens < def.rank ||
            def.type !== "standard"
          )
            continue;
          if (
            this.state.generated >=
              this.state.config.safeguards.maxGeneratedPerMatch ||
            Object.keys(this.state.cards).length >=
              this.state.config.safeguards.maxCards
          ) {
            log(this.state, "safeguard", "Summoning generation limit reached.");
            break;
          }
          const card = newCard(
            this.state,
            effect.card,
            source.player,
            "battlefield",
          );
          this.state.generated++;
          cell.creature = card.id;
          this.influence(card.id, context);
          this.placed(card.id, "placement", false, context);
        }
        break;
      }
    }
  }
  resurrect(
    effect: Extract<Effect, { type: "resurrect" }>,
    source: Source,
    context?: EventContext,
  ): void {
    const grave = this.state.players[source.player].graveyard;
    const candidates = effect.target === "self" ? [source.id] : grave.slice();
    for (const id of candidates) {
      const card = this.state.cards[id];
      const def = this.library[card.definitionId];
      if (!grave.includes(id)) continue;
      const lineage = this.state.lineages[card.lineage];
      const max = Math.min(
        effect.limit,
        this.state.config.safeguards.maxResurrections,
      );
      if (card.resurrections >= max || lineage.resurrections >= max) {
        this.diagnostic(
          "limit",
          "Resurrection limit prevents this candidate.",
          {
            card: id,
            instance: card.resurrections,
            lineage: lineage.resurrections,
            max,
          },
        );
        log(
          this.state,
          "safeguard",
          `${def.name}: resurrection limit reached.`,
          source.player,
          id,
        );
        continue;
      }
      // Evolved forms require their predecessor, unless this effect explicitly overrides it.
      const destination =
        def.type === "evolution" && !effect.overrideEvolution
          ? this.state.board.find(
              (c) =>
                c.owner === source.player &&
                c.creature &&
                eligible(this.state, this.library, def.id, c.creature),
            )
          : this.state.board.find(
              (c) =>
                c.owner === source.player &&
                !c.creature &&
                c.tokens >= def.rank,
            );
      if (!destination) {
        this.diagnostic(
          "resurrection",
          "No destination satisfies this candidate’s rank / evolution prerequisites.",
          { card: id, prerequisite: def.prerequisite },
        );
        continue;
      }
      grave.splice(grave.indexOf(id), 1);
      card.resurrections++;
      lineage.resurrections++;
      this.diagnostic(
        "resurrection",
        "Eligible destination selected; persistent resurrection counters incremented.",
        {
          card: id,
          destination,
          instance: card.resurrections,
          lineage: lineage.resurrections,
        },
      );
      if (def.type === "evolution" && !effect.overrideEvolution)
        this.evolve(card.id, destination.creature!);
      else {
        card.stack = [];
        destination.creature = id;
        card.location = "battlefield";
      }
      this.advanced?.resurrected(id, context);
      // Power changes and statuses persist; nonpositive returning creatures die again normally.
      if (currentPower(this.state, this.library, id) <= 0) {
        this.remove([id], "power", context);
        return;
      }
      this.influence(id, context);
      this.placed(
        id,
        def.type === "evolution" ? "evolution" : "placement",
        true,
        context,
      );
      return;
    }
  }
  evolve(id: string, previous: string): void {
    const incoming = this.state.cards[id];
    const prior = this.state.cards[previous];
    const cell = positionOf(this.state, previous)!;
    if (this.advanced) {
      this.advanced.prepareIncoming(id, previous);
      incoming.permanentEnhancement = bound(
        (incoming.permanentEnhancement ?? Math.max(0, incoming.modifier)) +
          (prior.permanentEnhancement ?? Math.max(0, prior.modifier)),
      );
      incoming.permanentWeakening = bound(
        (incoming.permanentWeakening ?? Math.min(0, incoming.modifier)) +
          (prior.permanentWeakening ?? Math.min(0, prior.modifier)),
      );
    }
    incoming.modifier += prior.modifier;
    incoming.statuses = [
      ...new Set([
        ...incoming.statuses,
        ...prior.statuses,
        ...(this.library[prior.definitionId].protections ?? []),
      ]),
    ];
    const oldLineage = this.state.lineages[incoming.lineage];
    const lineage = this.state.lineages[prior.lineage];
    if (incoming.lineage !== prior.lineage) {
      for (const [key, value] of Object.entries(oldLineage.activations))
        lineage.activations[key] = Math.max(
          lineage.activations[key] ?? 0,
          value,
        );
      lineage.resurrections = Math.max(
        lineage.resurrections,
        oldLineage.resurrections,
      );
    }
    incoming.lineage = prior.lineage;
    incoming.resurrections = Math.max(
      incoming.resurrections,
      prior.resurrections,
    );
    incoming.stack = [...prior.stack, previous];
    prior.stack = [];
    prior.location = "stack";
    incoming.location = "battlefield";
    cell.creature = id;
    for (const stage of incoming.stack)
      this.state.cards[stage].lineage = incoming.lineage;
  }
  turnEffects(trigger: "turnStart" | "turnEnd"): void {
    const context = {
      id: log(
        this.state,
        trigger,
        `Player ${this.state.active + 1}: ${trigger === "turnStart" ? "beginning" : "end"} of turn.`,
        this.state.active,
      ),
      player: this.state.active,
    };
    this.enqueue(
      this.state.board
        .filter(
          (c) =>
            c.creature &&
            this.state.cards[c.creature].owner === this.state.active,
        )
        .flatMap((c) =>
          this.collect(this.source(c.creature!), trigger, context),
        ),
    );
    this.drain();
  }
  beginTurn(): void {
    this.state.turn++;
    this.state.players[this.state.active].turns++;
    this.turnEffects("turnStart");
    if (this.state.players[this.state.active].turns > 1)
      this.draw(this.state.active, 1);
    if (this.advanced) {
      this.advanced.settle("turnStart");
      this.drain();
    }
    this.diagnostic("before-next-player-decision","Automatic visible effects complete; the next player's private choice follows.");
    const forced = legalPlays(this.state, this.library).length === 0;
    log(
      this.state,
      forced ? "forced-pass" : "turn",
      forced
        ? `Player ${this.state.active + 1} has no legal placements. Confirm the forced pass.`
        : `Player ${this.state.active + 1} may play or pass.`,
      this.state.active,
    );
  }
}
export function coordinate(position: Position): string {
  return `${String.fromCharCode(65 + position.row)}${position.col + 1}`;
}
function finish(
  state: GameState,
  library: CardLibrary,
  reason: "passes" | "surrender" | "ruleset",
  surrenderer?: Player,
): void {
  const scores = scoreGame(state, library).totals;
  const winner =
    surrenderer !== undefined
      ? opponent(surrenderer)
      : scores[0] === scores[1]
        ? null
        : scores[0] > scores[1]
          ? 0
          : 1;
  state.result = { scores, winner, reason };
  state.phase = "finished";
  log(
    state,
    "result",
    `${winner === null ? "Draw" : `Player ${winner + 1} wins`}: ${scores[0]}–${scores[1]} (${reason}).`,
    winner ?? undefined,
  );
}
export function act(
  original: GameState,
  action: Action,
  library: CardLibrary,
  observer?: ResolutionObserver,
): GameState {
  if (action.type === "mulligan") {
    if (
      original.phase !== "mulligan" ||
      original.players[action.player].mulliganDone
    )
      throw new Error("Mulligan is not available.");
    if (
      new Set(action.cards).size !== action.cards.length ||
      action.cards.some(
        (id) => !original.players[action.player].hand.includes(id),
      )
    )
      throw new Error("Invalid mulligan selection.");
  } else {
    if (original.phase !== "playing")
      throw new Error("The match is not accepting turns.");
    if (action.player !== original.active)
      throw new Error("It is not your turn.");
    if (action.type === "play") {
      const error = placementError(
        original,
        library,
        action.player,
        action.card,
        action.row,
        action.col,
      );
      if (error) throw new Error(error);
    }
  }
  const state = structuredClone(original);
  if (!state.mechanics && hasAdvancedMechanics(library))
    state.mechanics = emptyMechanics();
  // The original is already isolated from all resolver mutations by the clone above.
  // Clone it again only if rollback is actually needed, rather than for every AI candidate.
  const recovery = state.mechanics ? original : null;
  const resolver = new Resolver(state, library, observer);
  resolver.diagnostic(
    "action",
    `${action.type} by Player ${action.player + 1}.`,
    {
      action,
      ...(action.type === "play"
        ? {
            definition: library[state.cards[action.card].definitionId],
            destination: cellAt(state, action.row, action.col),
            requirements: "Validated through the shared placement validator.",
          }
        : {}),
    },
  );
  try {
    if (action.type === "mulligan") {
      const player = state.players[action.player];
      player.hand = player.hand.filter((id) => !action.cards.includes(id));
      resolver.draw(action.player, action.cards.length);
      for (const id of action.cards) {
        state.cards[id].location = "draw";
        player.draw.push(id);
      }
      shuffle(state, player.draw);
      player.mulliganDone = true;
      log(
        state,
        "mulligan",
        `Player ${action.player + 1} completed their mulligan.`,
        action.player,
      );
      if (state.players.every((p) => p.mulliganDone)) {
        state.phase = "playing";
        resolver.beginTurn();
      }
    } else if (action.type === "surrender")
      finish(state, library, "surrender", action.player);
    else {
      if (action.type === "play") {
        const card = state.cards[action.card];
        const def = library[card.definitionId];
        const cell = cellAt(state, action.row, action.col)!;
        if (cell.creature)
          resolver.advanced?.prepareIncoming(card.id, cell.creature);
        state.players[action.player].hand.splice(
          state.players[action.player].hand.indexOf(action.card),
          1,
        );
        if (def.type === "evolution") resolver.evolve(card.id, cell.creature!);
        else {
          if (cell.creature) resolver.remove([cell.creature], "sacrifice");
          cell.creature = card.id;
          card.location = "battlefield";
          // The replacement is already present when sacrifice/death abilities resolve.
          if (!resolver.advanced || def.type !== "standard") resolver.drain();
        }
        if (positionOf(state, card.id)) {
          resolver.influence(card.id);
          resolver.placed(
            card.id,
            def.type === "standard" ? "placement" : def.type,
          );
          resolver.drain();
        }
        resolver.remove(
          state.board.flatMap((c) =>
            c.creature && currentPower(state, library, c.creature) <= 0
              ? [c.creature]
              : [],
          ),
          "power",
        );
        resolver.drain();
        state.passes = 0;
      } else {
        state.passes++;
        log(
          state,
          "pass",
          `Player ${action.player + 1} passed (${state.passes} consecutive).`,
          action.player,
        );
      }
      resolver.diagnostic("action-effects-complete", "Immediate action effects have resolved; turn transfer follows.");
      resolver.turnEffects("turnEnd");
      if (state.passes >= 2) finish(state, library, "passes");
      else if (SCORING_RULES[state.config.scoring].complete?.(state))
        finish(state, library, "ruleset");
      else {
        state.active = opponent(state.active);
        resolver.beginTurn();
      }
    }
    assertInvariants(state, library);
  } catch (error) {
    if(error instanceof ResolutionPause)throw error;
    if (recovery) {
      for (const key of Object.keys(state)) delete (state as any)[key];
      Object.assign(state, structuredClone(recovery));
      state.mechanics ??= emptyMechanics();
    }
    state.phase = "fault";
    state.result = null;
    state.fault = error instanceof Error ? error.message : String(error);
    log(state, "fault", state.fault);
    if (recovery)
      resolver.diagnostic(
        "fault",
        "Resolution failed; the advanced action was rolled back and no competitive result was awarded.",
        { reason: state.fault, rolledBack: true },
      );
  }
  resolver.diagnostic(
    "committed",
    "Atomic action completed; score and resulting zones are available.",
    {
      scores: state.phase === "fault" ? null : scoreGame(state, library),
      fault: state.fault,
    },
  );
  return state;
}
export function rematch(
  state: GameState,
  decks: [string[], string[]],
  library: CardLibrary,
  seed: number,
): GameState {
  return createMatch(
    decks,
    library,
    state.config,
    seed,
    opponent(state.startingPlayer),
  );
}
export function assertInvariants(state: GameState, library: CardLibrary): void {
  if (state.mechanics) validateMechanicsState(state.mechanics);
  const powers = state.mechanics ? powerTable(state, library) : null;
  const seen = new Set<string>();
  const visit = (
    id: string,
    location: CardInstance["location"],
    owner?: Player,
  ) => {
    const card = state.cards[id];
    if (state.mechanics && card) {
      if (
        !Number.isSafeInteger(card.modifier) ||
        Math.abs(card.modifier) > 100000
      )
        throw new Error("Permanent modifier safety bound exceeded.");
      if (
        card.permanentEnhancement !== undefined ||
        card.permanentWeakening !== undefined
      ) {
        if (
          !Number.isSafeInteger(card.permanentEnhancement) ||
          !Number.isSafeInteger(card.permanentWeakening) ||
          card.permanentEnhancement! < 0 ||
          card.permanentWeakening! > 0 ||
          Math.abs(card.permanentEnhancement!) > 100000 ||
          Math.abs(card.permanentWeakening!) > 100000 ||
          card.permanentEnhancement! + card.permanentWeakening! !==
            card.modifier
        )
          throw new Error("Permanent power breakdown is inconsistent.");
      }
    }
    if (
      !card ||
      !library[card.definitionId] ||
      !state.lineages[card.lineage] ||
      card.location !== location ||
      seen.has(id) ||
      (owner !== undefined && card.owner !== owner)
    )
      throw new Error(`Card location invariant failed: ${id}.`);
    seen.add(id);
  };
  for (const player of [0, 1] as const)
    for (const zone of ["draw", "hand", "graveyard", "exile"] as const)
      for (const id of state.players[player][zone]) visit(id, zone, player);
  for (const cell of state.board) {
    const b = state.config.battlefield;
    if (
      !Number.isInteger(cell.tokens) ||
      cell.tokens < 0 ||
      cell.tokens > b.maxTokens ||
      !Number.isInteger(cell.fortification) ||
      cell.fortification < 0 ||
      cell.fortification > b.maxFortification ||
      (cell.owner === null && (cell.tokens || cell.fortification))
    )
      throw new Error("Territory invariant failed.");
    if (cell.creature) {
      visit(cell.creature, "battlefield", cell.owner ?? undefined);
      if (
        cell.owner === null ||
        (powers
          ? powers[cell.creature].effective
          : currentPower(state, library, cell.creature)) <= 0
      )
        throw new Error("Invalid occupying creature.");
      for (const stage of state.cards[cell.creature].stack)
        visit(stage, "stack", cell.owner);
    }
  }
  if (seen.size !== Object.keys(state.cards).length)
    throw new Error("An individual card has no unique logical location.");
}
