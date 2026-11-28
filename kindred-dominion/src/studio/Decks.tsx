import { useState } from "react";
import type { ContentPack, TestDeck } from "../content/types";
import { deckAnalysis } from "../content/validation";
import { Field } from "./components";
export default function Decks({
  content,
  onSave,
  initialId,
}: {
  content: ContentPack;
  onSave: (pack: ContentPack) => Promise<void>;
  initialId?: string;
}) {
  const [id, setId] = useState(initialId ?? content.decks[0]?.id ?? "");
  const [draft, setDraft] = useState<TestDeck | null>(null);
  const [ruleId, setRuleId] = useState(content.rulesets[0].id);
  const [free, setFree] = useState(false);
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState("");
  const [message, setMessage] = useState("");
  const deck = draft ?? content.decks.find((d) => d.id === id);
  const rule = content.rulesets.find((r) => r.id === ruleId)!;
  const config = {
    ...rule.config,
    mode: free ? ("free" as const) : rule.config.mode,
    collection: deck?.collection ?? "mixed",
  };
  const analysis = deck ? deckAnalysis(deck.cards, content, config) : null;
  const update = (patch: Partial<TestDeck>) =>
    deck && setDraft({ ...deck, ...patch });
  async function save() {
    if (!deck) return;
    try {
      if (!deck.id || !deck.name.trim())
        throw new Error("A stable deck identifier and name are required.");
      await onSave({
        ...content,
        decks: content.decks.some((d) => d.id === deck.id)
          ? content.decks.map((d) => (d.id === deck.id ? deck : d))
          : [...content.decks, deck],
      });
      setId(deck.id);
      setDraft(null);
      setMessage(
        "Test deck saved. Validation warnings do not prevent draft storage.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  const newDeck = () => {
    const newId = `deck-${Date.now().toString(36)}`;
    setId("");
    setDraft({
      id: newId,
      name: "New test deck",
      subtitle: "Owner test deck",
      strategy: "",
      cards: [],
      collection: "mixed",
    });
  };
  const comparison = content.decks.find((d) => d.id === compare);
  return (
    <section>
      <div className="studio-section-title">
        <h2>Deck builder & tester</h2>
        <button onClick={newDeck}>Create test deck</button>
      </div>
      <div className="studio-grid three">
        <Field label="Test deck">
          <select
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setDraft(null);
            }}
          >
            <option value="">New draft</option>
            {content.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.strategy || "Uncategorized"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Deck testing ruleset">
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            {content.rulesets.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="studio-check">
          <input
            type="checkbox"
            checked={free}
            onChange={(e) => setFree(e.target.checked)}
          />
          Unrestricted Free Play (universal safeguards remain)
        </label>
      </div>
      {deck && analysis && (
        <>
          <div className="studio-grid three">
            <Field label="Deck name">
              <input
                value={deck.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>
            <Field label="Strategy / organization">
              <input
                value={deck.strategy}
                onChange={(e) => update({ strategy: e.target.value })}
              />
            </Field>
            <Field label="Pure or mixed deck">
              <select
                value={deck.collection}
                onChange={(e) => update({ collection: e.target.value })}
              >
                <option value="mixed">Mixed collections</option>
                {content.collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    Pure {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="studio-actions">
            <button className="primary" onClick={save}>
              Save test deck
            </button>
            <button
              onClick={() => {
                setId("");
                setDraft({
                  ...structuredClone(deck),
                  id: `deck-${Date.now().toString(36)}`,
                  name: `${deck.name} copy`,
                });
              }}
            >
              Duplicate deck
            </button>
            <button onClick={() => update({ cards: [] })}>
              Clear draft deck
            </button>
          </div>
          {message && <p role="status">{message}</p>}
          <div className="studio-metrics">
            <div>
              <b>
                {deck.cards.length} / {config.deckSize}
              </b>
              <span>Cards</span>
            </div>
            <div>
              <b>{analysis.openings}</b>
              <span>Rank I opening options</span>
            </div>
            <div>
              <b>{analysis.ranks.join(" / ")}</b>
              <span>Standard ranks I / II / III</span>
            </div>
          </div>
          <div className="studio-issues">
            {analysis.errors.map((e) => (
              <p className="issue-error" key={e}>
                Error · {e}
              </p>
            ))}
            {analysis.warnings.map((e) => (
              <p className="issue-warning" key={e}>
                Advisory · {e}
              </p>
            ))}
            {!analysis.errors.length && (
              <p className="issue-info">
                Legal for the selected rules and format.
              </p>
            )}
          </div>
          <div className="studio-grid two">
            <section>
              <h3>Cards and duplicate counts</h3>
              {Object.entries(analysis.counts).map(([card, count]) => (
                <div className="deck-line" key={card}>
                  <span>
                    {content.cards.find((c) => c.id === card)?.name ?? card} ×{" "}
                    {count}
                  </span>
                  <button
                    aria-label={`Remove ${card} from test deck`}
                    onClick={() => {
                      const cards = deck.cards.slice();
                      cards.splice(cards.lastIndexOf(card), 1);
                      update({ cards });
                    }}
                  >
                    Remove one
                  </button>
                </div>
              ))}
              <h3>Ability distribution</h3>
              {analysis.abilities.map((a) => (
                <p key={a.name}>
                  {a.name}: {a.count}
                </p>
              ))}
            </section>
            <section>
              <Field label="Find cards for test deck">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
              <div className="deck-card-choices">
                {content.cards
                  .filter(
                    (c) =>
                      (deck.collection === "mixed" ||
                        c.kindred === deck.collection) &&
                      `${c.id} ${c.name}`
                        .toLowerCase()
                        .includes(query.toLowerCase()) &&
                      content.metadata[c.id]?.status !== "archived",
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      disabled={deck.cards.length >= config.deckSize}
                      onClick={() => update({ cards: [...deck.cards, c.id] })}
                      aria-label={`Add ${c.name} to test deck`}
                    >
                      {c.name} · {c.type} · R{c.rank} · P{c.power}
                    </button>
                  ))}
              </div>
            </section>
          </div>
          <section className="studio-subpanel">
            <h3>Compare deck composition</h3>
            <Field label="Compare against deck">
              <select
                value={compare}
                onChange={(e) => setCompare(e.target.value)}
              >
                <option value="">Select comparison</option>
                {content.decks
                  .filter((d) => d.id !== deck.id)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </Field>
            {comparison && (
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>{deck.name}</th>
                    <th>{comparison.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const other = deckAnalysis(comparison.cards, content, {
                      ...config,
                      collection: comparison.collection,
                    });
                    return [
                      ["Cards", deck.cards.length, comparison.cards.length],
                      ["Opening options", analysis.openings, other.openings],
                      [
                        "Rank I / II / III",
                        analysis.ranks.join(" / "),
                        other.ranks.join(" / "),
                      ],
                      [
                        "Unique definitions",
                        Object.keys(analysis.counts).length,
                        Object.keys(other.counts).length,
                      ],
                      [
                        "Replacement / evolution",
                        analysis.types
                          .slice(1)
                          .map((t) => t.count)
                          .join(" / "),
                        other.types
                          .slice(1)
                          .map((t) => t.count)
                          .join(" / "),
                      ],
                    ].map((row) => (
                      <tr key={String(row[0])}>
                        {row.map((v, i) => (
                          <td key={i}>{v}</td>
                        ))}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </section>
  );
}
