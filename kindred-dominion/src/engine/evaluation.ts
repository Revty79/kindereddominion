import type {
  CardLibrary,
  Cell,
  Condition,
  GameState,
  Player,
  Target,
} from "./types";
import type {
  EventContext,
  EventParticipant,
  HistoryFilter,
  Numeric,
  PowerBreakdown,
} from "./advanced-types";
import { MAX_POWER } from "./advanced-types";

const legacyTriggers = new Set([
  "placement",
  "replacement",
  "evolution",
  "destruction",
  "sacrifice",
  "turnStart",
  "turnEnd",
  "otherPlacement",
  "otherDestruction",
]);
export function hasAdvancedMechanics(library: CardLibrary): boolean {
  return Object.values(library).some(
    (c) =>
      c &&
      (c.continuous?.length ||
        c.scaling?.length ||
        c.scoring?.length ||
        (Array.isArray(c.abilities) ? c.abilities : []).some(
          (a) =>
            a &&
            (!legacyTriggers.has(a.trigger) ||
              a.eventFilter ||
              a.threshold ||
              (a.condition &&
                !["friendlyCount", "sourcePower", "eventFriendly"].includes(
                  a.condition.kind,
                )) ||
              a.effects.some(
                (e) =>
                  ("amount" in e &&
                    (typeof e.amount !== "number" ||
                      Math.abs(e.amount) > 100)) ||
                  ("target" in e &&
                    typeof e.target === "object" &&
                    Object.keys(e.target).some(
                      (k) =>
                        ![
                          "kind",
                          "relation",
                          "offsets",
                          "excludeSelf",
                          "tags",
                        ].includes(k),
                    )) ||
                  ("target" in e &&
                    typeof e.target === "object" &&
                    !["self", "event", "all", "pattern"].includes(
                      e.target.kind,
                    )),
              )),
        )),
  );
}
export const emptyMechanics = () => ({
  version: 2 as const,
  history: [],
  thresholds: {},
  firstChanges: {},
});
export const bound = (n: number): number => {
  if (!Number.isFinite(n) || Math.abs(n) > MAX_POWER)
    throw new Error(`Numerical safety bound (${MAX_POWER}) exceeded.`);
  return Math.trunc(n);
};
export const position = (s: GameState, id: string) =>
  s.board.find((c) => c.creature === id);
export function intrinsic(s: GameState, l: CardLibrary, id: string) {
  const c = s.cards[id];
  return c ? l[c.definitionId].power + c.modifier : 0;
}
export type Evaluation = {
  state: GameState;
  library: CardLibrary;
  source: string;
  sourceSnapshot?: EventParticipant;
  context?: EventContext;
  target?: string;
  origin?: { row: number; col: number };
  power?: (id: string) => number;
  statusPower?: (id: string) => number;
  random?: () => number;
};
export function matchesHistory(
  filter: HistoryFilter | undefined,
  owner: Player,
  player: Player,
  data: {
    definitionId?: string;
    tags?: string[];
    kindred?: string;
    cause?: string;
  },
) {
  return (
    (!filter?.relation ||
      filter.relation === "any" ||
      (filter.relation === "friendly" ? owner === player : owner !== player)) &&
    (!filter?.definitions ||
      filter.definitions.includes(data.definitionId ?? "")) &&
    (!filter?.kindreds || filter.kindreds.includes(data.kindred ?? "")) &&
    (!filter?.tags || filter.tags.some((t) => data.tags?.includes(t))) &&
    (!filter?.causes || filter.causes.includes(data.cause ?? ""))
  );
}
export function selectTargets(t: Target, e: Evaluation): Cell[] {
  const { state: s, library: l, source, context: ctx } = e,
    card = s.cards[source];
  if (!card) return [];
  const origin = position(s, source) ??
    e.origin ??
    ctx?.participant?.position ?? { row: -1, col: -1 };
  let cells: Cell[];
  const eventId =
    t.kind === "incoming"
      ? ctx?.incoming?.id
      : t.kind === "sacrificed"
        ? ctx?.removed?.cause === "sacrifice"
          ? ctx.removed.id
          : undefined
        : t.kind === "destroyed"
          ? ctx?.removed &&
            ["sacrifice", "destruction", "power"].includes(
              ctx.removed.cause ?? "",
            )
            ? ctx.removed.id
            : undefined
          : ctx?.card;
  if (t.kind === "self") cells = s.board.filter((c) => c.creature === source);
  else if (["event", "incoming", "sacrificed", "destroyed"].includes(t.kind))
    cells = s.board.filter((c) => c.creature === eventId);
  else if (t.kind === "pattern")
    cells = (t.offsets ?? []).flatMap((o) =>
      s.board.filter(
        (c) =>
          c.row === origin.row + o.y &&
          c.col === origin.col + (card.owner === 0 ? o.x : -o.x),
      ),
    );
  else if (t.kind === "row")
    cells = s.board.filter((c) => c.row === (t.row ?? origin.row));
  else if (t.kind === "column")
    cells = s.board.filter((c) => c.col === (t.column ?? origin.col));
  else if (["adjacent", "orthogonal", "diagonal"].includes(t.kind))
    cells = s.board.filter((c) => {
      const dr = Math.abs(c.row - origin.row),
        dc = Math.abs(c.col - origin.col);
      return t.kind === "orthogonal"
        ? dr + dc === 1
        : t.kind === "diagonal"
          ? dr === 1 && dc === 1
          : Math.max(dr, dc) === 1;
    });
  else cells = s.board.slice();
  const read = e.power ?? ((id) => powerBreakdown(s, l, id).effective);
  const status = e.statusPower ?? ((id) => powerBreakdown(s, l, id).preDynamic);
  cells = [...new Set(cells)].filter((c) => {
    const instance = c.creature ? s.cards[c.creature] : undefined,
      def = instance ? l[instance.definitionId] : undefined,
      owner = instance?.owner ?? c.owner;
    if (t.excludeSelf && c.creature === source) return false;
    if (
      (t.relation === "friendly" && owner !== card.owner) ||
      (t.relation === "enemy" && (owner === null || owner === card.owner))
    )
      return false;
    if (
      (t.territory === "friendly" && c.owner !== card.owner) ||
      (t.territory === "enemy" &&
        (c.owner === null || c.owner === card.owner)) ||
      (t.territory === "neutral" && c.owner !== null)
    )
      return false;
    if (
      (t.tags && !t.tags.some((x) => def?.tags.includes(x))) ||
      (t.kindreds && !t.kindreds.includes(def?.kindred ?? "")) ||
      (t.definitions && !t.definitions.includes(def?.id ?? ""))
    )
      return false;
    if (
      (t.occupied === "occupied" && !instance) ||
      (t.occupied === "empty" && instance)
    )
      return false;
    if (
      (t.row !== undefined && c.row !== t.row) ||
      (t.column !== undefined && c.col !== t.column)
    )
      return false;
    if (
      (t.minTokens !== undefined && c.tokens < t.minTokens) ||
      (t.maxTokens !== undefined && c.tokens > t.maxTokens) ||
      (t.minFortification !== undefined &&
        c.fortification < t.minFortification) ||
      (t.maxFortification !== undefined && c.fortification > t.maxFortification)
    )
      return false;
    if (
      (t.minPower !== undefined &&
        (!instance || read(instance.id) < t.minPower)) ||
      (t.maxPower !== undefined &&
        (!instance || read(instance.id) > t.maxPower))
    )
      return false;
    if (
      t.status &&
      (!instance ||
        (t.status === "enhanced"
          ? status(instance.id) <= def!.power
          : status(instance.id) >= def!.power))
    )
      return false;
    return true;
  });
  // Preserve original declaration order for legacy pattern effects; explicit ordering/caps use coordinates.
  if (
    t.kind !== "pattern" ||
    t.order !== undefined ||
    t.maxTargets !== undefined
  )
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
  if (t.order === "reverse") cells.reverse();
  if (t.order === "random") {
    if (!e.random)
      throw new Error(
        "Random selection is only supported for effect targets, not pure calculations.",
      );
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(e.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
  }
  return t.maxTargets === undefined ? cells : cells.slice(0, t.maxTargets);
}
export function evaluateNumber(n: Numeric, e: Evaluation, depth = 0): number {
  if (depth > 8)
    throw new Error("Numerical expression nesting limit exceeded.");
  if (typeof n === "number") return bound(n);
  const { state: s, library: l, source, context: ctx } = e,
    id = e.target ?? source;
  const calc = (v: Numeric) => evaluateNumber(v, e, depth + 1);
  const power =
    e.power ??
    ((x: string) =>
      !position(s, x) && e.sourceSnapshot?.id === x
        ? e.sourceSnapshot.effectivePower
        : !position(s, x) && ctx?.participant?.id === x
          ? ctx.participant.effectivePower
          : powerBreakdown(s, l, x).effective);
  const pre =
    e.statusPower ?? ((x: string) => powerBreakdown(s, l, x).preDynamic);
  let result: number;
  switch (n.kind) {
    case "value": {
      const c = s.cards[source],
        target = s.cards[id];
      const values: Record<typeof n.value, number> = {
        sourceBase: l[c.definitionId].power,
        sourcePower: power(source),
        sourceIntrinsic: intrinsic(s, l, source),
        sourcePreDynamic: pre(source),
        targetBase: target ? l[target.definitionId].power : 0,
        targetPower: target ? power(id) : 0,
        targetIntrinsic: intrinsic(s, l, id),
        targetPreDynamic: target ? pre(id) : 0,
        eventPower: ctx?.participant?.effectivePower ?? 0,
        sacrificedPower:
          ctx?.removed?.cause === "sacrifice" ? ctx.removed.effectivePower : 0,
        destroyedPower:
          ctx?.removed &&
          ["destruction", "power", "sacrifice"].includes(
            ctx.removed.cause ?? "",
          )
            ? ctx.removed.effectivePower
            : 0,
        incomingPower: ctx?.incoming?.effectivePower ?? 0,
        stackDepth:
          !position(s, source) && e.sourceSnapshot?.id === source
            ? e.sourceSnapshot.stackDepth
            : !position(s, source) && ctx?.participant?.id === source
              ? ctx.participant.stackDepth
              : c.stack.length + 1,
      };
      result = values[n.value];
      break;
    }
    case "count": {
      const cells = selectTargets(n.target, e);
      result = cells.reduce(
        (sum, c) =>
          sum +
          (n.what === "positions"
            ? 1
            : n.what === "creatures"
              ? Number(!!c.creature)
              : n.what === "tokens"
                ? c.tokens
                : n.what === "fortification"
                  ? c.fortification
                  : c.creature
                    ? power(c.creature)
                    : 0),
        0,
      );
      break;
    }
    case "history":
      result = (s.mechanics?.history ?? [])
        .filter(
          (h) =>
            h.event === n.event &&
            matchesHistory(n.filter, h.player, s.cards[source].owner, h),
        )
        .reduce((sum, h) => sum + h.count, 0);
      break;
    case "add":
      result = calc(n.left) + calc(n.right);
      break;
    case "subtract":
      result = calc(n.left) - calc(n.right);
      break;
    case "multiply":
      result = calc(n.value) * n.constant;
      break;
    case "divide": {
      if (!n.constant) throw new Error("Division by zero is unsupported.");
      const value = calc(n.value) / n.constant;
      result =
        n.rounding === "ceil"
          ? Math.ceil(value)
          : n.rounding === "nearest"
            ? Math.floor(value + 0.5)
            : n.rounding === "truncate"
              ? Math.trunc(value)
              : Math.floor(value);
      break;
    }
    case "clamp":
      result = Math.max(n.min, Math.min(n.max, calc(n.value)));
      break;
    default:
      throw new Error("Unsupported numerical expression.");
  }
  return bound(result);
}
export function evaluateCondition(
  c: Condition | undefined,
  e: Evaluation,
  depth = 0,
): boolean {
  if (!c) return true;
  if (depth > 8) throw new Error("Condition nesting limit exceeded.");
  const s = e.state,
    card = s.cards[e.source];
  switch (c.kind) {
    case "eventFriendly":
      return e.context?.player === card.owner;
    case "friendlyCount":
      return (
        s.board.filter(
          (p) => p.creature && s.cards[p.creature].owner === card.owner,
        ).length >= c.atLeast
      );
    case "sourcePower":
      return (
        evaluateNumber({ kind: "value", value: "sourcePower" }, e) >= c.atLeast
      );
    case "and":
      return c.conditions.every((x) => evaluateCondition(x, e, depth + 1));
    case "or":
      return c.conditions.some((x) => evaluateCondition(x, e, depth + 1));
    case "not":
      return !evaluateCondition(c.condition, e, depth + 1);
    case "compare": {
      const left = evaluateNumber(c.left, e),
        right = evaluateNumber(c.right, e);
      return c.operator === "gte"
        ? left >= right
        : c.operator === "gt"
          ? left > right
          : c.operator === "lte"
            ? left <= right
            : c.operator === "lt"
              ? left < right
              : c.operator === "eq"
                ? left === right
                : left !== right;
    }
    case "position": {
      const p = position(s, e.source);
      return (
        !!p &&
        (c.row === undefined || p.row === c.row) &&
        (c.col === undefined || p.col === c.col) &&
        (!c.edge ||
          p.row === 0 ||
          p.col === 0 ||
          p.row === s.config.battlefield.rows - 1 ||
          p.col === s.config.battlefield.cols - 1)
      );
    }
    case "evolutionStage":
      return (
        c.target
          ? selectTargets(c.target, e).flatMap((cell) =>
              cell.creature ? [s.cards[cell.creature]] : [],
            )
          : [card]
      ).some(
        (candidate) =>
          candidate.stack.length + 1 >= (c.atLeast ?? 1) &&
          (!c.definitions ||
            [...candidate.stack, candidate.id].some((id) =>
              c.definitions!.includes(s.cards[id].definitionId),
            )) &&
          (!c.tags ||
            [...candidate.stack, candidate.id].some((id) =>
              c.tags!.some((t) =>
                e.library[s.cards[id].definitionId].tags.includes(t),
              ),
            )),
      );
  }
}
const cache = new WeakMap<
  GameState,
  { library: CardLibrary; stamp: string; table: Record<string, PowerBreakdown> }
>();
export function powerTable(
  s: GameState,
  l: CardLibrary,
): Record<string, PowerBreakdown> {
  const stamp = JSON.stringify([
    s.board,
    Object.values(s.cards).map((c) => [
      c.id,
      c.definitionId,
      c.owner,
      c.modifier,
      c.statuses,
      c.stack,
      c.permanentEnhancement,
      c.permanentWeakening,
    ]),
    s.mechanics?.history,
  ]);
  const previous = cache.get(s);
  if (previous?.library === l && previous.stamp === stamp)
    return previous.table;
  const table: Record<string, PowerBreakdown> = {};
  for (const c of Object.values(s.cards)) {
    const base = l[c.definitionId].power,
      permanent = c.modifier;
    table[c.id] = {
      base,
      permanent,
      permanentEnhancement: c.permanentEnhancement ?? Math.max(0, permanent),
      permanentWeakening: c.permanentWeakening ?? Math.min(0, permanent),
      intrinsic: base + permanent,
      aura: 0,
      preDynamic: base + permanent,
      dynamic: 0,
      effective: base + permanent,
      auras: [],
      scaling: [],
      permanentProtections: [
        ...new Set([...c.statuses, ...(l[c.definitionId].protections ?? [])]),
      ],
      continuousProtections: [],
    };
  }
  const live = s.board.flatMap((c) => (c.creature ? [c.creature] : [])),
    raw = (id: string) => table[id]?.intrinsic ?? 0;
  // Protection and aura qualification read intrinsic power only. No fixed-point iteration is permitted.
  for (const id of live)
    for (const a of l[s.cards[id].definitionId].continuous ?? []) {
      if (a.kind !== "protection") continue;
      const e: Evaluation = {
        state: s,
        library: l,
        source: id,
        power: raw,
        statusPower: raw,
      };
      if (evaluateCondition(a.condition, e))
        for (const cell of selectTargets(a.target, e))
          if (cell.creature)
            table[cell.creature].continuousProtections.push({
              source: id,
              ability: a.id,
              protection: a.protection,
            });
    }
  const weakeningImmune = (id: string) =>
    table[id].permanentProtections.includes("weakening") ||
    table[id].continuousProtections.some((p) => p.protection === "weakening");
  for (const id of live)
    for (const a of l[s.cards[id].definitionId].continuous ?? []) {
      if (a.kind !== "power") continue;
      const e: Evaluation = {
        state: s,
        library: l,
        source: id,
        power: raw,
        statusPower: raw,
      };
      if (evaluateCondition(a.condition, e))
        for (const cell of selectTargets(a.target, e))
          if (cell.creature) {
            const amount = evaluateNumber(a.amount, {
              ...e,
              target: cell.creature,
            });
            if (amount < 0 && weakeningImmune(cell.creature)) continue;
            table[cell.creature].aura = bound(
              table[cell.creature].aura + amount,
            );
            table[cell.creature].auras.push({
              source: id,
              ability: a.id,
              amount,
            });
          }
    }
  for (const p of Object.values(table))
    p.preDynamic = bound(p.intrinsic + p.aura);
  const pre = (id: string) => table[id]?.preDynamic ?? 0;
  for (const id of live)
    for (const d of l[s.cards[id].definitionId].scaling ?? []) {
      const e: Evaluation = {
        state: s,
        library: l,
        source: id,
        power: pre,
        statusPower: pre,
      };
      if (!evaluateCondition(d.condition, e)) continue;
      const amount = evaluateNumber(d.amount, e);
      if (amount < 0 && weakeningImmune(id)) continue;
      table[id].dynamic = bound(table[id].dynamic + amount);
      table[id].scaling.push({ source: id, ability: d.id, amount });
    }
  for (const p of Object.values(table))
    p.effective = bound(p.preDynamic + p.dynamic);
  cache.set(s, { library: l, stamp, table });
  return table;
}
export function powerBreakdown(
  s: GameState,
  l: CardLibrary,
  id: string,
): PowerBreakdown {
  return powerTable(s, l)[id];
}
export function participant(
  s: GameState,
  l: CardLibrary,
  id: string,
  cause?: string,
): EventParticipant {
  const c = s.cards[id],
    d = l[c.definitionId],
    p = powerBreakdown(s, l, id);
  const cell = position(s, id);
  return {
    id,
    definitionId: d.id,
    name: d.name,
    owner: c.owner,
    tags: [...d.tags],
    kindred: d.kindred,
    basePower: d.power,
    effectivePower: p.effective,
    modifier: c.modifier,
    protections: [
      ...new Set([
        ...p.permanentProtections,
        ...p.continuousProtections.map((x) => x.protection),
      ]),
    ],
    stackDepth: c.stack.length + 1,
    ...(cell ? { position: { row: cell.row, col: cell.col } } : {}),
    ...(cause ? { cause } : {}),
  };
}
