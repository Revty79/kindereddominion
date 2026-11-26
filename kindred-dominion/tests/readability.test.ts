import { expect, it } from "vitest";
import { act, relative, validateDeck, legalPlays as legalActions } from "../src/engine/game";
import { DEFAULT_CONFIG } from "../src/engine/config";
import { signature } from "../src/replay/record";
import { actionPreview, presentationFrames, publicEventText, publicChanges } from "../src/ui/readability";
import { filterCollection, emptyCollectionFilter } from "../src/ui/collection";
import { ownerContent, OWNER_CONTENT_ID } from "../src/content/owner";
import { addBundledVersions } from "../src/content/bundled";
import { initialWorkspace } from "../src/content/baseline";
import { libraryOf } from "../src/content/validation";
import { validateSimulation } from "../src/simulation/run";
import { ownerCardScenario } from "./helpers/owner-scenarios";
import type { DiagnosticStep } from "../src/engine/types";
import { ownerReadabilityScenarios } from "../src/content/owner-scenarios";
import { validateScenario } from "../src/sandbox/scenario";

it("defaults fresh ordinary games to the separate owner catalog while retaining all historical versions and existing drafts", () => {
  const fresh = addBundledVersions(initialWorkspace());
  expect(fresh.activeVersion).toBe(OWNER_CONTENT_ID);
  expect(fresh.working.cards[0].collectible!.number).toBe("N001");
  expect(fresh.versions.some(v => v.id === "v1.1-baseline" && v.cards.length === 30)).toBe(true);
  expect(fresh.versions.some(v => v.id === "founding-kindreds-150-v1" && v.cards.length === 150)).toBe(true);
  expect(fresh.versions.some(v => v.id === "mechanics-laboratory-v1.3a")).toBe(true);
  const existing = initialWorkspace(); existing.revision = 7; existing.working.cards[0].name = "Owner's saved draft";
  const updated = addBundledVersions(existing);
  expect(updated.working).toEqual(existing.working);
  expect(updated.activeVersion).toBe(OWNER_CONTENT_ID);
  expect(addBundledVersions(updated)).toBe(updated);
});
it("uses actual recorded immediate action snapshots and stops before any private draw", () => {
  const { scenario, source } = ownerCardScenario("a002"), library = libraryOf(scenario.content);
  const action = { type: "play" as const, player: 0 as const, card: source, row: 1, col: 1 };
  const before = signature(scenario.state), p = actionPreview(scenario.state, action, library);
  expect(signature(scenario.state)).toBe(before);
  expect(p.privateConsequencesOmitted).toBe(true);
  expect(p.state.players[0].hand).toHaveLength(scenario.state.players[0].hand.length - 1);
  const secret = structuredClone(scenario.state), top = secret.players[0].draw[0]; secret.cards[top].definitionId = "m029";
  const alternative = actionPreview(secret, action, library);
  expect(alternative.changes).toEqual(p.changes);
  expect(alternative.scoreAfter).toEqual(p.scoreAfter);
  expect(JSON.stringify(p.changes)).not.toContain("Elder Dragon");
});
it("records real power/aura/protection/territory explanations and keeps playback outside deterministic resolution", () => {
  const { scenario, source } = ownerCardScenario("n005"), library = libraryOf(scenario.content);
  const action = { type: "play" as const, player: 0 as const, card: source, row: 1, col: 1 }, steps: DiagnosticStep[] = [];
  const next = act(scenario.state, action, library, { captureStates: true, onStep: s => steps.push(s) });
  const withoutPlayback = act(scenario.state, action, library);
  expect(signature(next)).toBe(signature(withoutPlayback));
  const frames = presentationFrames(scenario.state, next, steps, library);
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.every(frame => steps.some(step => step.state === frame.state))).toBe(true);
  expect(signature(frames.at(-1)!.state)).toBe(signature(next));
  expect(publicChanges(scenario.state, next, library).some(c => c.kind === "aura" && c.text.includes("Honeybee"))).toBe(true);
  expect(publicEventText({ id: 1, turn: 1, type: "card-change", player: 1, text: "Elder Dragon drawn." })).not.toContain("Elder Dragon");
});
it("explains prevented destruction and weakening without inventing a successful change", () => {
  for (const [id, target, fortification] of [["n018", "c007", 2], ["n006", "c014", 0]] as const) {
    const { scenario, source, enemy } = ownerCardScenario(id), library = libraryOf(scenario.content);
    scenario.state.cards[enemy].definitionId = target;
    scenario.state.board.find(c => c.creature === enemy)!.fortification = fortification;
    const preview = actionPreview(scenario.state, { type: "play", player: 0, card: source, row: 1, col: 1 }, library);
    expect(preview.changes.some(c => c.kind === "protection" && c.text.includes("prevents"))).toBe(true);
    expect(preview.state.cards[enemy].location).toBe("battlefield");
    expect(preview.state.cards[enemy].modifier).toBe(-1);
  }
});
it("previews actual destruction and resurrection even when a creature ends on its original square", () => {
  const { scenario, source, enemy } = ownerCardScenario("n018"), library = libraryOf(scenario.content);
  scenario.state.cards[enemy].definitionId = "u002";
  const preview = actionPreview(scenario.state, { type: "play", player: 0, card: source, row: 1, col: 1 }, library);
  expect(preview.state.cards[enemy].location).toBe("battlefield");
  expect(preview.changes.some(c => c.label === "DEST" && c.text.includes("Zombie"))).toBe(true);
  expect(preview.changes.some(c => c.label === "REVIVE" && c.text.includes("Zombie"))).toBe(true);
  expect(signature(scenario.state)).not.toBe(signature(preview.state));
});
it("filters the actual collection by number, set, power, placement, classification and executable mechanics", () => {
  const cards = ownerContent().cards, filter = { ...emptyCollectionFilter };
  expect(filterCollection(cards, "all", "N027", filter).map(c => c.id)).toEqual(["n027"]);
  expect(filterCollection(cards, "Nature", "", filter)).toHaveLength(30);
  expect(filterCollection(cards, "all", "", { ...filter, classification: "Wolf" }).map(c => c.id)).toEqual(["n002", "n027", "n028"]);
  expect(filterCollection(cards, "Nature", "", { ...filter, placement: "evolution", mechanic: "aura", minPower: "5" }).map(c => c.id)).toEqual(["n028"]);
  expect(filterCollection(cards, "all", "", { ...filter, set: "unpublished-future-set" })).toHaveLength(0);
});
it("applies every supplied relative influence in the established opposing orientation", () => {
  for (const card of ownerContent().cards) for (const influence of card.influence) {
    expect(relative({ row: 1, col: 2 }, influence.x, influence.y, 0)).toEqual({ row: 1 + influence.y, col: 2 + influence.x });
    expect(relative({ row: 1, col: 2 }, influence.x, influence.y, 1)).toEqual({ row: 1 + influence.y, col: 2 - influence.x });
  }
});
it("rejects an alternative-edition copy bypass before a simulation starts", () => {
  const content = ownerContent(), foil = { ...structuredClone(content.cards[0]), id: "n001-foil" };
  content.cards.push(foil); content.metadata[foil.id] = content.metadata.n001;
  const cards = ["n001", "n001", "n001-foil", "n001-foil", ...content.decks[0].cards.slice(1, 12)];
  expect(validateDeck(cards, libraryOf(content))).not.toEqual([]);
  expect(() => validateSimulation({ content, decks: [{ ...content.decks[0], cards }, content.decks[1]], config: structuredClone(DEFAULT_CONFIG), matches: 1, seed: 1, pairings: "single", mirrored: true, maxActions: 200, retainExamples: false })).toThrow(/4 copies/);
});
it.each(ownerReadabilityScenarios().map(s => [s.name, s] as const))("%s is a valid prepared owner-only experiment", (_, s) => {
  expect(s.content.cards).toHaveLength(150);
  expect(validateScenario(s).filter(i => i.severity === "error")).toEqual([]);
  const actions = legalActions(s.state, libraryOf(s.content));
  expect(actions.length).toBeGreaterThan(0);
  expect(act(s.state, actions[0], libraryOf(s.content)).fault).toBeNull();
});
