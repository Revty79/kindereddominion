import { act, coordinate } from "../engine/game";
import { powerTable } from "../engine/evaluation";
import { currentPower, scoreGame } from "../engine/scoring";
import type { Action, CardLibrary, DiagnosticStep, GameEvent, GameState, Position } from "../engine/types";

export type PublicChange = Position & { kind: "territory" | "tokens" | "fortification" | "power" | "arrival" | "departure" | "protection" | "aura" | "dynamic"; label: string; text: string };
const playerName = (p: number | null) => p === null ? "neutral" : p === 0 ? "Jade" : "Amber";
const signed = (n: number) => n > 0 ? `+${n}` : String(n);
export function publicChanges(before: GameState, after: GameState, library: CardLibrary): PublicChange[] {
  const result: PublicChange[] = [];
  const oldPower = powerTable(before, library), newPower = powerTable(after, library);
  for (const cell of after.board) {
    const previous = before.board.find(c => c.row === cell.row && c.col === cell.col)!;
    const add = (kind: PublicChange["kind"], label: string, text: string) => result.push({ row: cell.row, col: cell.col, kind, label, text: `${coordinate(cell)} · ${text}` });
    if (cell.owner !== previous.owner) add("territory", "CAP", `${playerName(cell.owner)} claims ${previous.owner === null ? "neutral territory" : `${playerName(previous.owner)} territory`}.`);
    if (cell.tokens !== previous.tokens) add("tokens", `◆ ${signed(cell.tokens - previous.tokens)}`, `Placement tokens ${previous.tokens} → ${cell.tokens}.`);
    if (cell.fortification !== previous.fortification) add("fortification", `⬡ ${signed(cell.fortification - previous.fortification)}`, `Fortification ${previous.fortification} → ${cell.fortification}.`);
    const prior = previous.creature, incoming = cell.creature;
    if (prior && prior !== incoming) {
      const instance = after.cards[prior], name = library[before.cards[prior].definitionId].name;
      const kind = instance?.location === "stack" ? "EVO" : instance?.location === "hand" ? "RETURN" : instance?.location === "exile" ? "BANISH" : after.events.slice(before.events.length).some(e => e.card === prior && e.type === "sacrifice") ? "SAC" : "DEST";
      add("departure", kind, `${name}: ${kind === "EVO" ? "becomes a prior evolution stage" : kind === "SAC" ? "is sacrificed" : kind === "RETURN" ? "returns to hand" : kind === "BANISH" ? "is banished" : "is destroyed"}.`);
    }
    if (incoming && incoming !== prior) {
      const definition = library[after.cards[incoming].definitionId];
      const revived = before.cards[incoming]?.location === "graveyard";
      const label = revived ? "REVIVE" : definition.type === "evolution" ? "EVO" : definition.type === "replacement" ? "REPLACE" : "PLAY";
      add("arrival", label, `${definition.name} ${revived ? "returns from the graveyard" : definition.type === "evolution" ? "evolves here" : definition.type === "replacement" ? "replaces the sacrificed creature" : "enters play"} at ${currentPower(after, library, incoming)} effective power.`);
    }
    if (incoming && incoming === prior) {
      const name = library[after.cards[incoming].definitionId].name, old = oldPower[incoming], now = newPower[incoming];
      if (old.effective !== now.effective) add("power", signed(now.effective - old.effective), `${name}: effective power ${old.effective} → ${now.effective}.`);
      if (old.dynamic !== now.dynamic) add("dynamic", `Δ ${signed(now.dynamic - old.dynamic)}`, `Battlefield conditions change ${name}'s dynamic bonus ${old.dynamic} → ${now.dynamic}.`);
      const grants = (p: typeof now) => [...p.permanentProtections, ...p.continuousProtections.map(x => x.protection)].sort().join(", ");
      if (grants(old) !== grants(now)) add("protection", "SHIELD", `${name}: protection ${grants(old) || "none"} → ${grants(now) || "none"}.`);
      for (const grant of now.auras) if (!old.auras.some(x => x.source === grant.source && x.ability === grant.ability && x.amount === grant.amount)) add("aura", `≈ ${signed(grant.amount)}`, `${library[after.cards[grant.source].definitionId].name} continuously ${grant.amount >= 0 ? "strengthens" : "weakens"} ${name} by ${Math.abs(grant.amount)} while its grant remains active.`);
      for (const grant of old.auras) if (!now.auras.some(x => x.source === grant.source && x.ability === grant.ability && x.amount === grant.amount)) add("aura", "≈ ENDS", `${name} loses the ${signed(grant.amount)} continuous grant from ${library[before.cards[grant.source].definitionId].name}.`);
    }
  }
  return result;
}

export function actionPreview(before: GameState, action: Action, library: CardLibrary) {
  const steps: DiagnosticStep[] = [];
  const committed = act(before, action, library, { captureStates: true, onStep: s => steps.push(s) });
  const boundary = steps.find(s => s.kind === "before-private-draw" || s.kind === "action-effects-complete");
  // A real recorded snapshot, before the first private draw or automatic turn transfer.
  const visible = boundary?.state ?? committed;
  const changes = publicChanges(before, visible, library);
  const seen = new Set<string>();
  const protectedTarget = (id: string, text: string) => {
    const cell = visible.board.find(c => c.creature === id);
    if (!cell || seen.has(id + text)) return;
    seen.add(id + text);
    changes.push({ row: cell.row, col: cell.col, kind: "protection", label: "SHIELD", text: `${coordinate(cell)} · ${library[visible.cards[id].definitionId].name}: ${text}` });
  };
  const included = boundary ? steps.slice(0, steps.indexOf(boundary) + 1) : steps;
  for (const step of included) if (step.kind === "protection" && step.details && typeof step.details === "object" && "card" in step.details && typeof step.details.card === "string") protectedTarget(step.details.card, "Weakening protection prevents the attempted reduction.");
  for (const event of visible.events.slice(before.events.length)) if (event.type === "protection" && event.card) protectedTarget(event.card, "Direct-destruction protection prevents the attempted destruction.");
  return { state: visible, fault: committed.fault, changes, scoreBefore: scoreGame(before, library), scoreAfter: scoreGame(visible, library), privateConsequencesOmitted: boundary?.kind === "before-private-draw" };
}

export type PresentationFrame = { state: GameState; changes: PublicChange[]; caption: string };
export function presentationFrames(before: GameState, after: GameState, steps: DiagnosticStep[], library: CardLibrary): PresentationFrame[] {
  const result: PresentationFrame[] = [];
  let previous = before;
  for (const step of steps) if (step.state) {
    const changes = publicChanges(previous, step.state, library);
    if (!changes.length && step.kind !== "committed") continue;
    result.push({ state: step.state, changes, caption: changes.slice(0, 3).map(c => c.text).join(" ") || "All automatic effects resolved." });
    previous = step.state;
  }
  if (!result.length) result.push({ state: after, changes: publicChanges(before, after, library), caption: "Action resolved." });
  return result;
}

export function publicEventText(event: GameEvent): string {
  if (event.type === "draw" || event.type === "card-change") return `${playerName(event.player ?? null)}: ${event.type === "draw" || event.text.endsWith("drawn.") ? "card drawn" : "card generated"}. Private card identities stay hidden.`;
  if (event.type === "power") return `Power effect attempted: ${event.text}`;
  return event.text;
}

export type PresentationPreferences = { speed: "fast" | "normal" | "slow" | "step" | "skip"; beginner: boolean };
export function readPresentationPreferences(): PresentationPreferences {
  try { const value = JSON.parse(localStorage.getItem("kindred-presentation-v1") ?? "null"); if (value && ["fast", "normal", "slow", "step", "skip"].includes(value.speed)) return { speed: value.speed, beginner: value.beginner !== false }; } catch {}
  return { speed: "fast", beginner: true };
}
export function savePresentationPreferences(value: PresentationPreferences) { try { localStorage.setItem("kindred-presentation-v1", JSON.stringify(value)); } catch {} }
