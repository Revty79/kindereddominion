import type { Ability, Effect, Target } from "./types";
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
} as const;
export const TARGETS = {
  self: "Source creature",
  event: "Triggering creature",
  all: "All eligible positions / creatures",
  pattern: "Relative position pattern",
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
export function describeTarget(target: Target): string {
  const relationship =
    target.relation && target.relation !== "any" ? `${target.relation} ` : "";
  return `${relationship}${TARGETS[target.kind]}${target.kind === "pattern" ? ` (${target.offsets?.map((o) => `${o.x} forward, ${o.y} down`).join("; ") || "empty"})` : ""}${target.tags?.length ? ` classified ${target.tags.join(" or ")}` : ""}${target.excludeSelf ? ", excluding the source" : ""}`;
}
export function describeEffect(effect: Effect): string {
  if (effect.type === "resurrect")
    return `Resurrect ${effect.target === "self" ? "the source" : "the first eligible friendly graveyard card"}, at most ${effect.limit} time(s) per instance and lineage${effect.overrideEvolution ? "; evolution prerequisites explicitly overridden" : ""}. Persistent modifiers and universal limits apply.`;
  const target =
    "target" in effect ? describeTarget(effect.target as Target) : "your hand";
  return `${EFFECTS[effect.type].name}${"amount" in effect ? ` ${effect.amount > 0 ? "+" : ""}${effect.amount}` : ""}${"card" in effect ? ` [${effect.card}]` : ""}${"protection" in effect ? ` (${PROTECTIONS[effect.protection]})` : ""}: ${target}.`;
}
export function describeAbility(a: Ability): string {
  const condition = a.condition
    ? ` If ${a.condition.kind === "eventFriendly" ? "the event is friendly" : a.condition.kind === "friendlyCount" ? `you control at least ${a.condition.atLeast} creatures` : `source power is at least ${a.condition.atLeast}`}.`
    : "";
  return `${TRIGGERS[a.trigger]}.${condition} ${a.effects.map(describeEffect).join(" Then ")} Limits: ${a.limit?.perEvent ?? 1}/event${a.limit?.perTurn !== undefined ? `, ${a.limit.perTurn}/turn` : ""}${a.limit?.perMatch !== undefined ? `, ${a.limit.perMatch}/match` : ""}. ${a.allowOnResurrect ? "May activate from resurrection." : "Suppressed for resurrection placement events."}`;
}
