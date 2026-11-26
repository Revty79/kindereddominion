import { useState } from "react";
import type { CardDefinition } from "../engine/types";
import type { CardMetadata, ContentPack, Workspace } from "../content/types";
import { defaultMetadata } from "../content/baseline";
import { duplicateCard } from "../content/operations";
import { validatePack } from "../content/validation";
import { ADVANCED_MECHANICS, EFFECTS, TRIGGERS } from "../engine/registry";
import Library from "./Library";
import CardEditor from "./CardEditor";
import Collections from "./Collections";
import Decks from "./Decks";
import Rules from "./Rules";
import Sandbox from "./Sandbox";
import Simulator from "./Simulator";
import Replay from "./Replay";
import Versions from "./Versions";
import "./studio.css";
const sections = [
  "Overview",
  "Card Library",
  "Card Editor",
  "Collection Manager",
  "Deck Builder and Tester",
  "Battlefield Sandbox",
  "Tactical Ruleset Editor",
  "Match Simulator",
  "Match Replay and Diagnostics",
  "Content Versions and Backups",
];
export default function Studio({
  workspace,
  onChange,
  onRecovery,
  onExit,
}: {
  workspace: Workspace;
  onChange: (fn: (w: Workspace) => Workspace) => Promise<void>;
  onRecovery: (w: Workspace) => Promise<void>;
  onExit: () => void;
}) {
  const [section, setSection] = useState("Overview"),
    [editor, setEditor] = useState<{
      card?: CardDefinition;
      metadata?: CardMetadata;
      originalId: string | null;
      key: number;
    }>({ originalId: null, key: 0 }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [deckId, setDeckId] = useState<string | undefined>();
  const content = workspace.working;
  const save = async (pack: ContentPack) => {
    await onChange((w) => ({ ...w, working: pack }));
  };
  function edit(id: string) {
    setEditor({
      card: structuredClone(content.cards.find((c) => c.id === id)),
      metadata: structuredClone(content.metadata[id] ?? defaultMetadata()),
      originalId: id,
      key: Date.now(),
    });
    setSection("Card Editor");
  }
  function create() {
    setEditor({ originalId: null, key: Date.now() });
    setSection("Card Editor");
  }
  function duplicate(id: string) {
    let suffix = 1;
    let newId = `${id}-copy`;
    while (content.cards.some((c) => c.id === newId))
      newId = `${id}-copy-${++suffix}`;
    const { card, metadata } = duplicateCard(content, id, newId);
    setEditor({ card, metadata, originalId: null, key: Date.now() });
    setSection("Card Editor");
  }
  async function recommended(collection: string) {
    const cards = content.cards
      .filter(
        (c) =>
          c.kindred === collection &&
          content.metadata[c.id]?.status !== "archived",
      )
      .sort(
        (a, b) =>
          Number(b.type === "standard" && b.rank === 1) -
            Number(a.type === "standard" && a.rank === 1) || a.rank - b.rank,
      )
      .slice(0, 15)
      .map((c) => c.id);
    const id = `deck-${Date.now().toString(36)}`;
    await save({
      ...content,
      decks: [
        ...content.decks,
        {
          id,
          name: `${collection} recommended draft`,
          subtitle: "Owner recommended deck",
          strategy: "Single-collection recommendation",
          collection,
          cards,
        },
      ],
    });
    setDeckId(id);
    setSection("Deck Builder and Tester");
  }
  const issues = validatePack(content);
  return (
    <div className="studio">
      <header className="studio-header">
        <div>
          <span className="eyebrow">KINDRED DOMINION / V1.3B/C</span>
          <h1>Developer Studio</h1>
        </div>
        <div>
          <span>Local content revision {workspace.revision}</span>
          <button disabled={busy} onClick={onExit}>
            Return to game
          </button>
        </div>
      </header>
      <div className="studio-layout">
        <nav aria-label="Developer Studio sections">
          {sections.map((name) => (
            <button
              key={name}
              className={section === name ? "selected" : ""}
              disabled={busy && section !== name}
              onClick={() => {
                setSection(name);
                setMessage("");
              }}
            >
              {name}
            </button>
          ))}
          <p>
            Working draft: {content.cards.length} cards
            <br />
            Active version:{" "}
            {
              workspace.versions.find((v) => v.id === workspace.activeVersion)
                ?.name
            }
            <br />
            Simulation runs lock navigation until completion or cancellation.
          </p>
        </nav>
        <main className="studio-main">
          {message && (
            <p role="status" className="studio-message">
              {message}
            </p>
          )}
          {section === "Overview" && (
            <>
              <h2>A workspace for game design</h2>
              <p>
                Create content, build repeatable scenarios, inspect actual
                engine behavior and compare reproducible simulations. Draft
                editing is separate from ordinary play.
              </p>
              <div className="studio-metrics">
                <div>
                  <b>{content.cards.length}</b>
                  <span>Working card definitions</span>
                </div>
                <div>
                  <b>{content.collections.length}</b>
                  <span>Collections</span>
                </div>
                <div>
                  <b>{content.decks.length}</b>
                  <span>Named test decks</span>
                </div>
                <div>
                  <b>{workspace.scenarios.length}</b>
                  <span>Saved scenarios</span>
                </div>
                <div>
                  <b>{workspace.replays.length}</b>
                  <span>Immutable match records</span>
                </div>
                <div>
                  <b>{issues.filter((i) => i.severity === "error").length}</b>
                  <span>Blocking content errors</span>
                </div>
              </div>
              <div className="studio-grid two">
                <section className="studio-subpanel">
                  <h3>Start an experiment</h3>
                  <ol>
                    <li>
                      Create or duplicate a card, then save its working draft.
                    </li>
                    <li>
                      Use Battlefield Sandbox to construct a valid scenario.
                    </li>
                    <li>
                      Execute a legal action and open the resolution inspector.
                    </li>
                    <li>Save a named checkpoint before larger experiments.</li>
                    <li>
                      Run test decks in Match Simulator and export results.
                    </li>
                    <li>
                      Activate a valid saved testing version only when you want
                      new ordinary matches to use it.
                    </li>
                  </ol>
                  <button className="primary" onClick={create}>
                    Create your first draft card
                  </button>
                </section>
                <section className="studio-subpanel">
                  <h3>Supported mechanics registry</h3>
                  <p>{Object.values(ADVANCED_MECHANICS).join(" · ")}</p>
                  <p>
                    The V1.3A mechanics laboratory and 30 ready-made scenarios
                    are separate from your working draft and both Founding
                    libraries. Read docs/MASTER-CARD-MECHANICS.md for exact
                    behavior.
                  </p>
                  <p>{Object.values(TRIGGERS).join(" · ")}</p>
                  <p>
                    {Object.values(EFFECTS)
                      .map((e) => e.name)
                      .join(" · ")}
                  </p>
                  <p>
                    Timed poison, arbitrary scripts, interactive ability target
                    selection and additional scoring systems are future
                    candidates. Nature can use immediate weakening to represent
                    venom without inventing an ongoing poison status.
                  </p>
                </section>
              </div>
              <section className="studio-subpanel">
                <h3>Preservation and backups</h3>
                <p>
                  Original V1.1 content is an immutable saved version. Local
                  artwork and content live in IndexedDB. Download a complete
                  backup outside browser storage, especially before importing or
                  restoring content.
                </p>
                <button
                  onClick={() => setSection("Content Versions and Backups")}
                >
                  Open content versions & backups
                </button>
              </section>
            </>
          )}
          {section === "Card Library" && (
            <Library
              content={content}
              onNew={create}
              onEdit={edit}
              onDuplicate={duplicate}
              onArchive={(id) =>
                void save({
                  ...content,
                  metadata: {
                    ...content.metadata,
                    [id]: { ...content.metadata[id], status: "archived" },
                  },
                })
                  .then(() =>
                    setMessage(
                      "Card archived in the working draft. Referenced definitions remain available.",
                    ),
                  )
                  .catch((e) => setMessage(String(e)))
              }
            />
          )}
          {section === "Card Editor" && (
            <CardEditor
              key={editor.key}
              content={content}
              initial={editor.card}
              initialMeta={editor.metadata}
              originalId={editor.originalId}
              onSave={async (pack) => {
                await save(pack);
                const current =
                  pack.cards.find(
                    (c) => !content.cards.some((old) => old.id === c.id),
                  ) ?? pack.cards.find((c) => c.id === editor.originalId);
                if (current)
                  setEditor({
                    ...editor,
                    card: current,
                    metadata: pack.metadata[current.id],
                    originalId: current.id,
                  });
              }}
            />
          )}
          {section === "Collection Manager" && (
            <Collections
              content={content}
              onSave={save}
              onDeck={(id) =>
                void recommended(id).catch((e) => setMessage(String(e)))
              }
            />
          )}
          {section === "Deck Builder and Tester" && (
            <Decks
              key={deckId ?? "decks"}
              initialId={deckId}
              content={content}
              onSave={save}
            />
          )}
          {section === "Battlefield Sandbox" && (
            <Sandbox
              workspace={workspace}
              onSave={(scenario) =>
                onChange((w) => ({
                  ...w,
                  scenarios: w.scenarios.some((s) => s.id === scenario.id)
                    ? w.scenarios.map((s) =>
                        s.id === scenario.id ? scenario : s,
                      )
                    : [...w.scenarios, scenario],
                }))
              }
              onReplay={(record) =>
                onChange((w) => ({
                  ...w,
                  replays: w.replays.some((r) => r.id === record.id)
                    ? w.replays.map((r) => (r.id === record.id ? record : r))
                    : [...w.replays, record],
                }))
              }
            />
          )}
          {section === "Tactical Ruleset Editor" && (
            <Rules content={content} onSave={save} />
          )}
          {section === "Match Simulator" && (
            <Simulator
              workspace={workspace}
              onBusy={setBusy}
              onReport={(report) =>
                onChange((w) => ({
                  ...w,
                  reports: w.reports.some((r) => r.id === report.id)
                    ? w.reports.map((r) => (r.id === report.id ? report : r))
                    : [...w.reports, report],
                  replays: [
                    ...w.replays,
                    ...report.examples.flatMap((e) =>
                      e.replay && !w.replays.some((r) => r.id === e.replay!.id)
                        ? [e.replay]
                        : [],
                    ),
                  ],
                }))
              }
            />
          )}
          {section === "Match Replay and Diagnostics" && (
            <Replay records={workspace.replays} />
          )}
          {section === "Content Versions and Backups" && (
            <Versions
              workspace={workspace}
              onChange={onChange}
              onRecovery={onRecovery}
            />
          )}
        </main>
      </div>
    </div>
  );
}
