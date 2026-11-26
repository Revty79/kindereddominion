import { useMemo, useState } from "react";
import type { CardDefinition } from "../engine/types";
import type { ContentPack } from "../content/types";
import { EFFECTS, MECHANICS, TRIGGERS } from "../engine/registry";
import { CardPreview, EvolutionGraph, Field, NumberField } from "./components";
import { evolutionEdges } from "../content/validation";
import { cardArtwork } from "../assets/references";
import Artwork from "../ui/Artwork";
export default function Library({
  content,
  onEdit,
  onNew,
  onDuplicate,
  onArchive,
}: {
  content: ContentPack;
  onEdit: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [collection, setCollection] = useState(""),
    [tag, setTag] = useState(""),
    [type, setType] = useState(""),
    [rank, setRank] = useState(""),
    [trigger, setTrigger] = useState(""),
    [effect, setEffect] = useState(""),
    [mechanic, setMechanic] = useState(""),
    [status, setStatus] = useState(""),
    [related, setRelated] = useState(""),
    [min, setMin] = useState(0),
    [max, setMax] = useState(100),
    [sort, setSort] = useState("name");
  const [inspect, setInspect] = useState<string | null>(null);
  const edges = evolutionEdges(content.cards);
  const tags = [...new Set(content.cards.flatMap((c) => c.tags))].sort();
  const filtered = useMemo(
    () =>
      content.cards
        .filter(
          (c) =>
            `${c.name} ${c.id}`.toLowerCase().includes(query.toLowerCase()) &&
            (!collection || c.kindred === collection) &&
            (!tag || c.tags.includes(tag)) &&
            (!type || c.type === type) &&
            (!rank || c.rank === Number(rank)) &&
            c.power >= min &&
            c.power <= max &&
            (!trigger || c.abilities.some((a) => a.trigger === trigger)) &&
            (!effect ||
              c.abilities.some((a) =>
                a.effects.some((e) => e.type === effect),
              )) &&
            (!mechanic || c.influence.some((e) => e.mechanic === mechanic)) &&
            (!status || content.metadata[c.id]?.status === status) &&
            (!related ||
              edges.some(
                (e) =>
                  (e.from === related && e.to === c.id) ||
                  (e.to === related && e.from === c.id),
              )),
        )
        .sort((a, b) =>
          sort === "power"
            ? a.power - b.power
            : sort === "rank"
              ? a.rank - b.rank
              : sort === "kindred"
                ? a.kindred.localeCompare(b.kindred) ||
                  a.name.localeCompare(b.name)
                : sort === "id"
                  ? a.id.localeCompare(b.id)
                  : sort === "type"
                    ? a.type.localeCompare(b.type) ||
                      a.name.localeCompare(b.name)
                    : a.name.localeCompare(b.name),
        ),
    [
      content,
      query,
      collection,
      tag,
      type,
      rank,
      min,
      max,
      trigger,
      effect,
      mechanic,
      status,
      related,
      sort,
    ],
  );
  const dropdown = (
    label: string,
    value: string,
    change: (s: string) => void,
    options: { id: string; name: string }[],
  ) => (
    <Field label={label}>
      <select value={value} onChange={(e) => change(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const inspected = content.cards.find((c) => c.id === inspect);
  return (
    <section>
      <div className="studio-section-title">
        <div>
          <h2>Card library</h2>
          <p>
            {filtered.length} of {content.cards.length} definitions · working
            draft
          </p>
        </div>
        <button className="primary" onClick={onNew}>
          Create card
        </button>
      </div>
      <div className="studio-grid four">
        <Field label="Search name or identifier">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a card"
          />
        </Field>
        {dropdown(
          "Library collection",
          collection,
          setCollection,
          content.collections,
        )}
        {dropdown(
          "Classification",
          tag,
          setTag,
          tags.map((id) => ({ id, name: id })),
        )}
        {dropdown(
          "Placement filter",
          type,
          setType,
          ["standard", "replacement", "evolution"].map((id) => ({
            id,
            name: id,
          })),
        )}
        {dropdown(
          "Rank filter",
          rank,
          setRank,
          [1, 2, 3].map((n) => ({ id: String(n), name: `Rank ${n}` })),
        )}
        <NumberField
          label="Minimum power"
          min={0}
          max={100}
          value={min}
          onChange={setMin}
        />
        <NumberField
          label="Maximum power"
          min={0}
          max={100}
          value={max}
          onChange={setMax}
        />
        {dropdown(
          "Trigger filter",
          trigger,
          setTrigger,
          Object.entries(TRIGGERS).map(([id, name]) => ({ id, name })),
        )}
        {dropdown(
          "Ability effect filter",
          effect,
          setEffect,
          Object.entries(EFFECTS).map(([id, e]) => ({ id, name: e.name })),
        )}
        {dropdown(
          "Territory mechanic filter",
          mechanic,
          setMechanic,
          Object.entries(MECHANICS).map(([id, name]) => ({ id, name })),
        )}
        {dropdown(
          "Development status filter",
          status,
          setStatus,
          ["draft", "provisional", "approved", "archived"].map((id) => ({
            id,
            name: id,
          })),
        )}
        {dropdown("Evolution related to", related, setRelated, content.cards)}
        <Field label="Sort library">
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {["name", "id", "kindred", "rank", "power", "type"].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="studio-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Card / identifier</th>
              <th>Kindred</th>
              <th>Placement</th>
              <th>Rank / power</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>
                  {cardArtwork(content, c.id) && (
                    <Artwork
                      className="studio-art-thumbnail"
                      src={cardArtwork(content, c.id)!}
                      alt={`${c.name} artwork`}
                    />
                  )}
                  <button
                    className="text-button"
                    onClick={() => setInspect(c.id)}
                  >
                    {c.name}
                  </button>
                  <small>{c.id}</small>
                </td>
                <td>
                  {content.collections.find((k) => k.id === c.kindred)?.name}
                </td>
                <td>{c.type}</td>
                <td>
                  {c.rank} / {c.power}
                </td>
                <td>{content.metadata[c.id]?.status ?? "provisional"}</td>
                <td>
                  <div className="studio-actions">
                    <button
                      onClick={() => onEdit(c.id)}
                      aria-label={`Edit ${c.name}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDuplicate(c.id)}
                      aria-label={`Duplicate ${c.name}`}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => onArchive(c.id)}
                      aria-label={`Archive ${c.name}`}
                    >
                      Archive
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inspected && (
        <div className="studio-subpanel">
          <div className="studio-section-title">
            <h3>Inspect {inspected.name}</h3>
            <button onClick={() => setInspect(null)}>Close inspection</button>
          </div>
          <CardPreview
            card={inspected}
            content={content}
            artwork={content.metadata[inspected.id]?.artwork}
          />
          <details>
            <summary>Complete structured definition (read-only)</summary>
            <pre>
              {JSON.stringify(
                {
                  definition: inspected,
                  metadata: content.metadata[inspected.id],
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      )}
      <details className="studio-subpanel">
        <summary>Evolution relationship diagram</summary>
        <EvolutionGraph
          content={content}
          collection={collection || undefined}
          onCard={onEdit}
        />
      </details>
    </section>
  );
}
