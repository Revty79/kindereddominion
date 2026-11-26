import type { Ability, Effect, Target } from "./types";
import type { Numeric } from "./advanced-types";
export const TRIGGERS = {
  placement: "On placement",
  replacement: "On replacement",
  evolution: "On evolution",
  destruction: "On destruction",
  sacrifice: "On sacrifice",
  turnStart: "Beginning of your turn",
  turnEnd: "End of your turn",
  otherPlacement: "Other creature placement",
  otherDestruction: "Other creature destruction",
  enhanced: "Source enhanced",
  weakened: "Source weakened",
  otherEnhanced: "Other creature enhanced",
  otherWeakened: "Other creature weakened",
  firstEnhanced: "Source first enhanced this match",
  firstWeakened: "Source first weakened this match",
  powerThreshold: "Source crosses power threshold",
  condition: "Condition becomes true",
  territoryClaimed: "Territory claimed",
  territoryCaptured: "Enemy territory captured",
  territoryLost: "Friendly territory lost",
  territoryFortified: "Territory fortified",
  fortificationReduced: "Fortification reduced",
  resurrected: "Creature resurrected",
  banished: "Creature banished",
  returned: "Creature returned to hand",
  drawn: "Card drawn",
  generated: "Card generated",
} as const;
export const EFFECTS = {
  tokens: { name: "Modify placement tokens", target: true, amount: true },
  fortify: { name: "Modify fortification", target: true, amount: true },
  capture: { name: "Expansion / ordinary capture", target: true, amount: true },
  overthrow: { name: "Overthrow enemy territory", target: true, amount: true },
  power: { name: "Enhance / weaken power", target: true, amount: true },
  destroy: { name: "Direct destruction", target: true },
  summon: { name: "Summon a standard creature", target: true, card: true },
  replace: { name: "Replace a friendly creature", target: true, card: true },
  evolve: { name: "Evolve a friendly creature", target: true, card: true },
  resurrect: { name: "Limited resurrection" },
  draw: { name: "Draw cards", amount: true },
  generate: { name: "Generate cards in hand", amount: true, card: true },
  protect: { name: "Grant protection", target: true },
  return: { name: "Return to hand", target: true },
  banish: { name: "Banish to exile", target: true },
} as const;
export const CONDITIONS = {
  none: "Always",
  friendlyCount: "At least this many friendly creatures",
  sourcePower: "Source has at least this power",
  eventFriendly: "Triggering event belongs to a friendly player",
  compare: "Compare numerical values",
  position: "Source battlefield position",
  evolutionStage: "Evolution stage present",
  and: "All conditions (AND)",
  or: "Any condition (OR)",
  not: "Negate condition (NOT)",
} as const;
export const TARGETS = {
  self: "Source creature",
  event: "Triggering creature",
  all: "All eligible positions / creatures",
  pattern: "Relative position pattern",
  incoming: "Incoming replacement or evolution",
  sacrificed:
    "Sacrificed creature still present (context values remain after removal)",
  destroyed:
    "Destroyed creature still present (context values remain after removal)",
  adjacent: "Eight adjacent positions",
  orthogonal: "Orthogonal neighbors",
  diagonal: "Diagonal neighbors",
  row: "Horizontal row",
  column: "Vertical column",
} as const;
export const MECHANICS = {
  expansion: "Expansion / token contribution",
  fortification: "Fortification",
  overthrow: "Overthrow",
} as const;
export const PROTECTIONS = {
  destruction: "Immune to direct destruction",
  weakening: "Immune to weakening",
} as const;
export const ADVANCED_MECHANICS = {
  continuous: "Continuous power and conditional protection",
  scaling: "Dynamic power scaling",
  scoring: "Card-specific scoring bonuses",
  conditions: "Structured AND / OR / NOT conditions and transitions",
  expressions: "Bounded numerical expressions and immutable participants",
  history: "Filtered lifetime event counters",
  reactive: "Successful-change reactive events and causal safeguards",
} as const;
export function describeTarget(target: Target): string {
  const relationship =
    target.relation && target.relation !== "any" ? `${target.relation} ` : "";
  const filters = [
    target.definitions?.length
      ? `definitions ${target.definitions.join(" or ")}`
      : "",
    target.kindreds?.length ? `Kindreds ${target.kindreds.join(" or ")}` : "",
    target.territory && target.territory !== "any"
      ? `${target.territory} territory`
      : "",
    target.occupied ?? "",
    target.status ? `${target.status} before dynamic scaling` : "",
    target.row !== undefined ? `row ${target.row}` : "",
    target.column !== undefined ? `column ${target.column}` : "",
    ...(["Power", "Tokens", "Fortification"] as const).flatMap((key) => {
      const min = target[`min${key}`],
        max = target[`max${key}`];
      return min !== undefined || max !== undefined
        ? [`${key.toLowerCase()} [${min ?? "any"}, ${max ?? "any"}]`]
        : [];
    }),
    target.maxTargets !== undefined ? `at most ${target.maxTargets}` : "",
    target.order ? `${target.order} ordering` : "",
  ].filter(Boolean);
  return `${relationship}${TARGETS[target.kind]}${target.kind === "pattern" ? ` (${target.offsets?.map((o) => `${o.x} forward, ${o.y} down`).join("; ") || "empty"})` : ""}${target.tags?.length ? ` classified ${target.tags.join(" or ")}` : ""}${target.excludeSelf ? ", excluding the source" : ""}${filters.length ? `; ${filters.join("; ")}` : ""}`;
}
export function describeEffect(effect: Effect): string {
  if (effect.type === "resurrect")
    return `Resurrect ${effect.target === "self" ? "the source" : "the first eligible friendly graveyard card"}, at most ${effect.limit} time(s) per instance and lineage${effect.overrideEvolution ? "; evolution prerequisites explicitly overridden" : ""}. Persistent modifiers and universal limits apply.`;
  const target =
    "target" in effect ? describeTarget(effect.target as Target) : "your hand";
  return `${EFFECTS[effect.type].name}${"amount" in effect ? ` ${typeof effect.amount === "number" && effect.amount > 0 ? "+" : ""}${describeNumber(effect.amount)}` : ""}${"card" in effect ? ` [${effect.card}]` : ""}${"protection" in effect ? ` (${PROTECTIONS[effect.protection]})` : ""}: ${target}.`;
}
export function describeAbility(a: Ability): string {
  const condition = a.condition
    ? ` If ${a.condition.kind === "eventFriendly" ? "the event is friendly" : a.condition.kind === "friendlyCount" ? `you control at least ${a.condition.atLeast} creatures` : a.condition.kind === "sourcePower" ? `source power is at least ${a.condition.atLeast}` : describeCondition(a.condition)}.`
    : "";
  const perMatch =
    a.limit?.perMatch ??
    (["firstEnhanced", "firstWeakened"].includes(a.trigger) ||
    (["condition", "powerThreshold"].includes(a.trigger) && !a.repeatable)
      ? 1
      : undefined);
  const extras = [
    a.trigger === "condition" ? "False-to-true transitions only." : "",
    a.threshold ? `Cross ${a.threshold.value}, ${a.threshold.direction}.` : "",
    a.repeatable ? "Repeatable transitions, subject to limits." : "",
    a.eventFilter
      ? `Event filters: ${a.eventFilter.relation ?? "any"}; ${(a.eventFilter.powerChanges ?? ["permanent"]).join("/")} power changes${a.eventFilter.causes ? `; causes ${a.eventFilter.causes.join("/")}` : ""}${a.eventFilter.tags ? `; classifications ${a.eventFilter.tags.join("/")}` : ""}${a.eventFilter.definitions ? `; definitions ${a.eventFilter.definitions.join("/")}` : ""}${a.eventFilter.kindreds ? `; Kindreds ${a.eventFilter.kindreds.join("/")}` : ""}${a.eventFilter.excludeSelf ? "; excluding source" : ""}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `${TRIGGERS[a.trigger]}.${condition} ${a.effects.map(describeEffect).join(" Then ")} Limits: ${a.limit?.perEvent ?? 1}/event${a.limit?.perTurn !== undefined ? `, ${a.limit.perTurn}/turn` : ""}${perMatch !== undefined ? `, ${perMatch}/match` : ""}. ${a.allowOnResurrect ? "May activate from resurrection." : "Suppressed for resurrection placement events."}${extras ? ` ${extras}` : ""}`;
}
export function describeNumber(n: Numeric): string {
  if (typeof n === "number") return String(n);
  if (n.kind === "value") return n.value;
  if (n.kind === "count") return `${n.what} in ${describeTarget(n.target)}`;
  if (n.kind === "history")
    return `historical ${n.event} (${n.filter?.relation ?? "any"}; ${n.filter?.tags?.join("/") ?? n.filter?.kindreds?.join("/") ?? n.filter?.definitions?.join("/") ?? "all eligible"})`;
  if (n.kind === "add" || n.kind === "subtract")
    return `(${describeNumber(n.left)} ${n.kind === "add" ? "+" : "−"} ${describeNumber(n.right)})`;
  if (n.kind === "clamp")
    return `clamp ${describeNumber(n.value)} to [${n.min}, ${n.max}]`;
  if (n.kind === "multiply" || n.kind === "divide")
    return `(${describeNumber(n.value)} ${n.kind === "multiply" ? "×" : "÷"} ${n.constant}${n.kind === "divide" ? `, ${n.rounding ?? "floor"}` : ""})`;
  return "unsupported expression";
}
export function describeCondition(c: import("./types").Condition): string {
  if (c.kind === "friendlyCount") return `friendly population ≥ ${c.atLeast}`;
  if (c.kind === "sourcePower") return `source power ≥ ${c.atLeast}`;
  if (c.kind === "eventFriendly") return "the event is friendly";
  if (c.kind === "and" || c.kind === "or")
    return `(${c.conditions.map(describeCondition).join(c.kind === "and" ? " AND " : " OR ")})`;
  if (c.kind === "not") return `NOT (${describeCondition(c.condition)})`;
  if (c.kind === "compare")
    return `${describeNumber(c.left)} ${c.operator} ${describeNumber(c.right)}`;
  if (c.kind === "position")
    return `at row ${c.row ?? "any"}, column ${c.col ?? "any"}${c.edge ? ", on an edge" : ""}`;
  if (c.kind === "evolutionStage")
    return `stack depth ≥ ${c.atLeast ?? 1}; stages ${c.definitions?.join("/") ?? c.tags?.join("/") ?? "any"}${c.target ? ` among ${describeTarget(c.target)}` : " in the source"}`;
  return "unsupported condition";
}
