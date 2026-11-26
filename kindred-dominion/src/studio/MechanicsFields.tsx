import type { CardDefinition, Condition } from "../engine/types";
import type {
  EventFilter,
  HistoryFilter,
  Numeric,
} from "../engine/advanced-types";
import { HISTORY_EVENTS } from "../engine/advanced-types";
import {
  describeCondition,
  describeNumber,
  describeTarget,
  PROTECTIONS,
} from "../engine/registry";
import { Field, NumberField, split } from "./components";
import TargetEditor from "./TargetEditor";
export function FilterEditor({
  value,
  onChange,
  event = false,
}: {
  value: EventFilter;
  onChange: (v: EventFilter) => void;
  event?: boolean;
}) {
  return (
    <fieldset>
      <legend>
        {event ? "Reactive event filters" : "Historical counter filters"}
      </legend>
      <div className="studio-grid two">
        <Field label="Event relationship">
          <select
            value={value.relation ?? "any"}
            onChange={(e) =>
              onChange({
                ...value,
                relation: e.target.value as HistoryFilter["relation"],
              })
            }
          >
            <option value="any">Any player</option>
            <option value="friendly">Friendly player</option>
            <option value="enemy">Enemy player</option>
          </select>
        </Field>
        {(["definitions", "tags", "kindreds", "causes"] as const).map((key) => (
          <Field key={key} label={`Event ${key} (comma separated)`}>
            <input
              defaultValue={value[key]?.join(", ") ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: split(e.target.value).length
                    ? split(e.target.value)
                    : undefined,
                })
              }
            />
          </Field>
        ))}
        {event && (
          <>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={value.excludeSelf ?? false}
                onChange={(e) =>
                  onChange({ ...value, excludeSelf: e.target.checked })
                }
              />
              Ignore events affecting the source
            </label>
            {(["permanent", "aura", "dynamic"] as const).map((kind) => (
              <label key={kind} className="studio-check">
                <input
                  type="checkbox"
                  checked={(value.powerChanges ?? ["permanent"]).includes(kind)}
                  disabled={
                    (value.powerChanges ?? ["permanent"]).length === 1 &&
                    (value.powerChanges ?? ["permanent"]).includes(kind)
                  }
                  onChange={(e) =>
                    onChange({
                      ...value,
                      powerChanges: e.target.checked
                        ? [...(value.powerChanges ?? ["permanent"]), kind]
                        : (value.powerChanges ?? ["permanent"]).filter(
                            (k) => k !== kind,
                          ),
                    })
                  }
                />
                React to {kind} power changes
              </label>
            ))}
          </>
        )}
      </div>
    </fieldset>
  );
}
const valueNames = {
  sourceBase: "Source printed power",
  sourcePower: "Source effective power",
  sourceIntrinsic: "Source base + permanent power",
  sourcePreDynamic: "Source power before dynamic scaling",
  targetBase: "Target printed power",
  targetPower: "Target effective power",
  targetIntrinsic: "Target base + permanent power",
  targetPreDynamic: "Target power before dynamic scaling",
  eventPower: "Captured event creature power",
  sacrificedPower: "Captured sacrificed creature power",
  destroyedPower: "Captured destroyed creature power",
  incomingPower: "Captured incoming creature power",
  stackDepth: "Source evolution stack depth",
  maximumFortification: "Selected ruleset's maximum fortification",
} as const;
function expression(kind: string): Numeric {
  switch (kind) {
    case "fixed":
      return 1;
    case "value":
      return { kind, value: "sourceBase" };
    case "count":
      return {
        kind,
        what: "creatures",
        target: { kind: "all", relation: "friendly", excludeSelf: true },
      };
    case "history":
      return { kind, event: "destroyed", filter: { relation: "enemy" } };
    case "add":
    case "subtract":
      return { kind, left: 1, right: 1 };
    case "multiply":
    case "divide":
      return { kind, value: 1, constant: 2, rounding: "floor" };
    default:
      return { kind: "clamp", value: 1, min: 0, max: 6 };
  }
}
export function ExpressionEditor({
  value,
  onChange,
  label = "Magnitude",
  phase = "effect",
  depth = 0,
}: {
  value: Numeric;
  onChange: (v: Numeric) => void;
  label?: string;
  phase?: "effect" | "aura" | "dynamic" | "score";
  depth?: number;
}) {
  const options = Object.entries(valueNames).filter(
    ([id]) =>
      !(
        phase !== "effect" &&
        [
          "eventPower",
          "sacrificedPower",
          "destroyedPower",
          "incomingPower",
        ].includes(id)
      ) &&
      !(
        phase === "aura" &&
        [
          "sourcePower",
          "targetPower",
          "sourcePreDynamic",
          "targetPreDynamic",
        ].includes(id)
      ) &&
      !(phase === "dynamic" && ["sourcePower", "targetPower"].includes(id)),
  );
  const nested = (n: Numeric, label: string, change: (v: Numeric) => void) => (
    <ExpressionEditor
      value={n}
      onChange={change}
      label={label}
      phase={phase}
      depth={depth + 1}
    />
  );
  return (
    <fieldset className="expression-editor">
      <legend>{label}</legend>
      <Field label={`${label} expression`}>
        <select
          value={typeof value === "number" ? "fixed" : value.kind}
          onChange={(e) => onChange(expression(e.target.value))}
        >
          <option value="fixed">Fixed amount</option>
          <option value="value">Named numerical value</option>
          <option value="count">Battlefield aggregate</option>
          <option value="history">Historical event count</option>
          {depth < 7 && (
            <>
              <option value="add">Add</option>
              <option value="subtract">Subtract</option>
              <option value="multiply">Multiply by constant</option>
              <option value="divide">Divide by constant</option>
              <option value="clamp">Minimum and maximum cap</option>
            </>
          )}
        </select>
      </Field>
      {typeof value === "number" ? (
        <NumberField
          label={label}
          value={value}
          min={-100000}
          max={100000}
          onChange={onChange}
        />
      ) : (
        <>
          {value.kind === "value" && (
            <Field label="Numerical value">
              <select
                value={value.value}
                onChange={(e) =>
                  onChange({
                    ...value,
                    value: e.target.value as keyof typeof valueNames,
                  })
                }
              >
                {options.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {value.kind === "count" && (
            <>
              <Field label="Aggregate quantity">
                <select
                  value={value.what}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      what: e.target.value as typeof value.what,
                    })
                  }
                >
                  {[
                    "creatures",
                    "positions",
                    "tokens",
                    "fortification",
                    "power",
                  ].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
              <TargetEditor
                pure
                value={value.target}
                onChange={(target) => onChange({ ...value, target })}
              />
            </>
          )}
          {value.kind === "history" && (
            <>
              <Field label="Historical event">
                <select
                  value={value.event}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      event: e.target.value as typeof value.event,
                    })
                  }
                >
                  {HISTORY_EVENTS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>
              <FilterEditor
                value={value.filter ?? {}}
                onChange={(filter) => onChange({ ...value, filter })}
              />
            </>
          )}
          {(value.kind === "add" || value.kind === "subtract") && (
            <div className="studio-grid two">
              {nested(value.left, "Left operand", (left) =>
                onChange({ ...value, left }),
              )}
              {nested(value.right, "Right operand", (right) =>
                onChange({ ...value, right }),
              )}
            </div>
          )}
          {(value.kind === "multiply" || value.kind === "divide") && (
            <>
              {nested(value.value, "Input amount", (v) =>
                onChange({ ...value, value: v }),
              )}
              <Field label="Configured constant">
                <input
                  type="number"
                  step="any"
                  value={value.constant}
                  onChange={(e) =>
                    onChange({ ...value, constant: Number(e.target.value) })
                  }
                />
              </Field>
              {value.kind === "divide" && (
                <Field label="Division rounding">
                  <select
                    value={value.rounding ?? "floor"}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        rounding: e.target.value as typeof value.rounding,
                      })
                    }
                  >
                    {["floor", "ceil", "nearest", "truncate"].map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </>
          )}
          {value.kind === "clamp" && (
            <>
              {nested(value.value, "Uncapped amount", (v) =>
                onChange({ ...value, value: v }),
              )}
              <NumberField
                label="Minimum result"
                value={value.min}
                min={-100000}
                max={100000}
                onChange={(min) => onChange({ ...value, min })}
              />
              <NumberField
                label="Maximum result"
                value={value.max}
                min={-100000}
                max={100000}
                onChange={(max) => onChange({ ...value, max })}
              />
            </>
          )}
        </>
      )}
      <small>Calculated magnitude: {describeNumber(value)}</small>
    </fieldset>
  );
}
function defaultCondition(kind: string): Condition | undefined {
  switch (kind) {
    case "none":
      return undefined;
    case "friendlyCount":
    case "sourcePower":
      return { kind, atLeast: 1 };
    case "eventFriendly":
      return { kind };
    case "and":
    case "or":
      return { kind, conditions: [{ kind: "friendlyCount", atLeast: 1 }] };
    case "not":
      return { kind, condition: { kind: "friendlyCount", atLeast: 1 } };
    case "position":
      return { kind, col: 0 };
    case "evolutionStage":
      return { kind, atLeast: 2 };
    default:
      return {
        kind: "compare",
        left: {
          kind: "count",
          what: "creatures",
          target: { kind: "all", relation: "friendly" },
        },
        operator: "gte",
        right: 2,
      };
  }
}
export function ConditionEditor({
  value,
  onChange,
  label = "Activation condition",
  phase = "effect",
  depth = 0,
}: {
  value?: Condition;
  onChange: (c: Condition | undefined) => void;
  label?: string;
  phase?: "effect" | "aura" | "dynamic" | "score";
  depth?: number;
}) {
  const options = {
    none: "Always",
    friendlyCount: "Friendly population threshold",
    sourcePower: "Source power threshold",
    eventFriendly: "Friendly event",
    compare: "Compare numerical values",
    position: "Source battlefield position",
    evolutionStage: "Evolution stage present",
    and: "All conditions (AND)",
    or: "Any condition (OR)",
    not: "Negate condition (NOT)",
  };
  return (
    <fieldset className="condition-editor">
      <legend>{label}</legend>
      <Field label={label}>
        <select
          value={value?.kind ?? "none"}
          onChange={(e) => onChange(defaultCondition(e.target.value))}
        >
          {Object.entries(options)
            .filter(
              ([id]) =>
                !(phase !== "effect" && id === "eventFriendly") &&
                !(depth >= 7 && ["and", "or", "not"].includes(id)),
            )
            .map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
      </Field>
      {value &&
        (value.kind === "friendlyCount" || value.kind === "sourcePower") && (
          <NumberField
            label="Condition threshold"
            value={value.atLeast}
            min={0}
            max={100000}
            onChange={(atLeast) => onChange({ ...value, atLeast })}
          />
        )}
      {value && (value.kind === "and" || value.kind === "or") && (
        <>
          {value.conditions.map((c, i) => (
            <div key={i}>
              <ConditionEditor
                value={c}
                onChange={(next) =>
                  onChange({
                    ...value,
                    conditions: value.conditions.map((old, j) =>
                      i === j
                        ? (next ?? { kind: "friendlyCount", atLeast: 0 })
                        : old,
                    ),
                  })
                }
                phase={phase}
                depth={depth + 1}
                label={`Combined condition ${i + 1}`}
              />
              <button
                type="button"
                disabled={value.conditions.length === 1}
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: value.conditions.filter((_, j) => i !== j),
                  })
                }
              >
                Remove combined condition
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={value.conditions.length >= 16}
            onClick={() =>
              onChange({
                ...value,
                conditions: [
                  ...value.conditions,
                  { kind: "friendlyCount", atLeast: 1 },
                ],
              })
            }
          >
            Add combined condition
          </button>
        </>
      )}
      {value?.kind === "not" && (
        <ConditionEditor
          value={value.condition}
          onChange={(condition) =>
            onChange({
              ...value,
              condition: condition ?? { kind: "friendlyCount", atLeast: 0 },
            })
          }
          phase={phase}
          depth={depth + 1}
          label="Negated condition"
        />
      )}
      {value?.kind === "compare" && (
        <>
          <ExpressionEditor
            label="Condition left value"
            value={value.left}
            onChange={(left) => onChange({ ...value, left })}
            phase={phase}
          />
          <Field label="Comparison operator">
            <select
              value={value.operator}
              onChange={(e) =>
                onChange({
                  ...value,
                  operator: e.target.value as typeof value.operator,
                })
              }
            >
              {Object.entries({
                gte: "At least (≥)",
                gt: "Greater than (>)",
                lte: "At most (≤)",
                lt: "Less than (<)",
                eq: "Equal (=)",
                ne: "Not equal (≠)",
              }).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <ExpressionEditor
            label="Condition right value"
            value={value.right}
            onChange={(right) => onChange({ ...value, right })}
            phase={phase}
          />
        </>
      )}
      {value?.kind === "position" && (
        <>
          {(["row", "col"] as const).map((key) => (
            <Field key={key} label={`Required ${key} (zero based)`}>
              <input
                type="number"
                value={value[key] ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [key]:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
          <label className="studio-check">
            <input
              type="checkbox"
              checked={value.edge ?? false}
              onChange={(e) => onChange({ ...value, edge: e.target.checked })}
            />
            Require an edge position
          </label>
        </>
      )}
      {value?.kind === "evolutionStage" && (
        <>
          <TargetEditor
            pure
            value={value.target ?? { kind: "self" }}
            onChange={(target) => onChange({ ...value, target })}
          />
          <NumberField
            label="Minimum stack depth"
            min={1}
            max={100}
            value={value.atLeast ?? 1}
            onChange={(atLeast) => onChange({ ...value, atLeast })}
          />
          {(["definitions", "tags"] as const).map((key) => (
            <Field key={key} label={`Evolution stage ${key}`}>
              <input
                defaultValue={value[key]?.join(", ") ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [key]: split(e.target.value).length
                      ? split(e.target.value)
                      : undefined,
                  })
                }
              />
            </Field>
          ))}
        </>
      )}
      {value && <small>{describeCondition(value)}</small>}
    </fieldset>
  );
}
export function AdvancedCardEditor({
  card,
  onChange,
}: {
  card: CardDefinition;
  onChange: (patch: Partial<CardDefinition>) => void;
}) {
  return (
    <section className="studio-subpanel">
      <h3>Continuous, dynamic and scoring mechanics</h3>
      <p>
        Auras and conditional protection use intrinsic power for eligibility.
        Dynamic scaling reads power after auras, before scaling. This
        calculation order prevents circular dependencies.
      </p>
      <h4>Continuous effects</h4>
      {(card.continuous ?? []).map((a, i) => (
        <article key={a.id} className="ability-editor">
          <h4>Continuous effect {i + 1}</h4>
          <Field label="Continuous effect kind">
            <select
              value={a.kind}
              onChange={(e) =>
                onChange({
                  continuous: card.continuous!.map((old, j) =>
                    j !== i
                      ? old
                      : e.target.value === "power"
                        ? {
                            id: a.id,
                            kind: "power",
                            target: a.target,
                            condition: a.condition,
                            amount: 1,
                          }
                        : {
                            id: a.id,
                            kind: "protection",
                            target: a.target,
                            condition: a.condition,
                            protection: "destruction",
                          },
                  ),
                })
              }
            >
              <option value="power">Continuous power</option>
              <option value="protection">Continuous protection</option>
            </select>
          </Field>
          <TargetEditor
            pure
            value={a.target}
            onChange={(target) =>
              onChange({
                continuous: card.continuous!.map((old, j) =>
                  i === j ? { ...old, target } : old,
                ),
              })
            }
          />
          {a.kind === "power" ? (
            <ExpressionEditor
              phase="aura"
              label="Continuous power amount"
              value={a.amount}
              onChange={(amount) =>
                onChange({
                  continuous: card.continuous!.map((old, j) =>
                    i === j ? { ...a, amount } : old,
                  ),
                })
              }
            />
          ) : (
            <Field label="Continuous protection">
              <select
                value={a.protection}
                onChange={(e) =>
                  onChange({
                    continuous: card.continuous!.map((old, j) =>
                      i === j
                        ? {
                            ...a,
                            protection: e.target.value as typeof a.protection,
                          }
                        : old,
                    ),
                  })
                }
              >
                {Object.entries(PROTECTIONS).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <ConditionEditor
            phase="aura"
            label="Continuous activation condition"
            value={a.condition}
            onChange={(condition) =>
              onChange({
                continuous: card.continuous!.map((old, j) =>
                  i === j ? { ...old, condition } : old,
                ),
              })
            }
          />
          <p>
            {a.kind === "power"
              ? describeNumber(a.amount)
              : PROTECTIONS[a.protection]}{" "}
            to {describeTarget(a.target)} while this source remains active.
          </p>
          <button
            type="button"
            onClick={() =>
              onChange({
                continuous: card.continuous!.filter((_, j) => j !== i),
              })
            }
          >
            Remove continuous effect
          </button>
        </article>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            continuous: [
              ...(card.continuous ?? []),
              {
                id: `${card.id || "draft"}-continuous-${Date.now().toString(36)}`,
                kind: "power",
                amount: 1,
                target: {
                  kind: "adjacent",
                  relation: "friendly",
                  excludeSelf: true,
                },
              },
            ],
          })
        }
      >
        Add continuous effect
      </button>
      <h4>Dynamic scaling</h4>
      {(card.scaling ?? []).map((d, i) => (
        <article key={d.id} className="ability-editor">
          <ExpressionEditor
            phase="dynamic"
            label="Dynamic power amount"
            value={d.amount}
            onChange={(amount) =>
              onChange({
                scaling: card.scaling!.map((old, j) =>
                  j === i ? { ...old, amount } : old,
                ),
              })
            }
          />
          <ConditionEditor
            phase="dynamic"
            label="Dynamic activation condition"
            value={d.condition}
            onChange={(condition) =>
              onChange({
                scaling: card.scaling!.map((old, j) =>
                  j === i ? { ...old, condition } : old,
                ),
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              onChange({ scaling: card.scaling!.filter((_, j) => j !== i) })
            }
          >
            Remove dynamic scaling
          </button>
        </article>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            scaling: [
              ...(card.scaling ?? []),
              {
                id: `${card.id || "draft"}-scaling-${Date.now().toString(36)}`,
                amount: {
                  kind: "count",
                  what: "creatures",
                  target: {
                    kind: "all",
                    relation: "friendly",
                    excludeSelf: true,
                  },
                },
              },
            ],
          })
        }
      >
        Add dynamic scaling
      </button>
      <h4>Card scoring bonuses</h4>
      {(card.scoring ?? []).map((b, i) => (
        <article key={b.id} className="ability-editor">
          <Field label="Scoring requirement">
            <select
              value={b.when}
              onChange={(e) =>
                onChange({
                  scoring: card.scoring!.map((old, j) =>
                    j === i
                      ? { ...old, when: e.target.value as typeof b.when }
                      : old,
                  ),
                })
              }
            >
              <option value="survives">Source survives</option>
              <option value="rowWon">Source horizontal row is won</option>
              <option value="columnWon">
                Source vertical column has greater effective power
              </option>
            </select>
          </Field>
          <ExpressionEditor
            phase="score"
            label="Bonus points"
            value={b.amount}
            onChange={(amount) =>
              onChange({
                scoring: card.scoring!.map((old, j) =>
                  j === i ? { ...old, amount } : old,
                ),
              })
            }
          />
          <ConditionEditor
            phase="score"
            label="Scoring condition"
            value={b.condition}
            onChange={(condition) =>
              onChange({
                scoring: card.scoring!.map((old, j) =>
                  j === i ? { ...old, condition } : old,
                ),
              })
            }
          />
          <button
            type="button"
            onClick={() =>
              onChange({ scoring: card.scoring!.filter((_, j) => j !== i) })
            }
          >
            Remove scoring bonus
          </button>
        </article>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange({
            scoring: [
              ...(card.scoring ?? []),
              {
                id: `${card.id || "draft"}-score-${Date.now().toString(36)}`,
                when: "survives",
                amount: 2,
              },
            ],
          })
        }
      >
        Add scoring bonus
      </button>
    </section>
  );
}
