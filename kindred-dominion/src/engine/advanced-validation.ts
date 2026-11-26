import type { ContentPack, Issue } from "../content/types";
import { HISTORY_EVENTS, MAX_POWER } from "./advanced-types";
import { TARGETS } from "./registry";
type Phase = "effect" | "aura" | "dynamic" | "score";
const object = (v: any) => v && typeof v === "object" && !Array.isArray(v);
const integer = (v: any, min = -MAX_POWER, max = MAX_POWER) =>
  Number.isSafeInteger(v) && v >= min && v <= max;
const strings = (v: any) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.length <= 100 &&
  v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 100);
const issue = (path: string, message: string): Issue => ({
  severity: "error",
  path,
  message,
});
const extras = (v: any, keys: string[]) =>
  Object.keys(v).some((k) => !keys.includes(k));
export function validateFilter(
  v: any,
  path: string,
  pack: ContentPack,
  event = false,
): Issue[] {
  if (!object(v)) return [issue(path, "A structured filter is required.")];
  const out: Issue[] = [];
  if (
    extras(v, [
      "relation",
      "definitions",
      "tags",
      "kindreds",
      "causes",
      ...(event ? ["excludeSelf", "powerChanges"] : []),
    ])
  )
    out.push(issue(path, "Unsupported event/history filter."));
  if (
    v.relation !== undefined &&
    !["any", "friendly", "enemy"].includes(v.relation)
  )
    out.push(issue(path, "Invalid event relationship."));
  for (const k of ["definitions", "tags", "kindreds", "causes"])
    if (v[k] !== undefined && !strings(v[k]))
      out.push(issue(path, `Invalid ${k} filter.`));
  if (
    strings(v.definitions) &&
    v.definitions.some((id: string) => !pack.cards.some((c) => c.id === id))
  )
    out.push(issue(path, "Filter references a missing card definition."));
  if (
    strings(v.kindreds) &&
    v.kindreds.some((id: string) => !pack.collections.some((c) => c.id === id))
  )
    out.push(issue(path, "Filter references a missing Kindred."));
  if (v.excludeSelf !== undefined && typeof v.excludeSelf !== "boolean")
    out.push(issue(path, "Exclude source must be boolean."));
  if (
    v.powerChanges !== undefined &&
    (!strings(v.powerChanges) ||
      v.powerChanges.some(
        (k: string) => !["permanent", "aura", "dynamic"].includes(k),
      ))
  )
    out.push(
      issue(path, "Select permanent, aura and/or dynamic power changes."),
    );
  return out;
}
export function validateTargetDefinition(
  v: any,
  path: string,
  pack: ContentPack,
  pure = false,
): Issue[] {
  if (!object(v) || !(v.kind in TARGETS))
    return [issue(path, "Select a supported targeting method.")];
  const out: Issue[] = [];
  if (
    extras(v, [
      "kind",
      "relation",
      "offsets",
      "excludeSelf",
      "tags",
      "definitions",
      "kindreds",
      "territory",
      "occupied",
      "row",
      "column",
      "minTokens",
      "maxTokens",
      "minFortification",
      "maxFortification",
      "minPower",
      "maxPower",
      "status",
      "order",
      "maxTargets",
    ])
  )
    out.push(issue(path, "Unsupported target property."));
  if (
    v.relation !== undefined &&
    !["any", "friendly", "enemy"].includes(v.relation)
  )
    out.push(issue(path, "Invalid target relationship."));
  if (
    v.territory !== undefined &&
    !["any", "friendly", "enemy", "neutral"].includes(v.territory)
  )
    out.push(issue(path, "Invalid territory ownership filter."));
  if (v.occupied !== undefined && !["occupied", "empty"].includes(v.occupied))
    out.push(issue(path, "Invalid occupancy filter."));
  if (v.status !== undefined && !["enhanced", "weakened"].includes(v.status))
    out.push(issue(path, "Invalid power status."));
  if (
    v.order !== undefined &&
    !["coordinate", "reverse", "random"].includes(v.order)
  )
    out.push(issue(path, "Invalid target ordering."));
  if (pure && v.order === "random")
    out.push(
      issue(
        path,
        "Random target selection is only supported by effects; pure calculations cannot consume random numbers.",
      ),
    );
  if (v.excludeSelf !== undefined && typeof v.excludeSelf !== "boolean")
    out.push(issue(path, "Exclude source must be boolean."));
  for (const k of ["tags", "definitions", "kindreds"])
    if (v[k] !== undefined && !strings(v[k]))
      out.push(issue(path, `Invalid target ${k}.`));
  if (
    strings(v.definitions) &&
    v.definitions.some((id: string) => !pack.cards.some((c) => c.id === id))
  )
    out.push(issue(path, "Target definition is missing."));
  if (
    strings(v.kindreds) &&
    v.kindreds.some((id: string) => !pack.collections.some((c) => c.id === id))
  )
    out.push(issue(path, "Target Kindred is missing."));
  for (const k of [
    "minPower",
    "maxPower",
    "minTokens",
    "maxTokens",
    "minFortification",
    "maxFortification",
    "row",
    "column",
    "maxTargets",
  ])
    if (
      v[k] !== undefined &&
      !integer(
        v[k],
        k.includes("Power") ? -MAX_POWER : k === "maxTargets" ? 1 : 0,
        k === "row"
          ? 19
          : k === "column"
            ? 29
            : k === "maxTargets"
              ? 300
              : MAX_POWER,
      )
    )
      out.push(issue(path, `Invalid bounded ${k}.`));
  for (const [min, max] of [
    ["minPower", "maxPower"],
    ["minTokens", "maxTokens"],
    ["minFortification", "maxFortification"],
  ])
    if (v[min] !== undefined && v[max] !== undefined && v[min] > v[max])
      out.push(issue(path, "Target range minimum exceeds maximum."));
  if (
    v.kind === "pattern" &&
    (!Array.isArray(v.offsets) ||
      !v.offsets.length ||
      v.offsets.length > 300 ||
      v.offsets.some(
        (o: any) =>
          !object(o) ||
          !integer(o.x, -20, 20) ||
          !integer(o.y, -20, 20) ||
          extras(o, ["x", "y"]),
      ))
  )
    out.push(issue(path, "Relative targeting needs bounded positions."));
  return out;
}
export function validateNumberDefinition(
  v: any,
  path: string,
  pack: ContentPack,
  phase: Phase = "effect",
  depth = 0,
): Issue[] {
  if (depth > 8)
    return [issue(path, "Expression nesting exceeds eight levels.")];
  if (typeof v === "number")
    return integer(v)
      ? []
      : [issue(path, "Expression constants must be bounded safe integers.")];
  if (!object(v))
    return [issue(path, "Use a supported structured numerical expression.")];
  const next = (n: any, suffix: string) =>
    validateNumberDefinition(n, `${path}.${suffix}`, pack, phase, depth + 1);
  switch (v.kind) {
    case "value": {
      const values = [
        "sourceBase",
        "sourcePower",
        "sourceIntrinsic",
        "sourcePreDynamic",
        "targetBase",
        "targetPower",
        "targetIntrinsic",
        "targetPreDynamic",
        "eventPower",
        "sacrificedPower",
        "destroyedPower",
        "incomingPower",
        "stackDepth",
        "maximumFortification",
      ];
      if (extras(v, ["kind", "value"]) || !values.includes(v.value))
        return [issue(path, "Unsupported numerical value.")];
      if (
        ["aura", "dynamic", "score"].includes(phase) &&
        [
          "eventPower",
          "sacrificedPower",
          "destroyedPower",
          "incomingPower",
        ].includes(v.value)
      )
        return [
          issue(
            path,
            "Event participant values are only available to triggered effects.",
          ),
        ];
      if (
        (phase === "aura" &&
          [
            "sourcePower",
            "targetPower",
            "sourcePreDynamic",
            "targetPreDynamic",
          ].includes(v.value)) ||
        (phase === "dynamic" &&
          ["sourcePower", "targetPower"].includes(v.value))
      )
        return [
          issue(
            path,
            "Circular power dependency rejected. Auras may read intrinsic power; scaling may also read pre-dynamic power.",
          ),
        ];
      return [];
    }
    case "count":
      return extras(v, ["kind", "what", "target"]) ||
        ![
          "creatures",
          "positions",
          "tokens",
          "fortification",
          "power",
        ].includes(v.what)
        ? [issue(path, "Unsupported battlefield aggregate.")]
        : validateTargetDefinition(v.target, path, pack, true);
    case "history":
      return extras(v, ["kind", "event", "filter"]) ||
        !HISTORY_EVENTS.includes(v.event)
        ? [issue(path, "Unsupported historical counter.")]
        : v.filter
          ? validateFilter(v.filter, path, pack)
          : [];
    case "add":
    case "subtract":
      return [
        ...(extras(v, ["kind", "left", "right"])
          ? [issue(path, "Unsupported expression property.")]
          : []),
        ...next(v.left, "left"),
        ...next(v.right, "right"),
      ];
    case "multiply":
    case "divide":
      return [
        ...next(v.value, "value"),
        ...(!Number.isFinite(v.constant) ||
        Math.abs(v.constant) > 100 ||
        (v.kind === "divide" && Math.abs(v.constant) < 0.001) ||
        extras(v, ["kind", "value", "constant", "rounding"]) ||
        (v.rounding !== undefined &&
          !["floor", "ceil", "nearest", "truncate"].includes(v.rounding))
          ? [
              issue(
                path,
                "Use a finite multiplier/divisor up to 100, nonzero divisor and supported rounding.",
              ),
            ]
          : []),
      ];
    case "clamp":
      return [
        ...next(v.value, "value"),
        ...(!integer(v.min) ||
        !integer(v.max) ||
        v.min > v.max ||
        extras(v, ["kind", "value", "min", "max"])
          ? [issue(path, "Invalid expression minimum/maximum.")]
          : []),
      ];
    default:
      return [
        issue(
          path,
          "Unsupported numerical expression; executable formulas are not allowed.",
        ),
      ];
  }
}
export function validateConditionDefinition(
  v: any,
  path: string,
  pack: ContentPack,
  phase: Phase = "effect",
  depth = 0,
): Issue[] {
  if (depth > 8 || !object(v))
    return [issue(path, "Invalid condition or nesting exceeds eight levels.")];
  const next = (c: any) =>
    validateConditionDefinition(c, path, pack, phase, depth + 1);
  if (v.kind === "friendlyCount" || v.kind === "sourcePower")
    return integer(v.atLeast, 0) && !extras(v, ["kind", "atLeast"])
      ? []
      : [issue(path, "Invalid condition threshold.")];
  if (v.kind === "eventFriendly")
    return extras(v, ["kind"]) || phase !== "effect"
      ? [
          issue(
            path,
            "Event ownership is only available in a triggered ability.",
          ),
        ]
      : [];
  if (v.kind === "and" || v.kind === "or")
    return Array.isArray(v.conditions) &&
      v.conditions.length > 0 &&
      v.conditions.length <= 16 &&
      !extras(v, ["kind", "conditions"])
      ? v.conditions.flatMap(next)
      : [issue(path, "AND/OR needs 1–16 structured conditions.")];
  if (v.kind === "not")
    return [
      ...next(v.condition),
      ...(extras(v, ["kind", "condition"])
        ? [issue(path, "Unsupported condition property.")]
        : []),
    ];
  if (v.kind === "compare")
    return [
      ...validateNumberDefinition(v.left, path, pack, phase),
      ...validateNumberDefinition(v.right, path, pack, phase),
      ...(!["gte", "gt", "lte", "lt", "eq", "ne"].includes(v.operator) ||
      extras(v, ["kind", "left", "right", "operator"])
        ? [issue(path, "Unsupported numerical comparison.")]
        : []),
    ];
  if (v.kind === "position")
    return (v.row === undefined || integer(v.row, 0, 19)) &&
      (v.col === undefined || integer(v.col, 0, 29)) &&
      (v.edge === undefined || typeof v.edge === "boolean") &&
      !extras(v, ["kind", "row", "col", "edge"])
      ? []
      : [issue(path, "Invalid battlefield position condition.")];
  if (v.kind === "evolutionStage")
    return [
      ...((v.definitions !== undefined &&
        (!strings(v.definitions) ||
          v.definitions.some(
            (id: string) => !pack.cards.some((c) => c.id === id),
          ))) ||
      (v.tags !== undefined && !strings(v.tags)) ||
      (v.atLeast !== undefined && !integer(v.atLeast, 1, 100)) ||
      extras(v, ["kind", "definitions", "tags", "atLeast", "target"])
        ? [issue(path, "Invalid evolution-stage condition.")]
        : []),
      ...(v.target ? validateTargetDefinition(v.target, path, pack, true) : []),
    ];
  return [issue(path, "Unsupported condition.")];
}
export function validateAdvancedCard(c: any, pack: ContentPack): Issue[] {
  const out: Issue[] = [],
    ids = new Set<string>();
  for (const key of ["continuous", "scaling", "scoring"]) {
    if (c[key] === undefined) continue;
    if (!Array.isArray(c[key]) || c[key].length > 32) {
      out.push(issue(key, "Use at most 32 structured entries."));
      continue;
    }
    c[key].forEach((v: any, i: number) => {
      const path = `${key}.${i}`,
        phase: Phase =
          key === "continuous"
            ? "aura"
            : key === "scaling"
              ? "dynamic"
              : "score";
      if (
        !object(v) ||
        typeof v.id !== "string" ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(v.id) ||
        ids.has(v.id)
      ) {
        out.push(
          issue(
            path,
            "Each continuous/scaling/scoring entry needs a unique stable identifier.",
          ),
        );
        return;
      }
      ids.add(v.id);
      if (v.condition)
        out.push(
          ...validateConditionDefinition(v.condition, path, pack, phase),
        );
      if (key === "continuous") {
        out.push(...validateTargetDefinition(v.target, path, pack, true));
        if (
          !["power", "protection"].includes(v.kind) ||
          extras(v, [
            "id",
            "kind",
            "target",
            "condition",
            v.kind === "power" ? "amount" : "protection",
          ])
        )
          out.push(issue(path, "Choose continuous power or protection."));
        if (
          v.kind === "protection" &&
          !["destruction", "weakening"].includes(v.protection)
        )
          out.push(issue(path, "Unsupported continuous protection."));
      }
      if (
        key === "scoring" &&
        (!["survives", "rowWon", "columnWon"].includes(v.when) ||
          extras(v, ["id", "when", "amount", "condition"]))
      )
        out.push(
          issue(
            path,
            "Choose surviving, row-winning or column-winning scoring.",
          ),
        );
      if (key === "scaling" && extras(v, ["id", "amount", "condition"]))
        out.push(issue(path, "Unsupported scaling property."));
      if (v.kind !== "protection")
        out.push(...validateNumberDefinition(v.amount, path, pack, phase));
    });
  }
  for (const [i, a] of (Array.isArray(c.abilities)
    ? c.abilities
    : []
  ).entries()) {
    if (!object(a)) continue;
    const path = `abilities.${i}`;
    if (a.eventFilter)
      out.push(...validateFilter(a.eventFilter, path, pack, true));
    if (a.repeatable !== undefined && typeof a.repeatable !== "boolean")
      out.push(issue(path, "Repeatable must be boolean."));
    if (a.trigger === "condition" && !a.condition)
      out.push(
        issue(path, "Condition-transition abilities require a condition."),
      );
    if (
      a.trigger === "powerThreshold" &&
      (!object(a.threshold) ||
        !integer(a.threshold.value) ||
        !["up", "down", "either"].includes(a.threshold.direction))
    )
      out.push(
        issue(path, "Power crossing needs a bounded threshold and direction."),
      );
    if (a.threshold && a.trigger !== "powerThreshold")
      out.push(
        issue(
          path,
          "Power threshold configuration requires the power-crossing trigger.",
        ),
      );
  }
  return out;
}
export function validateAdvancedLibrary(
  library: import("./types").CardLibrary,
): void {
  const cards = Object.values(library),
    pack = {
      cards,
      collections: [...new Set(cards.map((c) => c.kindred))].map((id) => ({
        id,
      })),
    } as ContentPack;
  const errors = cards.flatMap((c) => validateAdvancedCard(c, pack));
  if (errors.length)
    throw new Error(errors.map((i) => `${i.path}: ${i.message}`).join("\n"));
}
export function validateMechanicsState(value: any): void {
  if (
    !object(value) ||
    value.version !== 2 ||
    !Array.isArray(value.history) ||
    value.history.length > 4096 ||
    !object(value.thresholds) ||
    !object(value.firstChanges)
  )
    throw new Error("Invalid advanced state schema.");
  for (const h of value.history)
    if (
      !object(h) ||
      !HISTORY_EVENTS.includes(h.event) ||
      ![0, 1].includes(h.player) ||
      !integer(h.count, 1) ||
      typeof h.cause !== "string" ||
      !Array.isArray(h.tags) ||
      h.tags.some((s: any) => typeof s !== "string")
    )
      throw new Error("Invalid historical event counter.");
  for (const counters of [value.thresholds, value.firstChanges])
    if (
      Object.keys(counters).length > 100000 ||
      Object.values(counters).some((v) => typeof v !== "boolean")
    )
      throw new Error("Invalid transition/first-change counters.");
}
