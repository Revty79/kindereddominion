import { useState } from "react";
import type { Collection, ContentPack } from "../content/types";
import { ID } from "../content/validation";
import { TRIGGERS } from "../engine/registry";
import { EvolutionGraph, Field, NumberField } from "./components";
export default function Collections({
  content,
  onSave,
  onDeck,
}: {
  content: ContentPack;
  onSave: (pack: ContentPack) => Promise<void>;
  onDeck: (id: string) => void;
}) {
  const [selected, setSelected] = useState(content.collections[0]?.id ?? "");
  const [draft, setDraft] = useState<Collection | null>(null);
  const [message, setMessage] = useState("");
  const c = draft ?? content.collections.find((c) => c.id === selected);
  const cards = content.cards.filter((card) => card.kindred === c?.id);
  const isNew = selected === "";
  const update = (patch: Partial<Collection>) =>
    c && setDraft({ ...c, ...patch });
  async function save() {
    if (!c) return;
    try {
      if (
        !ID.test(c.id) ||
        !c.name.trim() ||
        !/^#[0-9a-fA-F]{6}$/.test(c.color) ||
        c.target < 1
      )
        throw new Error(
          "Provide a stable identifier, name, hex color and positive target.",
        );
      if (isNew && content.collections.some((k) => k.id === c.id))
        throw new Error("Collection identifier already exists.");
      await onSave({
        ...content,
        collections: content.collections.some((k) => k.id === c.id)
          ? content.collections.map((k) => (k.id === c.id ? c : k))
          : [...content.collections, c],
      });
      setSelected(c.id);
      setDraft(null);
      setMessage(
        "Collection saved. Card references retain the stable collection identifier.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  return (
    <section>
      <div className="studio-section-title">
        <h2>Collection manager</h2>
        <button
          onClick={() => {
            setSelected("");
            setDraft({
              id: "",
              name: "",
              description: "",
              color: "#8cbaa2",
              glyph: "◇",
              target: 30,
            });
          }}
        >
          Create collection
        </button>
      </div>
      <p>
        Collections organize design content, independently from commercial
        ownership. Original V1.1 definitions remain provisional.
      </p>
      <Field label="Select collection">
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setDraft(null);
          }}
        >
          <option value="">New collection</option>
          {content.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {c && (
        <>
          <div className="studio-grid three">
            <Field label="Collection identifier">
              <input
                disabled={!!selected}
                value={c.id}
                onChange={(e) => update({ id: e.target.value })}
              />
            </Field>
            <Field label="Collection display name">
              <input
                value={c.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>
            <Field label="Collection color">
              <input
                type="color"
                value={c.color}
                onChange={(e) => update({ color: e.target.value })}
              />
            </Field>
            <Field label="Collection visual identifier">
              <input
                value={c.glyph}
                onChange={(e) => update({ glyph: e.target.value })}
              />
            </Field>
            <NumberField
              label="Planned unique card target"
              min={1}
              max={1000}
              value={c.target}
              onChange={(target) => update({ target })}
            />
          </div>
          <Field label="Collection description">
            <textarea
              value={c.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <button className="primary" onClick={save}>
            Save collection
          </button>
          {message && <p role="status">{message}</p>}
          <div className="studio-metrics">
            <div>
              <b>
                {cards.length} / {c.target}
              </b>
              <span>Authored definitions</span>
            </div>
            <div>
              <b>
                {
                  cards.filter(
                    (card) => content.metadata[card.id]?.status === "approved",
                  ).length
                }{" "}
                / {c.target}
              </b>
              <span>Approved commercial candidates</span>
            </div>
            <div>
              <b>
                {
                  cards.filter(
                    (card) =>
                      content.metadata[card.id]?.status === "provisional",
                  ).length
                }
              </b>
              <span>Provisional development cards</span>
            </div>
          </div>
          <div className="studio-grid three">
            <section className="studio-subpanel">
              <h3>Standard ranks</h3>
              {[1, 2, 3].map((rank) => (
                <p key={rank}>
                  Rank {rank}:{" "}
                  {
                    cards.filter(
                      (c) => c.type === "standard" && c.rank === rank,
                    ).length
                  }
                </p>
              ))}
            </section>
            <section className="studio-subpanel">
              <h3>Placement types</h3>
              {["standard", "replacement", "evolution"].map((type) => (
                <p key={type}>
                  {type}: {cards.filter((c) => c.type === type).length}
                </p>
              ))}
            </section>
            <section className="studio-subpanel">
              <h3>Ability distributions</h3>
              {Object.entries(TRIGGERS).map(([id, name]) => (
                <p key={id}>
                  {name}:{" "}
                  {
                    cards.filter((c) =>
                      c.abilities.some((a) => a.trigger === id),
                    ).length
                  }
                </p>
              ))}
            </section>
          </div>
          {selected && (
            <>
              <Field label="Assign a card to this collection">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value)
                      void onSave({
                        ...content,
                        cards: content.cards.map((card) =>
                          card.id === e.target.value
                            ? { ...card, kindred: selected }
                            : card,
                        ),
                      });
                  }}
                >
                  <option value="">Choose a card to assign</option>
                  {content.cards
                    .filter((card) => card.kindred !== selected)
                    .map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name} ({card.kindred})
                      </option>
                    ))}
                </select>
              </Field>
              <button onClick={() => onDeck(selected)}>
                Create recommended test deck
              </button>
              <EvolutionGraph content={content} collection={selected} />
            </>
          )}
        </>
      )}
    </section>
  );
}
