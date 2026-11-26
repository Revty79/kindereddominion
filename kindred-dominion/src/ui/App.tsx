import { useEffect, useMemo, useState } from "react";
import {
  act,
  coordinate,
  createMatch,
  legalPlays,
  placementError,
  relative,
  rematch,
  validateDeck,
} from "../engine/game";
import { battlefield, DEFAULT_CONFIG } from "../engine/config";
import { currentPower, SCORING_RULES, scoreGame } from "../engine/scoring";
import { chooseComputerAction, computerMulligan } from "../engine/ai";
import { KINDRED_COLORS } from "../data/cards";
import type { ContentPack } from "../content/types";
import { libraryOf } from "../content/validation";
import { newRecord, appendRecord } from "../replay/record";
import type { MatchRecord } from "../replay/record";
import Artwork from "./Artwork";
import PowerDetails, { ScoreDetails } from "./PowerDetails";
import ExecutableRules from "./ExecutableRules";
import CollectionFilters from "./CollectionFilters";
import { emptyCollectionFilter, filterCollection } from "./collection";
import { actionPreview, presentationFrames, publicEventText, readPresentationPreferences, savePresentationPreferences } from "./readability";
import type { PresentationFrame } from "./readability";
import type { DiagnosticStep } from "../engine/types";
import { artworkMap } from "../assets/references";
import type {
  Action,
  CardDefinition,
  GameState,
  Kindred,
  Player,
  Position,
} from "../engine/types";
import {
  clearSession,
  readCustomDecks,
  readSession,
  saveCustomDecks,
  saveSession,
} from "./storage";
import type { Session } from "./storage";

const names = ["Jade", "Amber"];
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const rank = (value: number) => ["I", "II", "III"][value - 1] ?? String(value);
function Crest() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 17 23 28 32 11 41 28 54 17 47 46H17Z M21 54H43 M32 24V43" />
    </svg>
  );
}
export function CardFace({
  card,
  compact = false,
  artwork,
}: {
  card: CardDefinition;
  compact?: boolean;
  artwork?: string;
}) {
  return (
    <div
      className={`card-face ${compact ? "compact" : ""}`}
      style={
        { "--kindred": KINDRED_COLORS[card.kindred] } as React.CSSProperties
      }
    >
      <div className="card-top">
        {card.collectible && <span className="collectible-number">{card.collectible.number}</span>}
        <span>
          {card.type === "standard"
            ? `RANK ${rank(card.rank)}`
            : card.type.toUpperCase()}
        </span>
        <strong>
          {card.power}
          <small>PWR</small>
        </strong>
      </div>
      {artwork ? (
        <Artwork
          className="card-artwork"
          src={artwork}
          alt={`${card.name} artwork`}
        />
      ) : (
        <div className="sigil" aria-hidden="true">
          <span>{card.glyph}</span>
          {card.collectible && <small>Artwork pending</small>}
        </div>
      )}
      <div className="card-caption">
        <small>{card.kindred}</small>
        <strong>{card.name}</strong>
      </div>
      {!compact && <p>{card.text}</p>}
    </div>
  );
}
function Pattern({
  card,
  player = 0,
}: {
  card: CardDefinition;
  player?: Player;
}) {
  return (
    <div className="pattern-wrap">
      <div
        className="pattern"
        aria-label={`Influence pattern, facing ${player === 0 ? "right" : "left"}`}
      >
        {Array.from({ length: 25 }, (_, i) => {
          const y = Math.floor(i / 5) - 2;
          const x = ((i % 5) - 2) * (player === 0 ? 1 : -1);
          const effects = card.influence.filter((e) => e.x === x && e.y === y);
          return (
            <span
              key={i}
              className={`${x === 0 && y === 0 ? "origin" : ""} ${effects[0]?.mechanic ?? ""}`}
              title={effects.map((e) => `${e.mechanic} ${e.amount}`).join(", ")}
            >
              {effects.length
                ? effects
                    .map((e) => `${e.mechanic === "fortification" ? "G" : e.mechanic[0].toUpperCase()}${e.amount}`)
                    .join(" ")
                : x === 0 && y === 0
                  ? "◆"
                  : ""}
            </span>
          );
        })}
      </div>
      <small>
        E · expansion
        <br />G · fortification
        <br />O · overthrow
      </small>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const elements = [
          ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button, [role="dialog"] select, [role="dialog"] input, [role="dialog"] [tabindex="0"]',
          ),
        ].filter((el) => !el.hasAttribute("disabled"));
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    document.querySelector<HTMLElement>('[role="dialog"] button')?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-shade" onClick={close}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-top">
          <h2>{title}</h2>
          <button onClick={close} aria-label={`Close ${title}`}>
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export default function App({
  content,
  onOpenStudio,
  onRecord,
}: {
  content: ContentPack;
  onOpenStudio?: () => void;
  onRecord?: (record: MatchRecord) => Promise<void>;
}) {
  const activeLibrary = useMemo(() => libraryOf(content), [content]);
  const DECKS = useMemo(
    () => content.decks.filter((d) => d.cards.length === 15),
    [content],
  );
  const [session, setSession] = useState<Session | null>(null);
  const CARDS = session?.library ?? activeLibrary;
  const contentArtwork = useMemo(() => artworkMap(content), [content]);
  const artwork = session?.artwork ?? contentArtwork;
  const CARD_LIST = useMemo(() => Object.values(CARDS), [CARDS]);
  const KINDREDS = content.collections.map((c) => c.id);
  const [saved, setSaved] = useState(readSession);
  const [scoring, setScoring] = useState("classic");
  const [mode, setMode] = useState<"standard" | "free">("standard");
  const [opponent, setOpponent] = useState<"computer" | "local">("computer");
  const [deckIds, setDeckIds] = useState<[string, string]>([
    DECKS[0].id,
    (DECKS[1] ?? DECKS[0]).id,
  ]);
  const [custom, setCustom] = useState(() =>
    readCustomDecks(activeLibrary, content.id),
  );
  const [editor, setEditor] = useState<Player | null>(null);
  const [collection, setCollection] = useState<Kindred | "mixed">("mixed");
  const [size, setSize] = useState("3x5");
  const [seedInput, setSeedInput] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Position | null>(null);
  const [hovered, setHovered] = useState<Position | null>(null);
  const [mulligan, setMulligan] = useState<string[]>([]);
  const [curtain, setCurtain] = useState(true);
  const [inspect, setInspect] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [grave, setGrave] = useState<Player | null>(null);
  const [help, setHelp] = useState(false);
  const [confirm, setConfirm] = useState<"surrender" | "restart" | null>(null);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Kindred | "all">("all");
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState(emptyCollectionFilter);
  const [preferences, setPreferences] = useState(readPresentationPreferences);
  const [playback, setPlayback] = useState<{ frames: PresentationFrame[]; index: number; source: string } | null>(null);
  const game = session?.game;
  const frame = playback?.frames[playback.index];
  const field = game ? frame?.state ?? game : undefined;
  const viewer: Player =
    game?.phase === "mulligan"
      ? !game.players[0].mulliganDone
        ? 0
        : 1
      : (game?.active ?? 0);
  const isComputer =
    !!session &&
    session.opponent === "computer" &&
    viewer === 1 &&
    (game?.phase === "playing" || game?.phase === "mulligan");
  const hidden = !!game && (curtain || isComputer || !!playback);
  const legal = useMemo(() => (game ? legalPlays(game, CARDS) : []), [game]);
  const cardDef =
    selected && game ? CARDS[game.cards[selected].definitionId] : null;
  const score = field ? scoreGame(field, CARDS) : null;
  const prospective = useMemo(
    () =>
      game &&
      pending &&
      selected &&
      !placementError(
        game,
        CARDS,
        game.active,
        selected,
        pending.row,
        pending.col,
      )
        ? actionPreview(
            game,
            { type: "play", player: game.active, card: selected, ...pending },
            CARDS,
          )
        : null,
    [game, pending, selected],
  );
  const previewChanges = prospective?.changes ?? [];
  const [rows, cols] = size.split("x").map(Number);
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    scoring,
    mode,
    collection,
    battlefield: battlefield(rows, cols),
  };
  const getDeck = (p: Player) =>
    deckIds[p] === "custom"
      ? custom[p]
      : DECKS.find((d) => d.id === deckIds[p])!.cards;
  const deckName = (p: Player) =>
    deckIds[p] === "custom"
      ? "Custom deck"
      : DECKS.find((d) => d.id === deckIds[p])!.name;
  const deckErrors = [0, 1].flatMap((p) =>
    validateDeck(getDeck(p as Player), CARDS, config).map(
      (e) => `${names[p]}: ${e}`,
    ),
  );

  useEffect(() => {
    if (!session) return;
    if (!saveSession(session))
      setNotice(
        "Browser storage is unavailable. This match will last until this tab closes.",
      );
  }, [session]);
  useEffect(() => {
    if (playback || !curtain || !game || !["playing", "mulligan"].includes(game.phase))
      return;
    const button = document.querySelector<HTMLButtonElement>(
      ".privacy-curtain button",
    );
    button?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        button?.focus();
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => document.removeEventListener("keydown", trap, true);
  }, [curtain, game?.phase, viewer, !!playback]);
  useEffect(() => { savePresentationPreferences(preferences); }, [preferences]);
  useEffect(() => {
    if (!playback || inspect) return;
    if (preferences.speed === "skip") { setPlayback(null); return; }
    if (preferences.speed === "step") return;
    const delay = { fast: 140, normal: 450, slow: 1000 }[preferences.speed];
    const timer = window.setTimeout(() => setPlayback(p => p && (p.index + 1 < p.frames.length ? { ...p, index: p.index + 1 } : null)), delay);
    return () => clearTimeout(timer);
  }, [playback, preferences.speed, inspect]);
  useEffect(() => {
    if (!game || !session || !isComputer || playback) return;
    const timer = window.setTimeout(() => {
      try {
        const action: Action =
          game.phase === "mulligan"
            ? {
                type: "mulligan",
                player: 1,
                cards: computerMulligan(game, CARDS, 1),
              }
            : chooseComputerAction(game, CARDS);
        const steps: DiagnosticStep[] = [];
        const next = act(game, action, CARDS, action.type === "play" ? { captureStates: true, onStep: s => steps.push(s) } : undefined);
        update(next, action, steps);
      } catch (error) {
        setNotice(String(error));
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [game, isComputer, !!playback]);
  function update(next: GameState, action?: Action, steps: DiagnosticStep[] = []) {
    if (!session) return;
    const record = action
      ? appendRecord(
          session.record ??
            newRecord(
              session.game,
              CARDS,
              session.decks,
              session.contentVersion ?? "v1.1-baseline",
              `Recovered match from turn ${session.game.turn}`,
            ),
          action,
          next,
        )
      : newRecord(
          next,
          CARDS,
          session.decks,
          session.contentVersion ?? content.id,
        );
    record.artwork ??= session.artwork ?? artwork;
    setSession({ ...session, game: next, record });
    if (action?.type === "play" && preferences.speed !== "skip" && !next.fault) {
      setPlayback({ frames: presentationFrames(session.game, next, steps, CARDS), index: 0, source: CARDS[session.game.cards[action.card].definitionId].name });
    } else setPlayback(null);
    if (next.phase === "finished" && onRecord)
      void onRecord(record).catch((e) =>
        setNotice(`Replay save failed: ${String(e)}`),
      );
    setSelected(null);
    setPending(null);
    setHovered(null);
    setMulligan([]);
    setCurtain(
      session.opponent === "local" &&
        ["playing", "mulligan"].includes(next.phase),
    );
    setNotice("");
  }
  function dispatch(action: Action) {
    if (!game) return;
    try {
      const steps: DiagnosticStep[] = [];
      const next = act(game, action, CARDS, action.type === "play" ? { captureStates: true, onStep: s => steps.push(s) } : undefined);
      update(next, action, steps);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }
  function start() {
    try {
      const decks: [string[], string[]] = [
        getDeck(0).slice(),
        getDeck(1).slice(),
      ];
      const next = createMatch(
        decks,
        CARDS,
        config,
        seedInput ? Number(seedInput) : seed(),
      );
      setSession({
        schema: 1,
        game: next,
        decks,
        opponent,
        deckNames: [deckName(0), deckName(1)],
        library: structuredClone(CARDS),
        contentVersion: content.id,
        artwork: structuredClone(artwork),
        record: newRecord(next, CARDS, decks, content.id),
      });
      setCurtain(opponent === "local");
      setNotice("");
    } catch (error) {
      setNotice(String(error));
    }
  }
  function doRematch() {
    if (!session) return;
    update(rematch(session.game, session.decks, CARDS, seed()));
    setCurtain(session.opponent === "local");
  }
  function leaveMatch() {
    setPlayback(null);
    setInspect(null);
    setSaved(session);
    setSession(null);
    setConfirm(null);
    setSelected(null);
    setPending(null);
    setCurtain(true);
  }
  function editDeck(p: Player, id: string, add: boolean) {
    const next: [string[], string[]] = [custom[0].slice(), custom[1].slice()];
    if (add && next[p].length < 15) next[p].push(id);
    if (!add) {
      const i = next[p].lastIndexOf(id);
      if (i >= 0) next[p].splice(i, 1);
    }
    setCustom(next);
    if (!saveCustomDecks(next, content.id))
      setNotice("Custom deck could not be saved to browser storage.");
  }
  const filtered = filterCollection(CARD_LIST, filter, query, collectionFilter);
  const influenceOrigin = pending ?? hovered;
  const influenceTargets =
    cardDef && influenceOrigin && game
      ? cardDef.influence.map((e) => ({
          ...relative(influenceOrigin, e.x, e.y, game.active),
          ...e,
        }))
      : [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (session) setConfirm("restart");
          }}
        >
          <Crest />
          <span>
            Kindred <strong>Dominion</strong>
          </span>
        </a>
        <div className="header-right">
          <span className="version">
            {content.id === "v1.1-baseline"
              ? "V1.1 · PLAYABLE FOUNDATION"
              : "V1.3D · EARLY TESTING"}
          </span>
          <button className="quiet" onClick={() => setLibrary(true)}>
            Card library
          </button>
          <button className="quiet" onClick={() => setHelp(true)}>
            How to play
          </button>
          <button className="quiet" onClick={() => window.dispatchEvent(new Event("kindred-open-account"))}>Player account</button>
        </div>
      </header>
      {!session&&<p className="practice-boundary">Local practice · unrestricted test cards and browser-local saves. Open Player account for your permanent collection, saved decks and server-validated matches.</p>}
      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss notice">
            ✕
          </button>
        </div>
      )}
      <details className="learning-options">
        <summary>Learning and action playback</summary>
        <label>Presentation speed<select aria-label="Presentation speed" value={preferences.speed} onChange={e => setPreferences({ ...preferences, speed: e.target.value as typeof preferences.speed })}><option value="fast">Fast</option><option value="normal">Normal</option><option value="slow">Slow</option><option value="step">Step through</option><option value="skip">Instant</option></select></label>
        <label><input type="checkbox" checked={preferences.beginner} onChange={e => setPreferences({ ...preferences, beginner: e.target.checked })} /> Beginner explanations</label>
        <p>Playback shows recorded battlefield steps. The rules and final result stay the same at every speed.</p>
      </details>
      {!session ? (
        <main className="setup">
          <section className="intro">
            <div className="eyebrow">
              <span /> A TACTICAL CARD GAME
            </div>
            <h1>
              Every position.
              <br />
              <em>A possibility.</em>
            </h1>
            <p>
              Grow your territory. Gather your kindred.
              <br />
              Claim the rows that decide your dominion.
            </p>
            <div className="intro-board" aria-hidden="true">
              {Array.from({ length: 15 }, (_, i) => (
                <div
                  key={i}
                  className={i % 5 === 0 ? "jade" : i % 5 === 4 ? "amber" : ""}
                >
                  {[0, 5, 10, 4, 9, 14].includes(i) ? "◆" : i === 7 ? "✦" : ""}
                </div>
              ))}
            </div>
            <div className="foundation-note">
              <span>LOCAL. OFFLINE. YOUR FIELD.</span>
              <p>
                {content.cards.length} provisional cards ·{" "}
                {content.collections.length} collections
                <br />
                One shared screen or a computer opponent.
              </p>
            </div>
          </section>
          <section className="setup-panel">
            <div className="section-top">
              <div>
                <div className="eyebrow">THE NEXT ENCOUNTER</div>
                <h2>Prepare the battlefield</h2>
              </div>
              <span className="tiny-crest">◇</span>
            </div>
            {saved && (
              <div className="resume">
                <div>
                  <strong>Return to your field</strong>
                  <small>
                    {SCORING_RULES[saved.game.config.scoring]?.name} · Turn{" "}
                    {saved.game.turn} · {saved.game.phase}
                  </small>
                </div>
                <button
                  onClick={() => {
                    setSession(saved);
                    setCurtain(saved.opponent === "local");
                  }}
                >
                  Continue saved match
                </button>
                <button
                  className="quiet"
                  aria-label="Discard saved match"
                  onClick={() => {
                    clearSession();
                    setSaved(null);
                  }}
                >
                  ✕
                </button>
              </div>
            )}
            <fieldset>
              <legend>01 / Tactical ruleset</legend>
              <div className="choice-grid">
                {Object.entries(SCORING_RULES).map(([id, rule]) => (
                  <button
                    key={id}
                    className={`choice ${scoring === id ? "chosen" : ""}`}
                    aria-pressed={scoring === id}
                    onClick={() => setScoring(id)}
                  >
                    <span className="choice-symbol">
                      {id === "classic" ? "☷" : "▦"}
                    </span>
                    <strong>{rule.name}</strong>
                    <small>{rule.description}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>02 / Your opponent</legend>
              <div className="segmented">
                <button
                  aria-pressed={opponent === "computer"}
                  onClick={() => setOpponent("computer")}
                >
                  Computer
                </button>
                <button
                  aria-pressed={opponent === "local"}
                  onClick={() => setOpponent("local")}
                >
                  Local two-player
                </button>
              </div>
              <p className="field-hint">
                {opponent === "computer"
                  ? "A local tactical opponent. No connection or account needed."
                  : "Private handoffs keep each player’s hand concealed."}
              </p>
            </fieldset>
            <fieldset>
              <legend>03 / Choose your kindred</legend>
              {([0, 1] as const).map((p) => (
                <div className={`deck-pick player-${p}`} key={p}>
                  <span className="player-marker">{p + 1}</span>
                  <label>
                    <strong>
                      {names[p]}{" "}
                      {p === 1 && opponent === "computer"
                        ? "· Computer"
                        : `· Player ${p + 1}`}
                    </strong>
                    <select
                      aria-label={`${names[p]} deck`}
                      value={deckIds[p]}
                      onChange={(e) =>
                        setDeckIds((prev) =>
                          p === 0
                            ? [e.target.value, prev[1]]
                            : [prev[0], e.target.value],
                        )
                      }
                    >
                      {DECKS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                      <option value="custom">
                        Custom deck ({custom[p].length}/15)
                      </option>
                    </select>
                    <small>
                      {DECKS.find((d) => d.id === deckIds[p])?.subtitle ??
                        "Your own selection from the development library"}
                    </small>
                  </label>
                  <button
                    className="quiet"
                    onClick={() => {
                      setEditor(p);
                      setFilter("all");
                      setQuery("");
                    }}
                  >
                    Build deck
                  </button>
                </div>
              ))}
            </fieldset>
            <details className="advanced">
              <summary>Play format & battlefield options</summary>
              <div className="advanced-fields">
                <label>
                  Play format
                  <select
                    aria-label="Play format"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as typeof mode)}
                  >
                    <option value="standard">
                      Standard Play · default 2 copies
                    </option>
                    <option value="free">
                      Unrestricted Free Play · up to 15
                    </option>
                  </select>
                </label>
                <label>
                  Deck collection
                  <select
                    aria-label="Deck collection"
                    value={collection}
                    onChange={(e) =>
                      setCollection(e.target.value as typeof collection)
                    }
                  >
                    <option value="mixed">Mixed collections</option>
                    {KINDREDS.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Battlefield
                  <select
                    aria-label="Battlefield"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                  >
                    {["3x5", "3x6", "4x5", "4x6", "4x8"].map((s) => (
                      <option key={s} value={s}>
                        {s.replace("x", " × ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Match seed (optional)
                  <input
                    type="number"
                    min="0"
                    max="4294967295"
                    value={seedInput}
                    onChange={(e) => setSeedInput(e.target.value)}
                    placeholder="Random"
                  />
                </label>
              </div>
              <p className="field-hint">
                Standard normally allows two copies. Overrides: {CARD_LIST.filter(c => c.maxCopies && c.maxCopies !== 2).map(c => `${c.name} (${c.maxCopies})`).join(", ") || "none"}. Free Play allows up to 15 copies and keeps all effect safeguards active.{" "}
                {content.id === "v1.1-baseline"
                  ? "A single kindred has only six test cards; use Free Play to build a 15-card single-collection deck."
                  : "The complete Founding Kindreds support Standard Play pure decks. Use a supplied starting deck or build your own."}
              </p>
            </details>
            {deckErrors.length > 0 && (
              <div className="validation" role="status">
                {deckErrors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            <button
              className="primary start"
              disabled={
                !!deckErrors.length ||
                (seedInput !== "" &&
                  (!Number.isInteger(Number(seedInput)) ||
                    Number(seedInput) < 0 ||
                    Number(seedInput) > 4294967295))
              }
              onClick={start}
            >
              Begin match <span>✦</span>
            </button>
            <p className="setup-foot">
              15-card decks · 5-card opening hands · One optional mulligan
            </p>
            {import.meta.env.VITE_STUDIO !== "0" && onOpenStudio && (
              <button
                className="start quiet"
                style={{ marginTop: "1rem" }}
                onClick={onOpenStudio}
              >
                Developer Studio
              </button>
            )}
            {content.id !== "v1.1-baseline" && (
              <p className="setup-foot">
                {content.name} · All cards freely available for testing. Statistics and names are provisional; final artwork is pending.
              </p>
            )}
          </section>
        </main>
      ) : (
        game && field &&
        score && (
          <main
            className={`match ${game.config.battlefield.cols > 5 ? "wide-field" : ""}`}
          >
            <div className="match-heading">
              <div>
                <div className="eyebrow">
                  {SCORING_RULES[game.config.scoring].name.toUpperCase()} /{" "}
                  {game.config.mode === "standard"
                    ? "STANDARD PLAY"
                    : "FREE PLAY"}
                </div>
                <h1>
                  {playback ? `Resolving ${playback.source}.` : game.phase === "mulligan"
                    ? "Choose your opening."
                    : game.phase === "finished"
                      ? "The field is decided."
                      : game.phase === "fault"
                        ? "Resolution halted."
                        : `${names[game.active]} to command.`}
                </h1>
              </div>
              <div className="match-meta">
                <span>
                  TURN <strong>{game.turn.toString().padStart(2, "0")}</strong>
                </span>
                <span className="seed">SEED {game.seed}</span>
                <button className="quiet" onClick={() => setConfirm("restart")}>
                  Match menu
                </button>
              </div>
            </div>
            <div className="play-layout">
              <section className="field-panel">
                <div className="scoreboard">
                  {([0, 1] as const).map((p) => (
                    <div
                      key={p}
                      className={`player-score player-${p} ${game.active === p && game.phase === "playing" ? "active" : ""}`}
                    >
                      <span className="player-marker">{p + 1}</span>
                      <div>
                        <strong>
                          {names[p]}{" "}
                          <small>
                            {p === 1 && session.opponent === "computer"
                              ? "COMPUTER"
                              : `PLAYER ${p + 1}`}
                          </small>
                        </strong>
                        <span>{session.deckNames[p]}</span>
                        <div className="zone-counts">
                          <span>Draw {game.players[p].draw.length}</span>
                          <span>Hand {game.players[p].hand.length}</span>
                          <button onClick={() => setGrave(p)}>
                            Graveyard {game.players[p].graveyard.length}
                          </button>
                        </div>
                        {score.breakdown && <small className="points-components">Rows {score.breakdown.ordinary[p]} · Creatures {score.breakdown.tactical[p]} · Card bonuses {score.breakdown.bonuses[p]}</small>}
                      </div>
                      <b className="total">
                        {score.totals[p]}
                        <small>POINTS</small>
                      </b>
                    </div>
                  ))}
                </div>
                <div className="board-caption">
                  <span>THE BATTLEFIELD</span>
                  <span>
                    {selected
                      ? "Select an illuminated position to preview"
                      : "Win a row to score its surviving power"}
                  </span>
                </div>
                {playback && frame && <section className="action-playback" aria-label="Action resolution playback" aria-live="polite">
                  <strong>{playback.source} · step {playback.index + 1} / {playback.frames.length}</strong>
                  <p>{frame.caption}</p>
                  <button onClick={() => setPlayback(p => p && (p.index + 1 < p.frames.length ? { ...p, index: p.index + 1 } : null))}>Next resolution step</button>
                  <button onClick={() => setPlayback(null)}>Skip presentation</button>
                </section>}
                <ScoreDetails state={field} library={CARDS} />
                <div className="board-scroll">
                  <div
                    className="board"
                    style={
                      {
                        "--cols": game.config.battlefield.cols,
                      } as React.CSSProperties
                    }
                  >
                    <div className="column-labels">
                      {Array.from(
                        { length: game.config.battlefield.cols },
                        (_, i) => (
                          <span key={i}>{i + 1}</span>
                        ),
                      )}
                    </div>
                    <div className="board-rows">
                      {Array.from(
                        { length: game.config.battlefield.rows },
                        (_, row) => (
                          <div className="board-row" key={row}>
                            <span className="row-label">
                              {String.fromCharCode(65 + row)}
                            </span>
                            {field.board
                              .filter((c) => c.row === row)
                              .map((cell) => {
                                const id = cell.creature;
                                const definition = id
                                  ? CARDS[field.cards[id].definitionId]
                                  : null;
                                const isLegal =
                                  !!selected &&
                                  legal.some(
                                    (a) =>
                                      a.card === selected &&
                                      a.row === cell.row &&
                                      a.col === cell.col,
                                  );
                                const target =
                                  pending?.row === cell.row &&
                                  pending?.col === cell.col;
                                const influences = influenceTargets.filter(
                                  (e) =>
                                    e.row === cell.row && e.col === cell.col,
                                );
                                const marks = (frame?.changes ?? previewChanges).filter(c => c.row === cell.row && c.col === cell.col);
                                return (
                                  <button
                                    key={cell.col}
                                    className={`cell ${cell.owner === null ? "neutral" : `player-${cell.owner}`} ${isLegal && !hidden ? "legal" : ""} ${target ? "targeted" : ""} ${marks.length ? "affected-cell" : ""}`}
                                    aria-label={`${coordinate(cell)}: ${cell.owner === null ? "neutral" : names[cell.owner]}, ${cell.tokens} tokens, ${cell.fortification} fortification${definition ? `, ${definition.name}, ${currentPower(field, CARDS, id!)} power` : ", empty"}${isLegal && !hidden ? ", legal placement" : ""}`}
                                    data-testid={`cell-${cell.row}-${cell.col}`}
                                    onMouseEnter={() => setHovered(cell)}
                                    onMouseLeave={() => setHovered(null)}
                                    onClick={() => {
                                      if (playback) { if (id) setInspect(id); return; }
                                      if (hidden || game.phase !== "playing") {
                                        if (id && !curtain) setInspect(id);
                                        return;
                                      }
                                      if (isLegal)
                                        setPending({
                                          row: cell.row,
                                          col: cell.col,
                                        });
                                      else if (selected)
                                        setNotice(
                                          placementError(
                                            game,
                                            CARDS,
                                            game.active,
                                            selected,
                                            cell.row,
                                            cell.col,
                                          ) ?? "",
                                        );
                                      else if (id) setInspect(id);
                                    }}
                                  >
                                    <span className="cell-top">
                                      <small className="territory-owner">{cell.owner === null ? "Neutral" : names[cell.owner]}</small>
                                      <span
                                        className="tokens"
                                        aria-hidden="true"
                                      >
                                        {Array.from(
                                          {
                                            length:
                                              game.config.battlefield.maxTokens,
                                          },
                                          (_, i) => (
                                            <i
                                              key={i}
                                              className={
                                                i < cell.tokens ? "filled" : ""
                                              }
                                            />
                                          ),
                                        )}
                                      </span>
                                      <span
                                        className="fortification"
                                        title="Fortification"
                                      >
                                        {`⬡ ${cell.fortification}`}
                                      </span>
                                    </span>
                                    {definition ? (
                                      <>
                                        {artwork[definition.id] ? (
                                          <Artwork
                                            className="creature-artwork"
                                            src={artwork[definition.id]}
                                            alt={`${definition.name} artwork`}
                                          />
                                        ) : (
                                          <span
                                            className="creature-glyph"
                                            style={{
                                              color:
                                                KINDRED_COLORS[
                                                  definition.kindred
                                                ],
                                            }}
                                            aria-hidden="true"
                                          >
                                            {definition.glyph}
                                          </span>
                                        )}
                                        <span className="creature-name">
                                          {definition.name}
                                        </span>
                                        <span className="power">
                                          {currentPower(field, CARDS, id!)}
                                          <small>effective · printed {definition.power}</small>
                                        </span>
                                        {field.cards[id!].stack.length > 0 && (
                                          <span className="stack-count">
                                            {field.cards[id!].stack.length + 1}{" "}
                                            forms
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span
                                        className="empty-mark"
                                        aria-hidden="true"
                                      >
                                        {isLegal && !hidden ? "＋" : "·"}
                                      </span>
                                    )}
                                    {!!influences.length && !hidden && (
                                      <span className="influence-badge">
                                        {influences
                                          .map(
                                            (e) =>
                                              `${e.mechanic === "fortification" ? "G" : e.mechanic[0].toUpperCase()}${e.amount}`,
                                          )
                                          .join(" ")}
                                      </span>
                                    )}
                                    {!!marks.length && <span className="consequence-marks" aria-label={marks.map(m => m.text).join(" ")}>{[...new Set(marks.map(m => m.label))].slice(0, 4).map(label => <b key={label}>{label}</b>)}</span>}
                                  </button>
                                );
                              })}
                            <div
                              className="row-score"
                              aria-label={`Row ${String.fromCharCode(65 + row)}: Jade ${score.rows[row].powers[0]}, Amber ${score.rows[row].powers[1]}`}
                            >
                              <span
                                className={
                                  score.rows[row].points[0]
                                    ? "winning jade-text"
                                    : ""
                                }
                              >
                                <small>Jade power</small>
                                {score.rows[row].powers[0]}
                              </span>
                              <small>
                                ROW{" "}
                                {score.rows[row].powers[0] ===
                                score.rows[row].powers[1]
                                  ? "TIED"
                                  : score.rows[row].powers[0] >
                                      score.rows[row].powers[1]
                                    ? "JADE"
                                    : "AMBER"}
                              </small>
                              <span
                                className={
                                  score.rows[row].points[1]
                                    ? "winning amber-text"
                                    : ""
                                }
                              >
                                <small>Amber power</small>
                                {score.rows[row].powers[1]}
                              </span>
                              <small className="row-awarded">Points {score.rows[row].points[0]} / {score.rows[row].points[1]}</small>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                    {game.config.scoring === "domination" && (
                      <div className="column-counts">
                        {score.columns.map((c, i) => (
                          <span
                            key={i}
                            aria-label={`Column ${i + 1}: Jade ${c[0]}, Amber ${c[1]} creatures`}
                          >
                            <b className="jade-text">{c[0]}</b>
                            <small>CREATURES</small>
                            <b className="amber-text">{c[1]}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="board-legend">
                  <span>
                    <i className="legend-token" /> Placement tokens
                  </span>
                  <span>⬡ Fortification</span>
                  <span>◆ Ownership persists after destruction</span>
                </div>
                <section className="hand-section">
                  <div className="section-top">
                    <div>
                      <span className="eyebrow">
                        {game.phase === "mulligan"
                          ? "OPENING HAND"
                          : `${names[viewer].toUpperCase()} / YOUR HAND`}
                      </span>
                      <p>
                        {game.phase === "mulligan"
                          ? "Choose up to five cards to exchange, or keep them all."
                          : hidden
                            ? "Private cards are concealed."
                            : legal.length
                              ? "Choose a card, then a legal territory."
                              : "No legal placements. Confirm a forced pass to continue."}
                      </p>
                    </div>
                    {game.phase === "mulligan" && !hidden && (
                      <button
                        className="primary"
                        onClick={() =>
                          dispatch({
                            type: "mulligan",
                            player: viewer,
                            cards: mulligan,
                          })
                        }
                      >
                        {mulligan.length
                          ? `Exchange ${mulligan.length} card${mulligan.length === 1 ? "" : "s"}`
                          : "Keep hand"}
                      </button>
                    )}
                  </div>
                  {hidden ? (
                    <div
                      className="concealed-hand"
                      aria-label="Private hand concealed"
                    >
                      {Array.from({ length: 5 }, (_, i) => (
                        <div className="card-back" key={i}>
                          <Crest />
                        </div>
                      ))}
                    </div>
                  ) : ["mulligan", "playing"].includes(game.phase) ? (
                    <div className="hand">
                      {game.players[viewer].hand.map((id) => {
                        const c = CARDS[game.cards[id].definitionId];
                        const playable = legal.some((a) => a.card === id);
                        const chosen =
                          game.phase === "mulligan"
                            ? mulligan.includes(id)
                            : selected === id;
                        return (
                          <button
                            key={id}
                            className={`hand-card ${chosen ? "selected" : ""} ${game.phase === "playing" && !playable ? "unplayable" : ""}`}
                            aria-pressed={chosen}
                            aria-label={`${c.name}, ${c.type}, rank ${rank(c.rank)}, ${c.power} power${game.phase === "mulligan" ? (chosen ? ", exchange" : ", keep") : playable ? ", playable" : ", no legal positions"}`}
                            onClick={() => {
                              if (game.phase === "mulligan")
                                setMulligan((prev) =>
                                  prev.includes(id)
                                    ? prev.filter((c) => c !== id)
                                    : [...prev, id],
                                );
                              else {
                                setSelected(selected === id ? null : id);
                                setPending(null);
                              }
                            }}
                          >
                            <CardFace
                              card={c}
                              compact
                              artwork={artwork[c.id]}
                            />
                            {game.phase === "playing" && <span className={`playability ${playable ? "ready" : "blocked"}`}>{playable ? `✓ ${legal.filter(a => a.card === id).length} legal positions` : c.type === "evolution" ? "Needs an eligible predecessor" : c.type === "replacement" ? "Needs an eligible friendly creature" : `Needs empty friendly rank ${rank(c.rank)} territory`}</span>}
                            {game.phase === "mulligan" && chosen && (
                              <span className="exchange-tag">EXCHANGE</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="finished-hand">
                      {game.phase === "finished"
                        ? "All effects resolved. Final scores are shown above."
                        : "The development log contains the fault details."}
                    </div>
                  )}
                </section>
                <div className="turn-controls">
                  <span>
                    {game.passes === 1
                      ? "One consecutive pass. Another pass ends this match."
                      : "One placement per turn. Passing leaves you in the match."}
                  </span>
                  {game.phase === "playing" && (
                    <>
                      <button
                        disabled={hidden}
                        onClick={() =>
                          dispatch({ type: "pass", player: game.active })
                        }
                      >
                        {legal.length ? "Pass turn" : "Confirm forced pass"}
                      </button>
                      <button
                        className="quiet danger"
                        disabled={hidden}
                        onClick={() => setConfirm("surrender")}
                      >
                        Surrender
                      </button>
                    </>
                  )}
                </div>
              </section>
              <aside className="tactical-panel">
                <div className="tactical-title">
                  <span className="eyebrow">TACTICAL VIEW</span>
                  <span>◇</span>
                </div>
                {cardDef && !hidden ? (
                  <>
                    <CardFace card={cardDef} artwork={artwork[cardDef.id]} />
                    <Pattern card={cardDef} player={game.active} />
                    <button
                      className="quiet inspect-button"
                      onClick={() => setInspect(selected)}
                    >
                      Inspect card & instance
                    </button>
                    {pending && prospective ? (
                      <div className="resolution-preview">
                        <div className="eyebrow">
                          PREVIEW / {coordinate(pending)}
                        </div>
                        <p className="preview-score">Immediate points: Jade {prospective.scoreBefore.totals[0]} → {prospective.scoreAfter.totals[0]} · Amber {prospective.scoreBefore.totals[1]} → {prospective.scoreAfter.totals[1]}</p>
                        <p>Immediate resolution, in order:</p>
                        <ol className="public-consequences">{previewChanges.map((change, i) => <li key={i}><b>{change.label}</b> {change.text}</li>)}</ol>
                        {preferences.beginner && <p>{prospective.privateConsequencesOmitted ? "This preview stops before a private draw. Remaining effects resolve after confirmation." : "This shows immediate battlefield effects. Turn-end, turn-start and private draws resolve after confirmation."}</p>}
                        {prospective.fault ? (
                          <p className="error-text">{prospective.fault}</p>
                        ) : (
                          <button
                            className="primary"
                            onClick={() =>
                              dispatch({
                                type: "play",
                                player: game.active,
                                card: selected!,
                                ...pending,
                              })
                            }
                          >
                            Place at {coordinate(pending)}
                          </button>
                        )}
                        <button
                          className="quiet"
                          onClick={() => setPending(null)}
                        >
                          Cancel preview
                        </button>
                      </div>
                    ) : (
                      <p className="tactical-hint">
                        {legal.some((a) => a.card === selected)
                          ? "Select an illuminated territory. You can review the full effect chain before placement."
                          : "No legal territory for this card. You may need more tokens or a matching predecessor."}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="tactical-empty">
                    <Crest />
                    <h3>
                      {isComputer
                        ? "Amber is considering the field."
                        : game.phase === "mulligan"
                          ? "A good beginning."
                          : "Make your position."}
                    </h3>
                    <p>
                      {game.phase === "mulligan"
                        ? "Replacements are drawn before rejected instances return to your deck. There is no penalty."
                        : "Select a card to inspect its influence, abilities and legal placements."}
                    </p>
                    <div className="rule-note">
                      <strong>{SCORING_RULES[game.config.scoring].name}</strong>
                      <p>{SCORING_RULES[game.config.scoring].description}</p>
                    </div>
                  </div>
                )}
              </aside>
            </div>
            <details className="battlefield-legend"><summary>Battlefield symbols</summary><p>◆ Placement tokens · E Expansion · ⬡ G Fortification · O Overthrow · + Enhancement · − Weakening · DEST Destruction · SAC Sacrifice · REPLACE Replacement · EVO Evolution · REVIVE Resurrection · SHIELD Protection · ≈ Continuous effect · ★ Card bonus</p></details>
            <details className="event-log">
              <summary>
                <span>Match event log</span>
                <small>{game.events.length} EVENTS · newest first</small>
              </summary>
              <div className="log-entries" tabIndex={0}>
                {game.events
                  .slice()
                  .reverse()
                  .map((e) => (
                    <div
                      key={e.id}
                      className={`log-entry ${e.type === "fault" ? "error-text" : ""}`}
                    >
                      <small>
                        T{e.turn} / {e.id.toString().padStart(3, "0")}
                      </small>
                      <span
                        className={`log-type ${e.player === 0 ? "jade-text" : e.player === 1 ? "amber-text" : ""}`}
                      >
                        {e.type}
                      </span>
                      <p>{publicEventText(e)}</p>
                    </div>
                  ))}
              </div>
              {import.meta.env.VITE_STUDIO !== "0" && onOpenStudio && <button
                className="quiet"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(game, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `kindred-dominion-${game.seed}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export development record (includes both hands)
              </button>}
            </details>
            {curtain && !playback && ["mulligan", "playing"].includes(game.phase) && (
              <div
                className="privacy-curtain"
                role="dialog"
                aria-modal="true"
                aria-label="Private player handoff"
              >
                <Crest />
                <span className="eyebrow">PRIVATE HANDOFF</span>
                <h2>Pass the screen to {names[viewer]}.</h2>
                <p>
                  Only Player {viewer + 1} should continue.
                  <br />
                  Your hand will be revealed when you are ready.
                </p>
                <button className="primary" onClick={() => setCurtain(false)}>
                  I’m {names[viewer]} — reveal my hand
                </button>
              </div>
            )}
            {game.phase === "finished" && game.result && (
              <section className="result-banner" role="status">
                <div>
                  <div className="eyebrow">
                    MATCH COMPLETE / {game.result.reason.toUpperCase()}
                  </div>
                  <h2>
                    {game.result.winner === null
                      ? "An equal dominion."
                      : `${names[game.result.winner]} claims dominion.`}
                  </h2>
                  <p>
                    {game.result.scores[0]} — {game.result.scores[1]}
                    {game.result.winner === null ? " · Draw" : ""}
                  </p>
                  <small>
                    Next match: {names[game.startingPlayer === 0 ? 1 : 0]}{" "}
                    starts.
                  </small>
                </div>
                <div>
                  <button className="primary" onClick={doRematch}>
                    Rematch
                  </button>
                  <button onClick={leaveMatch}>New match setup</button>
                </div>
              </section>
            )}
            {game.phase === "fault" && (
              <div className="fault-panel" role="alert">
                <h2>Match halted without a result</h2>
                <p>{game.fault}</p>
                <p>
                  Export the development record above to preserve the diagnostic
                  state.
                </p>
                <button onClick={leaveMatch}>Return to setup</button>
              </div>
            )}
          </main>
        )
      )}
      <footer className="app-footer">
        <span>
          KINDRED DOMINION <b>✦</b> 0.5.0
        </span>
        <span>
          Development cards. A foundation to play, question and refine.
        </span>
      </footer>
      {inspect && (
        <Modal title="Card details" close={() => setInspect(null)}>
          {(() => {
            const instance = field?.cards[inspect];
            const c = CARDS[instance?.definitionId ?? inspect];
            return c ? (
              <div className="detail-layout">
                <CardFace card={c} artwork={artwork[c.id]} />
                <div>
                  <Pattern card={c} player={instance?.owner ?? 0} />
                  <p>{c.text}</p>
                  {(field?.mechanics ||
                    c.continuous?.length ||
                    c.scaling?.length ||
                    c.scoring?.length ||
                    content.engineVersion === "1.3.0") && (
                    <ExecutableRules card={c} />
                  )}
                  {instance && (
                    <PowerDetails
                      state={field!}
                      library={CARDS}
                      id={instance.id}
                    />
                  )}
                  <dl>
                    <dt>Placement</dt>
                    <dd>
                      {c.type} · rank {rank(c.rank)}
                    </dd>
                    <dt>Classification</dt>
                    <dd>{c.tags.join(", ")}</dd>
                    <dt>Standard copy limit</dt>
                    <dd>{c.maxCopies ?? 2}</dd>
                    {c.prerequisite && (
                      <>
                        <dt>Prerequisites</dt>
                        <dd>
                          {c.prerequisite.definitions
                            ?.map((id) => CARDS[id].name)
                            .join(" or ")}
                          {c.prerequisite.tags?.join(" or ")}
                          {c.prerequisite.minPower !== undefined
                            ? `At least ${c.prerequisite.minPower} current power`
                            : ""}
                        </dd>
                      </>
                    )}
                    {instance && (
                      <>
                        <dt>Instance / lineage</dt>
                        <dd>
                          {instance.id} / {instance.lineage}
                        </dd>
                        <dt>Location / current power</dt>
                        <dd>
                          {instance.location} /{" "}
                          {currentPower(game!, CARDS, instance.id)}
                        </dd>
                        <dt>Resurrections</dt>
                        <dd>
                          {field!.lineages[instance.lineage].resurrections} in
                          this lineage
                        </dd>
                        <dt>Protection</dt>
                        <dd>
                          {[
                            ...new Set([
                              ...instance.statuses,
                              ...(c.protections ?? []),
                            ]),
                          ].join(", ") || "None"}
                        </dd>
                        <dt>Evolution stack</dt>
                        <dd>
                          {instance.stack
                            .map(
                              (id) => CARDS[field!.cards[id].definitionId].name,
                            )
                            .join(" → ") || "None"}
                        </dd>
                      </>
                    )}
                  </dl>
                  <small className="field-hint">
                    Provisional development definition · not a commercial card
                  </small>
                </div>
              </div>
            ) : null;
          })()}
        </Modal>
      )}
      {(library || editor !== null) && (
        <Modal
          title={
            editor !== null
              ? `${names[editor]} · Deck builder`
              : "The Founding Kindreds"
          }
          close={() => {
            setLibrary(false);
            setEditor(null);
          }}
        >
          <p className="modal-intro">
            {CARD_LIST.length} provisional cards. Unrestricted testing access; no commercial ownership or purchases.
            every duplicate remains a separate instance during play.
          </p>
          {editor !== null && (
            <div className="builder-bar">
              <strong>{custom[editor].length} / 15 cards</strong>
              <button
                className="quiet"
                onClick={() => {
                  const next: [string[], string[]] = [
                    custom[0].slice(),
                    custom[1].slice(),
                  ];
                  next[editor] = getDeck(editor).slice();
                  setCustom(next);
                  saveCustomDecks(next, content.id);
                }}
              >
                Copy selected deck
              </button>
              <button
                className="primary"
                onClick={() => {
                  setDeckIds((prev) =>
                    editor === 0 ? ["custom", prev[1]] : [prev[0], "custom"],
                  );
                  setEditor(null);
                }}
              >
                Use this deck
              </button>
            </div>
          )}
          <div className="library-filters">
            <label>
              Kindred
              <select
                aria-label="Kindred"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">All five collections</option>
                {KINDREDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Search cards
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Number, name, classification or effect"
              />
            </label>
          </div>
          <CollectionFilters cards={CARD_LIST} value={collectionFilter} onChange={setCollectionFilter} />
          {editor !== null && (
            <div className="builder-validation">
              {validateDeck(custom[editor], CARDS, config).map((e) => (
                <p key={e}>{e}</p>
              ))}
              {!validateDeck(custom[editor], CARDS, config).length && (
                <p>
                  Legal {mode === "free" ? "Free Play" : "Standard Play"} deck.
                </p>
              )}
            </div>
          )}
          <div className="library-grid">
            {filtered.map((c) => (
              <article key={c.id}>
                <CardFace card={c} artwork={artwork[c.id]} />
                <Pattern card={c} />
                <div className="catalog-details">
                  <strong>{c.collectible?.number ?? "Historical unnumbered card"} · {c.type} · rank {rank(c.rank)} · printed {c.power}</strong>
                  <span>{c.tags.join(" · ")}</span>
                  {c.collectible && <span>Set {c.collectible.setId} · Expansion {c.collectible.expansionId} · Edition {c.collectible.edition}</span>}
                  {c.prerequisite?.definitions && <span>Requires {c.prerequisite.definitions.map(id => `${CARDS[id].collectible?.number ?? id} ${CARDS[id].name}`).join(" or ")}</span>}
                </div>
                {editor !== null ? (
                  <div className="copy-control">
                    <button
                      aria-label={`Remove ${c.name}`}
                      disabled={!custom[editor].includes(c.id)}
                      onClick={() => editDeck(editor, c.id, false)}
                    >
                      −
                    </button>
                    <b>
                      {custom[editor].filter((id) => id === c.id).length} copies
                    </b>
                    <button
                      aria-label={`Add ${c.name}`}
                      disabled={custom[editor].length >= 15}
                      onClick={() => editDeck(editor, c.id, true)}
                    >
                      ＋
                    </button>
                  </div>
                ) : (
                  <small className="copy-note">
                    Standard limit {c.maxCopies ?? 2} · Free Play limit 15
                  </small>
                )}
              </article>
            ))}
          </div>
          {!filtered.length && <p>No cards match this search.</p>}
        </Modal>
      )}
      {grave !== null && game && (
        <Modal
          title={`${names[grave]} · Graveyard & exile`}
          close={() => setGrave(null)}
        >
          {(["graveyard", "exile"] as const).map((zone) => (
            <section key={zone}>
              <h3>
                {zone === "graveyard" ? "Graveyard" : "Exile"} ·{" "}
                {game.players[grave][zone].length}
              </h3>
              <div className="zone-list">
                {game.players[grave][zone].map((id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setInspect(id);
                      setGrave(null);
                    }}
                  >
                    <span
                      style={{
                        color:
                          KINDRED_COLORS[
                            CARDS[game.cards[id].definitionId].kindred
                          ],
                      }}
                    >
                      {CARDS[game.cards[id].definitionId].glyph}
                    </span>
                    <strong>{CARDS[game.cards[id].definitionId].name}</strong>
                    <small>
                      {id} · lineage {game.cards[id].lineage}
                    </small>
                  </button>
                ))}
                {!game.players[grave][zone].length && <p>No cards here.</p>}
              </div>
            </section>
          ))}
        </Modal>
      )}
      {help && (
        <Modal title="How to play" close={() => setHelp(false)}>
          <div className="help-copy">
            <h3>Early tester notes</h3>
            <p>Local practice makes all 150 owner-designed cards freely available for testing. Its browser saves belong to this device, browser and address. Player account stores your owned collection, decks and validated computer matches on the configured server across browsers. Statistics and names remain provisional, and final artwork is pending. Purchases and online human-versus-human play are not enabled.</p>
            <p>To report feedback, send the owner the match seed, scoring mode, card numbers, a screenshot, and what you expected compared with what happened, using your usual external communication channel.</p>
            <p>
              Build from your edge of the field. Jade faces right; Amber faces
              left. “Above” and “below” stay the same for both players.
            </p>
            <h3>One card. A changing field.</h3>
            <p>
              Place a standard creature on empty friendly territory with enough
              placement tokens for its rank. Tokens and fortification remain
              after placement. Select a card, then an illuminated position,
              review its effects and confirm.
            </p>
            <p>
              Expansion claims neutral territory or reinforces friendly tokens.
              Against unoccupied enemy territory, each influence point removes
              one fortification first; a further point is needed to capture.
              Overthrow immediately captures unoccupied enemy territory.
              Occupied enemy positions resist territorial influence.
            </p>
            <h3>Make room. Become more.</h3>
            <p>
              Replacement sacrifices a friendly creature, places the
              replacement, then resolves sacrifice abilities before the new
              influence. Evolution needs an eligible predecessor, keeps
              modifiers and restrictions, and puts prior forms in a stack. It
              causes no death event.
            </p>
            <h3>Claim the rows.</h3>
            <p>
              Classic awards full row power to the player winning that row; ties
              award zero. Domination adds one point per surviving creature. Two
              consecutive passes end the match. You may play again after
              passing. Full boards and empty draw piles do not end matches.
            </p>
            <h3>A private beginning.</h3>
            <p>
              Each player draws five, with one optional mulligan. Choose zero to
              five cards; their replacements are drawn before rejected instances
              return to the deck. Neither player draws on their first turn.
            </p>
            <h3>Development assumptions</h3>
            <p>
              Death, return and resurrection retain that instance’s modifiers
              and restrictions. Nonpositive power is lethal, even after
              resurrection. Returning an evolved creature returns all its forms
              to hand; banishment exiles all forms. Resurrected
              placement/evolution abilities are suppressed unless explicitly
              allowed. Resurrection and simultaneous triggers use top-to-bottom,
              left-to-right coordinate order, with active-player triggers first.
            </p>
            <p>
              Matches and deck drafts save in this browser when storage is
              available. Private handoffs conceal cards on screen; the local
              save and development export include both hands. Storage is not an
              account or encrypted secret store.
            </p>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm === "surrender" ? "Surrender this match?" : "Match menu"
          }
          close={() => setConfirm(null)}
        >
          {confirm === "surrender" ? (
            <>
              <p>Your opponent will win immediately.</p>
              <button
                className="primary"
                onClick={() => {
                  dispatch({ type: "surrender", player: game!.active });
                  setConfirm(null);
                }}
              >
                Confirm surrender
              </button>
            </>
          ) : (
            <>
              <p>
                Your match is saved in this browser. Continue playing, begin a
                rematch with the other starting player, or return to setup.
              </p>
              <div className="menu-actions">
                <button className="primary" onClick={() => setConfirm(null)}>
                  Continue playing
                </button>
                <button
                  onClick={() => {
                    doRematch();
                    setConfirm(null);
                  }}
                >
                  Restart as rematch
                </button>
                <button onClick={leaveMatch}>Return to setup</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
