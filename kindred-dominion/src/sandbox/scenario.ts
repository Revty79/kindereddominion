import {validateLaboratory} from "./laboratory-validation";
import {
  assertInvariants,
  cellAt,
  createMatch,
  positionOf,
  validateConfig,
} from "../engine/game";
import { currentPower } from "../engine/scoring";
import { MAX_POWER } from '../engine/advanced-types';
import type {
  CardInstance,
  GameConfig,
  GameState,
  Player,
  Position,
} from "../engine/types";
import { libraryOf, validatePack, validateRules } from "../content/validation";
import type { ContentPack, Issue, Scenario } from "../content/types";
export function emptyScenario(
  content: ContentPack,
  config: GameConfig,
  name = "Untitled scenario",
): Scenario {
  const errors = validateRules(config).filter((i) => i.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));
  const first = content.cards[0]?.id;
  if (!first) throw new Error("A scenario needs at least one card definition.");
  const initial = createMatch(
    [Array(config.deckSize).fill(first), Array(config.deckSize).fill(first)],
    libraryOf(content),
    { ...config, mode: "free" },
    1,
    0,
  );
  initial.config = structuredClone(config);
  initial.cards = {};
  initial.lineages = {};
  initial.events = [];
  initial.nextEvent = 1;
  initial.nextCard = 1;
  initial.phase = "playing";
  initial.turn = 1;
  initial.players.forEach((p) => {
    p.draw = [];
    p.hand = [];
    p.graveyard = [];
    p.exile = [];
    p.mulliganDone = true;
    p.turns = 1;
  });
  return {
    id: `scenario-${Date.now().toString(36)}`,
    name,
    description: "",
    content: structuredClone(content),
    state: initial,
    savedAt: new Date().toISOString(),
  };
}
export function addInstance(
  state: GameState,
  definitionId: string,
  owner: Player,
  zone: "hand" | "draw" | "graveyard" | "exile" | "battlefield",
  position?: Position,
): GameState {
  const next = structuredClone(state);
  const id = `c${next.nextCard++}`;
  if (Object.keys(next.cards).length >= next.config.safeguards.maxCards)
    throw new Error("Scenario card ceiling reached.");
  const card: CardInstance = {
    id,
    definitionId,
    owner,
    location: zone,
    lineage: id,
    modifier: 0,
    statuses: [],
    stack: [],
    activations: {},
    resurrections: 0,
  };
  if (zone === "battlefield") {
    const cell = position && cellAt(next, position.row, position.col);
    if (!cell || cell.creature)
      throw new Error("Select an empty battlefield position.");
    cell.owner = owner;
    cell.creature = id;
  } else next.players[owner][zone].push(id);
  next.cards[id] = card;
  next.lineages[id] = { activations: {}, resurrections: 0 };
  return next;
}
export function removeInstance(state: GameState, id: string): GameState {
  const next = structuredClone(state);
  const card = next.cards[id];
  if (!card) return next;
  if (card.location === "stack")
    throw new Error("Remove a stack form through its active creature.");
  const ids = [...card.stack, id];
  const cell = positionOf(next, id);
  if (cell) cell.creature = null;
  for (const stage of ids) {
    for (const p of next.players)
      for (const z of ["hand", "draw", "graveyard", "exile"] as const)
        p[z] = p[z].filter((c) => c !== stage);
    delete next.cards[stage];
  }
  return next;
}
export function addStackForm(
  state: GameState,
  activeId: string,
  definitionId: string,
): GameState {
  const next = addInstance(
    state,
    definitionId,
    state.cards[activeId].owner,
    "graveyard",
  );
  const previousId = `c${next.nextCard - 1}`;
  const active = next.cards[activeId],
    form = next.cards[previousId];
  next.players[active.owner].graveyard = next.players[
    active.owner
  ].graveyard.filter((id) => id !== previousId);
  form.location = "stack";
  form.lineage = active.lineage;
  active.stack.unshift(previousId);
  return next;
}
export function validateScenario(scenario: Scenario): Issue[] {
  const out: Issue[] = [];
  const fail = (path: string, message: string) =>
    out.push({ severity: "error", path, message });
  if (!scenario || !scenario.state || !scenario.content)
    return [
      {
        severity: "error",
        path: "scenario",
        message: "A scenario requires a content snapshot and state.",
      },
    ];
  out.push(
    ...validatePack(scenario.content),
    ...validateRules(scenario.state.config),
  );
  if (out.some((i) => i.severity === "error")) return out;
  const s = scenario.state,
    lib = libraryOf(scenario.content);
  try {
    validateConfig(s.config);
    validateLaboratory(scenario);
    assertInvariants(s, lib);
    if (
      s.board.length !==
      s.config.battlefield.rows * s.config.battlefield.cols
    )
      fail("board", "Every configured coordinate must appear exactly once.");
    const coords = new Set<string>();
    for (const c of s.board) {
      const key = `${c.row}/${c.col}`;
      if (
        !Number.isInteger(c.row) ||
        !Number.isInteger(c.col) ||
        c.row < 0 ||
        c.col < 0 ||
        c.row >= s.config.battlefield.rows ||
        c.col >= s.config.battlefield.cols ||
        coords.has(key) ||
        ![null, 0, 1].includes(c.owner)
      )
        fail("board", "Invalid or duplicated battlefield coordinate or owner.");
      coords.add(key);
    }
    if (
      ![0, 1].includes(s.active) ||
      !["playing", "mulligan", "finished", "fault"].includes(s.phase) ||
      !Number.isSafeInteger(s.turn) ||
      s.turn < 0 ||
      ![0, 1, 2].includes(s.passes)
    )
      fail("turn", "Invalid active player, phase, turn or pass counter.");
    if (
      !Number.isSafeInteger(s.rng) ||
      s.rng < 1 ||
      s.rng > 4294967295 ||
      !Number.isSafeInteger(s.seed) ||
      s.seed < 0 ||
      s.seed > 4294967295
    )
      fail("seed", "Invalid deterministic random state.");
    if (
      !Number.isSafeInteger(s.nextCard) ||
      s.nextCard <=
        Math.max(0, ...Object.keys(s.cards).map((id) => Number(id.slice(1))))
    )
      fail(
        "identity",
        "Next card identity would duplicate an existing instance.",
      );
    if (
      !Number.isSafeInteger(s.nextEvent) ||
      s.nextEvent < 1 ||
      s.events.some((e) => e.id >= s.nextEvent)
    )
      fail(
        "events",
        "Event sequence must remain strictly ahead of recorded events.",
      );
    if (
      !Number.isSafeInteger(s.generated) ||
      s.generated < 0 ||
      Object.keys(s.cards).length > s.config.safeguards.maxCards
    )
      fail("cards", "Invalid generation count or scenario card ceiling.");
    for (const p of s.players)
      if (
        !Number.isSafeInteger(p.turns) ||
        p.turns < 0 ||
        typeof p.mulliganDone !== "boolean"
      )
        fail("players", "Invalid player turn state.");
    for (const c of Object.values(s.cards)) {
      if (
        !/^c[1-9][0-9]*$/.test(c.id) ||
        s.cards[c.id] !== c ||
        ![0, 1].includes(c.owner) ||
        !Number.isSafeInteger(c.modifier) ||
        Math.abs(c.modifier) > (s.mechanics?MAX_POWER:1000) ||
        !Array.isArray(c.statuses) ||
        c.statuses.some((v) => !["weakening", "destruction"].includes(v))
      )
        fail(
          `cards.${c.id}`,
          "Invalid instance identity, modifier or protection.",
        );
      if (
        !Number.isSafeInteger(c.resurrections) ||
        c.resurrections < 0 ||
        Object.values(c.activations).some(
          (v) => !Number.isSafeInteger(v) || v < 0,
        )
      )
        fail(
          `cards.${c.id}.limits`,
          "Activation and resurrection counters must be nonnegative integers.",
        );
      if (c.stack.length) {
        const chain = [...c.stack, c.id];
        for (let i = 1; i < chain.length; i++) {
          const prior = s.cards[chain[i - 1]],
            active = s.cards[chain[i]],
            def = lib[active.definitionId],
            req = def.prerequisite;
          if (
            def.type !== "evolution" ||
            !req ||
            (req.definitions &&
              !req.definitions.includes(prior.definitionId)) ||
            (req.tags &&
              !req.tags.some((t) =>
                lib[prior.definitionId].tags.includes(t),
              )) ||
            (req.minPower !== undefined &&
              currentPower(s, lib, prior.id) < req.minPower) ||
            prior.lineage !== c.lineage
          )
            fail(
              `cards.${c.id}.stack`,
              "Evolution stack has an incompatible predecessor or lineage.",
            );
        }
      }
    }
    for (const lineage of Object.values(s.lineages))
      if (
        !Number.isSafeInteger(lineage.resurrections) ||
        lineage.resurrections < 0 ||
        Object.values(lineage.activations).some(
          (v) => !Number.isSafeInteger(v) || v < 0,
        )
      )
        fail("lineages", "Invalid persistent lineage counters.");
  } catch (error) {
    fail("invariant", error instanceof Error ? error.message : String(error));
  }
  return out;
}
