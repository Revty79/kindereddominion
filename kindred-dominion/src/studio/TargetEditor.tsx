import type { Target } from "../engine/types";
import { TARGETS } from "../engine/registry";
import { Field, PatternPicker, split } from "./components";
export default function TargetEditor({
  value,
  onChange,
  pure = false,
}: {
  value: Target;
  onChange: (v: Target) => void;
  pure?: boolean;
}) {
  const update = (patch: Partial<Target>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="target-editor">
      <legend>Eligible targets</legend>
      <div className="studio-grid two">
        <Field label="Target selection">
          <select
            value={value.kind}
            onChange={(e) =>
              update({
                kind: e.target.value as Target["kind"],
                ...(e.target.value === "pattern"
                  ? { offsets: value.offsets ?? [{ x: 1, y: 0 }] }
                  : {}),
              })
            }
          >
            {Object.entries(TARGETS).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target relationship">
          <select
            value={value.relation ?? "any"}
            onChange={(e) =>
              update({ relation: e.target.value as Target["relation"] })
            }
          >
            <option value="any">Any relationship</option>
            <option value="friendly">Friendly</option>
            <option value="enemy">Enemy</option>
          </select>
        </Field>
        {(["tags", "kindreds", "definitions"] as const).map((key) => (
          <Field
            key={key}
            label={
              key === "tags"
                ? "Target classifications (comma separated)"
                : key === "kindreds"
                  ? "Target Kindred identifiers (comma separated)"
                  : "Target card identifiers (comma separated)"
            }
          >
            <input
              defaultValue={value[key]?.join(", ") ?? ""}
              onChange={(e) =>
                update({
                  [key]: split(e.target.value).length
                    ? split(e.target.value)
                    : undefined,
                })
              }
            />
          </Field>
        ))}
        <Field label="Territory ownership">
          <select
            value={value.territory ?? "any"}
            onChange={(e) =>
              update({ territory: e.target.value as Target["territory"] })
            }
          >
            <option value="any">Any owner</option>
            <option value="friendly">Friendly territory</option>
            <option value="enemy">Enemy territory</option>
            <option value="neutral">Neutral territory</option>
          </select>
        </Field>
        <Field label="Target occupancy">
          <select
            value={value.occupied ?? ""}
            onChange={(e) =>
              update({
                occupied: (e.target.value as Target["occupied"]) || undefined,
              })
            }
          >
            <option value="">Occupied or empty</option>
            <option value="occupied">Occupied</option>
            <option value="empty">Empty</option>
          </select>
        </Field>
        <Field label="Target power status">
          <select
            value={value.status ?? ""}
            onChange={(e) =>
              update({
                status: (e.target.value as Target["status"]) || undefined,
              })
            }
          >
            <option value="">Any power status</option>
            <option value="enhanced">Enhanced before dynamic scaling</option>
            <option value="weakened">Weakened before dynamic scaling</option>
          </select>
        </Field>
        {(
          [
            ["row", "Absolute row (zero based)"],
            ["column", "Absolute column (zero based)"],
            ["minPower", "Minimum target power"],
            ["maxPower", "Maximum target power"],
            ["minTokens", "Minimum placement tokens"],
            ["maxTokens", "Maximum placement tokens"],
            ["minFortification", "Minimum fortification"],
            ["maxFortification", "Maximum fortification"],
            ["maxTargets", "Maximum target count"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              type="number"
              value={value[key] ?? ""}
              onChange={(e) =>
                update({
                  [key]:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        ))}
        <Field label="Target ordering">
          <select
            value={value.order ?? "coordinate"}
            onChange={(e) =>
              update({ order: e.target.value as Target["order"] })
            }
          >
            <option value="coordinate">Top to bottom, left to right</option>
            <option value="reverse">Reverse coordinate order</option>
            {!pure && <option value="random">Seeded random order</option>}
          </select>
        </Field>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={value.excludeSelf ?? false}
            onChange={(e) => update({ excludeSelf: e.target.checked })}
          />
          Exclude source
        </label>
      </div>
      {value.kind === "pattern" && (
        <PatternPicker
          offsets={value.offsets ?? []}
          onChange={(offsets) => update({ offsets })}
        />
      )}
      <small>
        Different filters combine with AND; values within a classification,
        Kindred or definition list are alternatives. Creature effects require a
        living target. Captured participant values remain available
        independently after removal.
      </small>
    </fieldset>
  );
}
