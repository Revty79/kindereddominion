import { useState } from "react";
import type { CardDefinition, Prerequisite } from "../engine/types";
import type { CardMetadata, ContentPack } from "../content/types";
import { defaultMetadata } from "../content/baseline";
import { saveCard } from "../content/operations";
import { validateCard } from "../content/validation";
import {
  CardPreview,
  Field,
  InfluenceEditor,
  Issues,
  NumberField,
  split,
} from "./components";
import AbilityBuilder from "./AbilityBuilder";
export default function CardEditor({
  content,
  initial,
  initialMeta,
  originalId,
  onSave,
}: {
  content: ContentPack;
  initial?: CardDefinition;
  initialMeta?: CardMetadata;
  originalId: string | null;
  onSave: (pack: ContentPack) => Promise<void>;
}) {
  const [card, setCard] = useState<CardDefinition>(() =>
    structuredClone(
      initial ?? {
        id: "",
        name: "",
        kindred: content.collections[0]?.id ?? "",
        rank: 1,
        power: 2,
        type: "standard",
        tags: [],
        influence: [],
        abilities: [],
        text: "Provisional development card.",
        glyph: "◇",
      },
    ),
  );
  const [meta, setMeta] = useState<CardMetadata>(() =>
    structuredClone(initialMeta ?? defaultMetadata()),
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<CardDefinition>) =>
    setCard((prev) => ({ ...prev, ...patch }));
  const prereq = (patch: Partial<Prerequisite>) =>
    update({ prerequisite: { ...card.prerequisite, ...patch } });
  const previewContent = {
    ...content,
    cards: [...content.cards.filter((c) => c.id !== card.id), card],
  };
  const issues = validateCard(card, previewContent);
  async function save() {
    setSaving(true);
    try {
      await onSave(saveCard(content, card, meta, originalId));
      setMessage(
        "Card saved to the working draft. Existing matches and saved versions are unchanged.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  }
  async function artwork(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      ) ||
      file.size > 2 * 1024 * 1024
    ) {
      setMessage("Choose a PNG, JPEG, WebP or GIF image no larger than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setMeta((m) => ({ ...m, artwork: String(reader.result) }));
    reader.readAsDataURL(file);
  }
  return (
    <div className="card-editor-layout">
      <div>
        <div className="studio-section-title">
          <h2>{originalId ? "Edit card" : "Create a card"}</h2>
          <button
            className="primary"
            disabled={saving || issues.some((i) => i.severity === "error")}
            onClick={save}
          >
            {saving ? "Saving…" : "Save card"}
          </button>
        </div>
        {message && (
          <p className="studio-message" role="status">
            {message}
          </p>
        )}
        <div className="studio-grid two">
          <Field label="Stable card identifier">
            <input
              value={card.id}
              disabled={!!originalId}
              placeholder="e.g. moss-sentinel"
              onChange={(e) => update({ id: e.target.value })}
            />
          </Field>
          <Field label="Card name">
            <input
              value={card.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <Field label="Card collection">
            <select
              value={card.kindred}
              onChange={(e) => update({ kindred: e.target.value })}
            >
              {content.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Creature classifications (comma separated)">
            <input
              defaultValue={card.tags.join(", ")}
              onChange={(e) => update({ tags: split(e.target.value) })}
            />
          </Field>
          <NumberField
            label="Base power"
            min={1}
            max={100}
            value={card.power}
            onChange={(power) => update({ power })}
          />
          <NumberField
            label="Placement rank"
            min={1}
            max={3}
            value={card.rank}
            onChange={(rank) => update({ rank: rank as 1 | 2 | 3 })}
          />
          <Field label="Placement type">
            <select
              value={card.type}
              onChange={(e) =>
                update({ type: e.target.value as CardDefinition["type"] })
              }
            >
              <option value="standard">Standard</option>
              <option value="replacement">Replacement</option>
              <option value="evolution">Evolution</option>
            </select>
          </Field>
          <Field label="Standard copy override">
            <input
              type="number"
              min={1}
              max={50}
              value={card.maxCopies ?? ""}
              placeholder="Ruleset default"
              onChange={(e) =>
                update({
                  maxCopies: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </Field>
          <Field label="Development status">
            <select
              value={meta.status}
              onChange={(e) =>
                setMeta({
                  ...meta,
                  status: e.target.value as CardMetadata["status"],
                })
              }
            >
              {["draft", "provisional", "approved", "archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Visual identifier">
            <input
              value={card.glyph}
              onChange={(e) => update({ glyph: e.target.value })}
            />
          </Field>
          <Field label="Rarity metadata (no gameplay effect)">
            <input
              value={meta.rarity}
              onChange={(e) => setMeta({ ...meta, rarity: e.target.value })}
            />
          </Field>
          <Field label="Local artwork (optional, up to 2 MB)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => void artwork(e.target.files?.[0])}
            />
          </Field>
        </div>
        {meta.artwork && (
          <button
            type="button"
            onClick={() => setMeta({ ...meta, artwork: "" })}
          >
            Remove artwork reference
          </button>
        )}
        <Field label="Supplementary card description (not executable rules)">
          <textarea
            value={card.text}
            onChange={(e) => update({ text: e.target.value })}
          />
        </Field>
        <Field label="Design description">
          <textarea
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
          />
        </Field>
        <Field label="Flavor text (not executable)">
          <textarea
            value={meta.flavor}
            onChange={(e) => setMeta({ ...meta, flavor: e.target.value })}
          />
        </Field>
        <Field label="Development and balancing notes">
          <textarea
            value={meta.notes}
            onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
          />
        </Field>
        <div className="studio-grid two">
          {(["destruction", "weakening"] as const).map((p) => (
            <label key={p} className="studio-check">
              <input
                type="checkbox"
                checked={card.protections?.includes(p) ?? false}
                onChange={(e) =>
                  update({
                    protections: e.target.checked
                      ? [...(card.protections ?? []), p]
                      : (card.protections ?? []).filter((x) => x !== p),
                  })
                }
              />
              Base protection: {p}
            </label>
          ))}
        </div>
        {card.type !== "standard" && (
          <section className="studio-subpanel">
            <h3>Placement prerequisites</h3>
            <p>
              Named predecessors are alternatives; classifications are
              alternatives. Different prerequisite categories must all match.
              Replacement can leave all categories blank.
            </p>
            <Field label="Acceptable named predecessors">
              <select
                multiple
                value={card.prerequisite?.definitions ?? []}
                onChange={(e) =>
                  prereq({
                    definitions: [...e.target.selectedOptions].map(
                      (o) => o.value,
                    ).length
                      ? [...e.target.selectedOptions].map((o) => o.value)
                      : undefined,
                  })
                }
              >
                {content.cards
                  .filter((c) => c.id !== card.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.kindred})
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Predecessor classifications (comma separated)">
              <input
                defaultValue={card.prerequisite?.tags?.join(", ") ?? ""}
                onChange={(e) =>
                  prereq({
                    tags: split(e.target.value).length
                      ? split(e.target.value)
                      : undefined,
                  })
                }
              />
            </Field>
            <Field label="Minimum predecessor current power">
              <input
                type="number"
                min={0}
                max={100}
                value={card.prerequisite?.minPower ?? ""}
                onChange={(e) =>
                  prereq({
                    minPower: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </Field>
            <button
              type="button"
              onClick={() => update({ prerequisite: undefined })}
            >
              Clear prerequisites
            </button>
          </section>
        )}
        <InfluenceEditor
          value={card.influence}
          onChange={(influence) => update({ influence })}
        />
        <AbilityBuilder
          abilities={card.abilities}
          onChange={(abilities) => update({ abilities })}
          cards={previewContent.cards}
          cardId={card.id}
        />
        <Issues issues={issues} />
        <button
          className="primary"
          disabled={saving || issues.some((i) => i.severity === "error")}
          onClick={save}
        >
          Save card
        </button>
      </div>
      <aside>
        <h3>Live executable preview</h3>
        <CardPreview
          card={card}
          content={previewContent}
          artwork={meta.artwork}
        />
        <p>
          Stable identifiers do not change when display names change. Save
          commits a draft only; activation requires a valid saved testing
          version.
        </p>
      </aside>
    </div>
  );
}
