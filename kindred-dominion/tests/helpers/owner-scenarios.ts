import { ownerContent } from "../../src/content/owner";
import { libraryOf } from "../../src/content/validation";
import { DEFAULT_CONFIG } from "../../src/engine/config";
import { act, assertInvariants } from "../../src/engine/game";
import { addInstance, addStackForm, emptyScenario, validateScenario } from "../../src/sandbox/scenario";
import { appendRecord, newRecord, validateRecord } from "../../src/replay/record";
import type { CardDefinition, GameState, Player, Position, Action } from "../../src/engine/types";

const content = ownerContent();
// Test-only, declared DSL drivers. Never part of the 150-card version or player build.
const driver = (id: string, effect: "power" | "destroy", x: number[], amount = 0): CardDefinition => ({
  id, name: id, kindred: "Constructs", rank: 1, power: 1, type: "standard", tags: ["ValidationDriver"], influence: [], text: "Controlled test stimulus; not a collectible card.", glyph: "◇",
  abilities: [{ id: `${id}-ability`, trigger: "placement", effects: effect === "power" ? [{ type: "power", amount, target: { kind: "pattern", relation: "any", offsets: x.map(x => ({ x, y: 0 })) } }] : [{ type: "destroy", target: { kind: "pattern", relation: "any", offsets: x.map(x => ({ x, y: 0 })) } }], limit: { perEvent: 1, perMatch: 1 } }],
});
const drivers = [driver("test-owner-boost", "power", [3, 4], 1), driver("test-owner-bruise", "power", [3], -1), driver("test-owner-destroy", "destroy", [3]), driver("test-owner-friendly-death", "destroy", [4]), driver("test-owner-enemy-death", "destroy", [2])];
export function ownerCardScenario(id: string) {
  const pack = structuredClone(content);
  pack.id = "owner-card-validation-fixtures";
  pack.name = "Owner card validation · separate development drivers";
  pack.cards.push(...structuredClone(drivers));
  for (const card of drivers) pack.metadata[card.id] = { status: "draft", description: card.text, flavor: "", rarity: "", artwork: "", notes: "Test-only stimulus; never publish as official content." };
  const scenario = emptyScenario(pack, structuredClone(DEFAULT_CONFIG), `OWNER · ${id.toUpperCase()}`);
  scenario.id = `owner-scenario-${id}`;
  scenario.savedAt = "2026-11-26T00:00:00Z";
  let state = scenario.state;
  const add = (definition: string, player: Player, zone: "hand" | "draw" | "graveyard" | "battlefield", position?: Position) => {
    state = addInstance(state, definition, player, zone, position);
    return `c${state.nextCard - 1}`;
  };
  for (const cell of state.board) { cell.owner = cell.col <= 1 ? 0 : cell.col >= 4 ? 1 : null; cell.tokens = cell.owner === null ? 0 : 3; }
  const friend = add("n003", 0, "battlefield", { row: 1, col: 0 });
  add("n002", 0, "battlefield", { row: 0, col: 1 });
  const weakened = add("n010", 0, "battlefield", { row: 2, col: 1 });
  state.cards[weakened].modifier = -1;
  const enemy = add("m001", 1, "battlefield", { row: 1, col: 2 });
  state.cards[enemy].modifier = -1;
  add("m015", 1, "battlefield", { row: 0, col: 2 });
  add("m019", 1, "battlefield", { row: 2, col: 2 });
  add("u001", 0, "graveyard");
  add("n001", 0, "draw"); add("n002", 0, "draw"); add("n001", 1, "draw");
  state.mechanics!.history = [
    { event: "destroyed", player: 0, definitionId: "n002", tags: ["Mammal", "Wolf", "Juvenile"], kindred: "Nature", cause: "destruction", count: 1 },
    { event: "destroyed", player: 0, definitionId: "c001", tags: ["Construct", "Mechanical", "Beetle"], kindred: "Constructs", cause: "sacrifice", count: 1 },
    { event: "sacrificed", player: 0, definitionId: "c001", tags: ["Construct", "Mechanical", "Beetle"], kindred: "Constructs", cause: "sacrifice", count: 1 },
    { event: "destroyed", player: 1, definitionId: "m001", tags: ["Dragon", "Reptile", "Juvenile"], kindred: "Mythical", cause: "destruction", count: 2 },
  ];
  const definition = content.cards.find(c => c.id === id)!;
  if (definition.type !== "standard") {
    const predecessor = definition.prerequisite?.definitions?.[0] ?? "n002";
    const previous = add(predecessor, 0, "battlefield", { row: 1, col: 1 });
    if (definition.type === "replacement") state.cards[previous].modifier = 4;
    if (pack.cards.find(c => c.id === predecessor)?.prerequisite?.definitions?.[0]) state = addStackForm(state, previous, pack.cards.find(c => c.id === predecessor)!.prerequisite!.definitions![0]);
  }
  const source = add(id, 0, "hand");
  const incoming = add("n026", 0, "hand");
  for (const card of drivers) add(card.id, 1, "hand");
  scenario.state = state;
  scenario.description = `Exercise ${definition.collectible!.number} ${definition.name} through real placement and declared existing-mechanic stimuli. Prepared historical counts are part of the immutable initial snapshot. Driver definitions are separate test fixtures.`;
  return { scenario, source, friend, enemy, incoming };
}

export function executeOwnerCardScenario(id: string, prepare?: (state: GameState) => void) {
  const setup = ownerCardScenario(id), library = libraryOf(setup.scenario.content);
  prepare?.(setup.scenario.state);
  const errors = validateScenario(setup.scenario).filter(i => i.severity === "error");
  if (errors.length) throw new Error(JSON.stringify(errors));
  let state = setup.scenario.state;
  let record = newRecord(state, library, [[], []], setup.scenario.content.id, setup.scenario.name);
  const steps: { action: Action; state: GameState }[] = [];
  const run = (action: Action) => {
    state = act(state, action, library);
    if (state.fault) throw new Error(`${id}: ${state.fault}`);
    assertInvariants(state, library);
    record = appendRecord(record, action, state); steps.push({ action, state });
  };
  run({ type: "play", player: 0, card: setup.source, row: 1, col: 1 });
  const placed = state;
  const trigger = library[id].abilities[0]?.trigger;
  if (["sacrifice", "turnStart"].includes(trigger)) {
    run({ type: "pass", player: 1 });
    if (trigger === "sacrifice" && state.cards[setup.source].location === "battlefield") run({ type: "play", player: 0, card: setup.incoming, row: 1, col: 1 });
  } else if (["destruction", "firstWeakened", "firstEnhanced", "otherEnhanced", "otherDestruction"].includes(trigger)) {
    const eventRelation = library[id].abilities[0].eventFilter?.relation;
    const driver = trigger === "destruction" ? "test-owner-destroy" : trigger === "firstWeakened" ? "test-owner-bruise" : trigger === "otherDestruction" ? eventRelation === "enemy" ? "test-owner-enemy-death" : "test-owner-friendly-death" : "test-owner-boost";
    const card = Object.values(state.cards).find(c => c.definitionId === driver && c.location === "hand")!;
    run({ type: "play", player: 1, card: card.id, row: 1, col: 4 });
  }
  validateRecord(record);
  return { ...setup, library, initial: setup.scenario.state, placed, final: state, record, steps };
}
