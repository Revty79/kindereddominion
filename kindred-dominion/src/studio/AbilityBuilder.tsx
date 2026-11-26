import type {
  Ability,
  CardDefinition,
  Condition,
  Effect,
  Target,
} from "../engine/types";
import {
  CONDITIONS,
  describeAbility,
  EFFECTS,
  PROTECTIONS,
  TARGETS,
  TRIGGERS,
} from "../engine/registry";
import { Field, NumberField } from "./components";
import TargetEditor from "./TargetEditor";
import {
  ConditionEditor,
  ExpressionEditor,
  FilterEditor,
} from "./MechanicsFields";
function defaultEffect(type: Effect["type"], cards: CardDefinition[]): Effect {
  const target: Target = { kind: "self" };
  const card = (placement?: string) =>
    cards.find((c) => !placement || c.type === placement)?.id ?? "";
  switch (type) {
    case "draw":
      return { type, amount: 1 };
    case "generate":
      return { type, card: card(), amount: 1 };
    case "resurrect":
      return { type, target: "self", limit: 1 };
    case "protect":
      return { type, protection: "destruction", target };
    case "summon":
    case "replace":
    case "evolve":
      return {
        type,
        card: card(
          { summon: "standard", replace: "replacement", evolve: "evolution" }[
            type
          ],
        ),
        target,
      };
    case "destroy":
    case "return":
    case "banish":
      return { type, target };
    default:
      return { type, amount: 1, target };
  }
}
export default function AbilityBuilder({
  abilities,
  onChange,
  cards,
  cardId,
}: {
  abilities: Ability[];
  onChange: (a: Ability[]) => void;
  cards: CardDefinition[];
  cardId: string;
}) {
  const update = (index: number, value: Ability) =>
    onChange(abilities.map((a, i) => (i === index ? value : a)));
  const order = <T,>(items: T[], i: number, dir: number) => {
    const next = items.slice();
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  };
  return (
    <section className="studio-subpanel">
      <div className="studio-section-title">
        <h3>Ability builder</h3>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...abilities,
              {
                id: `${cardId || "draft"}-ability-${abilities.length + 1}`,
                trigger: "placement",
                effects: [defaultEffect("power", cards)],
                limit: { perEvent: 1 },
                allowOnResurrect: false,
              },
            ])
          }
        >
          Add ability
        </button>
      </div>
      <p>
        Targets within one effect resolve simultaneously. Effects and abilities
        follow the displayed declaration order. Universal generation,
        resurrection and resolution safeguards always apply.
      </p>
      {abilities.map((a, index) => (
        <article className="ability-editor" key={index}>
          <div className="studio-section-title">
            <h4>Ability {index + 1}</h4>
            <div className="studio-actions">
              <button
                type="button"
                disabled={!index}
                onClick={() => onChange(order(abilities, index, -1))}
              >
                Earlier ability
              </button>
              <button
                type="button"
                disabled={index === abilities.length - 1}
                onClick={() => onChange(order(abilities, index, 1))}
              >
                Later ability
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange(abilities.filter((_, i) => i !== index))
                }
              >
                Remove ability
              </button>
            </div>
          </div>
          <div className="studio-grid two">
            <Field label="Ability identifier">
              <input
                value={a.id}
                onChange={(e) => update(index, { ...a, id: e.target.value })}
              />
            </Field>
            <Field label="Trigger">
              <select
                value={a.trigger}
                onChange={(e) =>
                  update(index, {
                    ...a,
                    trigger: e.target.value as Ability["trigger"],
                    ...(e.target.value === "powerThreshold"
                      ? {
                          threshold: { value: 5, direction: "up" as const },
                          eventFilter: {
                            ...a.eventFilter,
                            powerChanges: a.eventFilter?.powerChanges ?? [
                              "permanent",
                              "aura",
                              "dynamic",
                            ],
                          },
                        }
                      : { threshold: undefined }),
                    ...(e.target.value === "condition" && !a.condition
                      ? {
                          condition: {
                            kind: "sourcePower" as const,
                            atLeast: 5,
                          },
                        }
                      : {}),
                  })
                }
              >
                {Object.entries(TRIGGERS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <ConditionEditor
              value={a.condition}
              onChange={(condition) => update(index, { ...a, condition })}
            />
          </div>
          {a.trigger === "powerThreshold" && (
            <div className="studio-grid two">
              <NumberField
                label="Power crossing threshold"
                value={a.threshold?.value ?? 5}
                min={-100000}
                max={100000}
                onChange={(value) =>
                  update(index, {
                    ...a,
                    threshold: {
                      value,
                      direction: a.threshold?.direction ?? "up",
                    },
                  })
                }
              />
              <Field label="Power crossing direction">
                <select
                  value={a.threshold?.direction ?? "up"}
                  onChange={(e) =>
                    update(index, {
                      ...a,
                      threshold: {
                        value: a.threshold?.value ?? 5,
                        direction: e.target.value as "up" | "down" | "either",
                      },
                    })
                  }
                >
                  <option value="up">Reaches or exceeds</option>
                  <option value="down">Falls below</option>
                  <option value="either">Either crossing</option>
                </select>
              </Field>
            </div>
          )}
          {["condition", "powerThreshold"].includes(a.trigger) && (
            <label className="studio-check">
              <input
                type="checkbox"
                checked={a.repeatable ?? false}
                onChange={(e) =>
                  update(index, { ...a, repeatable: e.target.checked })
                }
              />
              Allow repeated false-to-true/crossing activations (other limits
              still apply)
            </label>
          )}
          <details>
            <summary>
              Reactive relationship, cause and power-change filters
            </summary>
            <FilterEditor
              event
              value={
                a.eventFilter ??
                (a.trigger === "powerThreshold"
                  ? { powerChanges: ["permanent", "aura", "dynamic"] }
                  : {})
              }
              onChange={(eventFilter) => update(index, { ...a, eventFilter })}
            />
          </details>
          <div className="studio-grid three">
            {(["perEvent", "perTurn", "perMatch"] as const).map((key) => (
              <Field
                key={key}
                label={
                  {
                    perEvent: "Maximum per event",
                    perTurn: "Maximum per turn",
                    perMatch: "Maximum per match",
                  }[key]
                }
              >
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder={
                    key === "perEvent" ? "Default: 1" : "No additional limit"
                  }
                  value={a.limit?.[key] ?? ""}
                  onChange={(e) => {
                    const limits = { ...a.limit };
                    if (e.target.value === "") delete limits[key];
                    else limits[key] = Number(e.target.value);
                    update(index, { ...a, limit: limits });
                  }}
                />
              </Field>
            ))}
          </div>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={a.allowOnResurrect ?? false}
              onChange={(e) =>
                update(index, { ...a, allowOnResurrect: e.target.checked })
              }
            />
            Allow this ability to activate from resurrection placement/evolution
            events
          </label>
          {a.effects.map((effect, j) => {
            const capability = EFFECTS[effect.type];
            const change = (value: Effect) =>
              update(index, {
                ...a,
                effects: a.effects.map((x, k) => (k === j ? value : x)),
              });
            return (
              <section className="effect-editor" key={j}>
                <div className="studio-section-title">
                  <b>
                    Effect {j + 1} · {j === 0 ? "first" : "then"}
                  </b>
                  <div className="studio-actions">
                    <button
                      type="button"
                      disabled={!j}
                      onClick={() =>
                        update(index, {
                          ...a,
                          effects: order(a.effects, j, -1),
                        })
                      }
                    >
                      Earlier effect
                    </button>
                    <button
                      type="button"
                      disabled={j === a.effects.length - 1}
                      onClick={() =>
                        update(index, { ...a, effects: order(a.effects, j, 1) })
                      }
                    >
                      Later effect
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update(index, {
                          ...a,
                          effects: a.effects.filter((_, k) => k !== j),
                        })
                      }
                    >
                      Remove effect
                    </button>
                  </div>
                </div>
                <div className="studio-grid two">
                  <Field label="Effect mechanic">
                    <select
                      value={effect.type}
                      onChange={(e) =>
                        change(
                          defaultEffect(
                            e.target.value as Effect["type"],
                            cards,
                          ),
                        )
                      }
                    >
                      {Object.entries(EFFECTS).map(([id, v]) => (
                        <option key={id} value={id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {"amount" in effect && (
                    <ExpressionEditor
                      label={
                        effect.type === "power"
                          ? "Power change (negative weakens)"
                          : "Effect strength / count"
                      }
                      value={effect.amount}
                      onChange={(amount) => change({ ...effect, amount })}
                    />
                  )}
                  {"card" in effect && (
                    <Field label="Referenced card">
                      <select
                        value={effect.card}
                        onChange={(e) =>
                          change({ ...effect, card: e.target.value })
                        }
                      >
                        {cards
                          .filter(
                            (c) =>
                              !["summon", "replace", "evolve"].includes(
                                effect.type,
                              ) ||
                              c.type ===
                                (
                                  {
                                    summon: "standard",
                                    replace: "replacement",
                                    evolve: "evolution",
                                  } as any
                                )[effect.type],
                          )
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} · {c.id}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  {effect.type === "protect" && (
                    <Field label="Protection category">
                      <select
                        value={effect.protection}
                        onChange={(e) =>
                          change({
                            ...effect,
                            protection: e.target.value as
                              | "destruction"
                              | "weakening",
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
                  {effect.type === "resurrect" && (
                    <>
                      <Field label="Resurrection candidate">
                        <select
                          value={effect.target}
                          onChange={(e) =>
                            change({
                              ...effect,
                              target: e.target.value as
                                | "self"
                                | "firstFriendly",
                            })
                          }
                        >
                          <option value="self">
                            Source from its graveyard
                          </option>
                          <option value="firstFriendly">
                            First eligible friendly graveyard card
                          </option>
                        </select>
                      </Field>
                      <NumberField
                        label="Resurrection limit per instance / lineage"
                        min={1}
                        max={100}
                        value={effect.limit}
                        onChange={(limit) => change({ ...effect, limit })}
                      />
                      <label className="studio-check">
                        <input
                          type="checkbox"
                          checked={effect.overrideEvolution ?? false}
                          onChange={(e) =>
                            change({
                              ...effect,
                              overrideEvolution: e.target.checked,
                            })
                          }
                        />
                        Explicitly override evolution prerequisites on
                        resurrection
                      </label>
                    </>
                  )}
                </div>
                {"target" in capability &&
                  "target" in effect &&
                  typeof effect.target === "object" && (
                    <TargetEditor
                      value={effect.target}
                      onChange={(target) =>
                        change({ ...effect, target } as Effect)
                      }
                    />
                  )}
              </section>
            );
          })}
          <button
            type="button"
            onClick={() =>
              update(index, {
                ...a,
                effects: [...a.effects, defaultEffect("power", cards)],
              })
            }
          >
            Add sequential effect
          </button>
          <p className="generated-description">
            <b>Generated executable description:</b> {describeAbility(a)}
          </p>
        </article>
      ))}
    </section>
  );
}
