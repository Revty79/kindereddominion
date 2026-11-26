import {
  EFFECTS,
  MECHANICS,
  PROTECTIONS,
  TARGETS,
  TRIGGERS,
} from "../engine/registry";
import { validateDeck } from "../engine/game";
import { SCORING_RULES } from "../engine/scoring";
import type { CardDefinition, CardLibrary, GameConfig } from "../engine/types";
import type { ContentPack, Issue } from "./types";
import { ENGINE_VERSION } from "./types";
import { fromDataURL } from "../assets/artwork";
import {
  validateAdvancedCard,
  validateConditionDefinition,
  validateNumberDefinition,
  validateTargetDefinition,
} from "../engine/advanced-validation";
import { ADVANCED_ENGINE_VERSION } from "../engine/advanced-types";
import { hasAdvancedMechanics } from "../engine/evaluation";
import { OWNER_ENGINE_VERSION, SUPPORTED_ENGINES, requiresOwnerRules } from "../engine/versions";
import { collectibleParts } from "../engine/identity";
export const libraryOf = (pack: ContentPack): CardLibrary =>
  Object.fromEntries(pack.cards.map((c) => [c.id, c]));
export const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const obj = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown, min = -100, max = 100) =>
  Number.isSafeInteger(x) && Number(x) >= min && Number(x) <= max;
const str = (x: unknown) =>
  typeof x === "string" && x.length > 0 && x.length <= 10000;
const list = (x: unknown): x is any[] => Array.isArray(x) && x.length <= 1000;
const strings = (x: unknown) => list(x) && x.every((v: unknown) => str(v));
export function validateRules(config: GameConfig): Issue[] {
  const out: Issue[] = [];
  const error = (path: string, message: string) =>
    out.push({ severity: "error", path, message });
  if (!obj(config) || !obj(config.battlefield) || !obj(config.safeguards))
    return [
      {
        severity: "error",
        path: "rules",
        message: "Missing battlefield or safeguard configuration.",
      },
    ];
  const b = config.battlefield;
  if (!num(b.rows, 1, 20) || !num(b.cols, 2, 30) || b.rows * b.cols > 300)
    error(
      "battlefield",
      "Studio fields support 1–20 rows, 2–30 columns and at most 300 cells.",
    );
  if (!num(b.maxTokens, 1, 20) || !num(b.maxFortification, 0, 20))
    error("caps", "Tokens must be 1–20 and fortification 0–20.");
  if (
    !num(config.deckSize, 1, 50) ||
    !num(config.openingHand, 1, 25) ||
    config.openingHand * 2 > config.deckSize
  )
    error(
      "openingHand",
      "Deck size must be 1–50 and at least twice the opening hand, so a full mulligan can draw replacements.",
    );
  if (!num(config.maxCopies, 1, 50))
    error("maxCopies", "Duplicate limit must be 1–50.");
  if (
    !["standard", "free"].includes(config.mode) ||
    !str(config.collection) ||
    !SCORING_RULES[config.scoring]
  )
    error("rules", "Select supported scoring, collection and play format.");
  for (const [key, value] of Object.entries(config.safeguards))
    if (!num(value, 1, key === "maxResolutionSteps" ? 3000 : 1000))
      error(
        `safeguards.${key}`,
        "Safeguards must be positive bounded integers.",
      );
  for (const key of [
    "maxResolutionSteps",
    "maxGeneratedPerMatch",
    "maxResurrections",
    "maxCards",
  ])
    if (!(key in config.safeguards))
      error(`safeguards.${key}`, "Required safeguard is missing.");
  if (config.safeguards.maxCards < config.deckSize * 2)
    error("maxCards", "Card ceiling must accommodate both starting decks.");
  const used = new Set<string>();
  if (!list(b.starts)) error("starts", "Starting territories must be a list.");
  else
    for (const start of b.starts) {
      if (
        !obj(start) ||
        ![0, 1].includes(start.player) ||
        !num(start.tokens, 0, b.maxTokens) ||
        !num(start.fortification, 0, b.maxFortification) ||
        !list(start.positions)
      ) {
        error("starts", "Invalid starting territory group.");
        continue;
      }
      for (const p of start.positions) {
        if (
          !obj(p) ||
          !num(p.row, 0, b.rows - 1) ||
          !num(p.col, 0, b.cols - 1) ||
          used.has(`${p.row},${p.col}`)
        )
          error(
            "starts",
            "Starting positions must be in bounds and may not overlap.",
          );
        else used.add(`${p.row},${p.col}`);
      }
    }
  return out;
}
export function evolutionEdges(cards: CardDefinition[]) {
  return cards
    .filter((c) => c.type === "evolution")
    .flatMap((c) =>
      cards
        .filter(
          (p) =>
            p.id !== c.id &&
            (!c.prerequisite?.definitions ||
              c.prerequisite.definitions.includes(p.id)) &&
            (!c.prerequisite?.tags ||
              c.prerequisite.tags.some((t) => p.tags.includes(t))),
        )
        .map((p) => ({
          from: p.id,
          to: c.id,
          criteria: !c.prerequisite?.definitions,
        })),
    );
}
export function validateCard(value: unknown, pack: ContentPack): Issue[] {
  const out: Issue[] = [];
  const error = (path: string, message: string) =>
    out.push({ severity: "error", path, message });
  if (!obj(value))
    return [
      {
        severity: "error",
        path: "card",
        message: "Card must be a structured definition.",
      },
    ];
  const c = value;
  if (c.collectible !== undefined) {
    const identity = c.collectible;
    if (!obj(identity) || !str(identity.number) || !collectibleParts(identity.number) ||
      !str(identity.gameplayId) || !ID.test(identity.gameplayId) ||
      !str(identity.setId) || !ID.test(identity.setId) ||
      !str(identity.expansionId) || !ID.test(identity.expansionId) ||
      !str(identity.edition) || !str(identity.artworkId) || !ID.test(identity.artworkId) ||
      !num(identity.definitionRevision, 1, Number.MAX_SAFE_INTEGER))
      error("collectible", "Use a permanent collectible number, gameplay identity, set, expansion, edition, artwork identity and positive definition revision.");
  }
  if (!str(c.id) || !ID.test(c.id))
    error(
      "id",
      "Use a stable identifier beginning with a letter, then letters, digits, hyphens or underscores.",
    );
  if (!str(c.name) || !str(c.text) || !str(c.glyph))
    error(
      "name/text",
      "Name, supplementary description and visual identifier are required.",
    );
  if (!pack.collections.some((k) => k.id === c.kindred))
    error("kindred", "Choose an existing collection.");
  if (
    !["standard", "replacement", "evolution"].includes(c.type) ||
    !num(c.rank, 1, 3) ||
    !num(c.power, 1, 100)
  )
    error(
      "statistics",
      "Use a supported placement type, rank I–III and positive base power up to 100.",
    );
  if (!strings(c.tags))
    error("tags", "Classifications must be a list of nonempty labels.");
  if (c.maxCopies !== undefined && !num(c.maxCopies, 1, 50))
    error("maxCopies", "Copy override must be between 1 and 50.");
  if (
    c.protections !== undefined &&
    (!list(c.protections) ||
      c.protections.some((p: string) => !(p in PROTECTIONS)))
  )
    error("protections", "Only destruction and weakening protections exist.");
  if (!list(c.influence)) error("influence", "Influence must be a list.");
  else {
    const used = new Set<string>();
    for (const e of c.influence) {
      if (
        !obj(e) ||
        !(e.mechanic in MECHANICS) ||
        !num(e.x, -20, 20) ||
        !num(e.y, -20, 20) ||
        !num(e.amount, 1, 100)
      ) {
        error(
          "influence",
          "Select a supported territorial mechanic, bounded offset and strength 1–100.",
        );
        continue;
      }
      const key = `${e.x}/${e.y}/${e.mechanic}`;
      if (used.has(key))
        error(
          "influence",
          "Duplicate mechanics on the same offset must be combined into one strength.",
        );
      used.add(key);
    }
  }
  const req = c.prerequisite;
  if (
    c.type === "evolution" &&
    (!obj(req) ||
      (!req.definitions?.length &&
        !req.tags?.length &&
        req.minPower === undefined))
  )
    error(
      "prerequisite",
      "Evolution requires an explicit predecessor, classification or supported power condition.",
    );
  if (req !== undefined) {
    if (!obj(req)) error("prerequisite", "Invalid prerequisite object.");
    else {
      if (
        Object.keys(req).some(
          (k) => !["definitions", "tags", "minPower"].includes(k),
        )
      )
        error("prerequisite", "Unsupported prerequisite condition.");
      if (
        req.definitions !== undefined &&
        (!strings(req.definitions) ||
          !req.definitions.length ||
          req.definitions.some(
            (id: string) => !pack.cards.some((p) => p.id === id),
          ))
      )
        error(
          "prerequisite.definitions",
          "Every named predecessor must exist.",
        );
      if (
        req.tags !== undefined &&
        (!strings(req.tags) ||
          !req.tags.length ||
          !pack.cards.some(
            (p) =>
              p.id !== c.id &&
              req.tags.some((t: string) => p.tags?.includes(t)),
          ))
      )
        error(
          "prerequisite.tags",
          "At least one existing predecessor must match these classifications.",
        );
      if (req.minPower !== undefined && !num(req.minPower, 0, 100))
        error("prerequisite.minPower", "Minimum power must be 0–100.");
      const eligible = pack.cards.filter(
        (p) =>
          p.id !== c.id &&
          (!req.definitions || req.definitions.includes(p.id)) &&
          (!req.tags || req.tags.some((t: string) => p.tags?.includes(t))),
      );
      if (c.type === "evolution" && !eligible.length)
        error(
          "prerequisite",
          "No card can meet the combined predecessor requirements.",
        );
    }
  }
  const validateTarget = (t: any, path: string) => {
    out.push(...validateTargetDefinition(t, path, pack));
  };
  if (!list(c.abilities)) error("abilities", "Abilities must be a list.");
  else {
    const ids = new Set<string>();
    c.abilities.forEach((a: any, i: number) => {
      const path = `abilities.${i}`;
      if (
        !obj(a) ||
        !str(a.id) ||
        !ID.test(a.id) ||
        ids.has(a.id) ||
        !(a.trigger in TRIGGERS) ||
        !list(a.effects) ||
        !a.effects.length
      ) {
        error(
          path,
          "Each ability needs a unique stable ID, supported trigger and at least one effect.",
        );
        return;
      }
      ids.add(a.id);
      if (
        a.allowOnResurrect !== undefined &&
        typeof a.allowOnResurrect !== "boolean"
      )
        error(path, "Resurrection activation must be a checkbox.");
      if (a.limit !== undefined) {
        if (
          !obj(a.limit) ||
          Object.keys(a.limit).some(
            (k) => !["perEvent", "perTurn", "perMatch"].includes(k),
          ) ||
          Object.values(a.limit).some((n) => !num(n, 1, 100))
        )
          error(
            path,
            "Activation restrictions must be positive counts up to 100.",
          );
      }
      if (a.condition !== undefined)
        out.push(...validateConditionDefinition(a.condition, path, pack));
      a.effects.forEach((e: any, j: number) => {
        const ep = `${path}.effects.${j}`;
        if (!obj(e) || !(e.type in EFFECTS)) {
          error(ep, "Unsupported effect.");
          return;
        }
        const capability = EFFECTS[e.type as keyof typeof EFFECTS];
        if (
          "amount" in capability &&
          typeof e.amount !== "object" &&
          (!num(
            e.amount,
            e.type === "power" || e.type === "tokens" || e.type === "fortify"
              ? -100000
              : 1,
            100000,
          ) ||
            e.amount === 0)
        )
          error(ep, "Provide a nonzero bounded effect strength.");
        if ("amount" in capability && typeof e.amount === "object")
          out.push(...validateNumberDefinition(e.amount, ep, pack));
        if ("target" in capability) validateTarget(e.target, ep);
        if (
          ["tokens", "fortify", "summon", "replace", "evolve"].includes(
            e.type,
          ) &&
          e.target?.relation === "enemy"
        )
          error(
            ep,
            "This effect only modifies friendly positions or creatures. Choose friendly or any relationship.",
          );
        if ("card" in capability) {
          const ref = pack.cards.find((card) => card.id === e.card);
          if (!ref) error(ep, "Referenced generated/placed card is missing.");
          else if (
            ["summon", "replace", "evolve"].includes(e.type) &&
            ref.type !==
              (
                {
                  summon: "standard",
                  replace: "replacement",
                  evolve: "evolution",
                } as any
              )[e.type]
          )
            error(ep, "Referenced card has the wrong placement type.");
        }
        if (
          e.type === "resurrect" &&
          (!["self", "firstFriendly"].includes(e.target) ||
            !num(e.limit, 1, 100) ||
            (e.overrideEvolution !== undefined &&
              typeof e.overrideEvolution !== "boolean"))
        )
          error(
            ep,
            "Resurrection requires a supported candidate choice, positive limit and optional explicit override.",
          );
        if (e.type === "protect" && !(e.protection in PROTECTIONS))
          error(ep, "Unsupported protection.");
      });
    });
  }
  out.push(...validateAdvancedCard(c, pack));
  if (num(c.power, 1, 100) && c.power > 12)
    out.push({
      severity: "warning",
      path: "power",
      message:
        "High base power: compare this card against existing alternatives before approval.",
    });
  return out;
}
export function validatePack(value: unknown): Issue[] {
  const out: Issue[] = [];
  const error = (path: string, message: string) =>
    out.push({ severity: "error", path, message });
  if (
    !obj(value) ||
    ![1, 2].includes(value.schema) ||
    !SUPPORTED_ENGINES.includes(value.engineVersion) ||
    !str(value.id) ||
    !str(value.name) ||
    !["baseline", "draft", "checkpoint", "testing", "archived"].includes(
      value.kind,
    )
  )
    return [
      {
        severity: "error",
        path: "content",
        message: "Incompatible content format or engine version.",
      },
    ];
  for (const key of ["cards", "collections", "decks", "rulesets"])
    if (!list(value[key])) error(key, "Required bounded list is missing.");
  if (out.length) return out;
  const pack = value as ContentPack;
  if (pack.schema !== (pack.engineVersion === ENGINE_VERSION ? 1 : 2))
    error("content", "Content schema and engine version do not agree.");
  try {
    if (
      hasAdvancedMechanics(libraryOf(pack)) &&
      (pack.schema !== 2 || ![ADVANCED_ENGINE_VERSION, OWNER_ENGINE_VERSION].includes(pack.engineVersion))
    )
      error(
        "content",
        "Advanced definitions require content schema 2 and engine 1.3.0; legacy versions are never silently reinterpreted.",
      );
  } catch {
    error("cards", "Malformed card definitions.");
  }
  if (pack.cards.every(obj) && requiresOwnerRules(libraryOf(pack)) && pack.engineVersion !== OWNER_ENGINE_VERSION)
    error("content", "Collectible identities and ruleset-cap expressions require engine 1.3.1; historical records are not reinterpreted.");
  const collectibleNumbers = new Map<string, string>();
  const gameplayNumbers = new Map<string, string>();
  const gameplayDefinitions = new Map<string, string>();
  const canonicalRules = (value: unknown): string => JSON.stringify(value, (_, v) =>
    obj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  for (const card of pack.cards) if (obj(card) && obj(card.collectible)) {
    const identity = card.collectible;
    const previous = collectibleNumbers.get(identity.number);
    if (previous && previous !== identity.gameplayId) error("collectible", "A collectible number cannot identify two gameplay cards.");
    const number = gameplayNumbers.get(identity.gameplayId);
    if (number && number !== identity.number) error("collectible", "Editions of one gameplay card must share its collectible number.");
    collectibleNumbers.set(identity.number, identity.gameplayId);
    gameplayNumbers.set(identity.gameplayId, identity.number);
    const rules = canonicalRules(Object.fromEntries(["kindred", "rank", "power", "type", "tags", "influence", "abilities", "prerequisite", "protections", "maxCopies", "continuous", "scaling", "scoring"].map(k => [k, (card as any)[k]])));
    const previousRules = gameplayDefinitions.get(identity.gameplayId);
    if (previousRules && previousRules !== rules) error("collectible", "Alternative editions must share one gameplay definition and copy limit.");
    gameplayDefinitions.set(identity.gameplayId, rules);
  }
  if (!obj(pack.metadata))
    error("metadata", "Card metadata must be a keyed object.");
  for (const key of ["cards", "collections", "decks", "rulesets"] as const) {
    const ids = new Set<string>();
    for (const item of pack[key]) {
      if (!obj(item) || !str(item.id) || !ID.test(item.id) || ids.has(item.id))
        error(`${key}.id`, "Identifiers must be valid, unique and stable.");
      if (obj(item)) ids.add(item.id);
    }
  }
  for (const k of pack.collections)
    if (
      !str(k.name) ||
      !str(k.color) ||
      !/^#[0-9a-fA-F]{6}$/.test(k.color) ||
      !str(k.glyph) ||
      !num(k.target, 1, 1000)
    )
      error(
        `collections.${k.id}`,
        "Collection needs a display name, hex color, visual identifier and positive target.",
      );
  try {
    for (const c of pack.cards)
      out.push(
        ...validateCard(c, pack).map((i) => ({
          ...i,
          path: `cards.${c.id}.${i.path}`,
        })),
      );
  } catch {
    error("cards", "Malformed card definition.");
  }
  for (const [id, meta] of Object.entries(pack.metadata ?? {})) {
    if (
      !obj(meta) ||
      !["draft", "provisional", "approved", "archived"].includes(meta.status) ||
      ["description", "flavor", "rarity", "artwork", "notes"].some(
        (k) => typeof (meta as any)[k] !== "string",
      )
    )
      error(`metadata.${id}`, "Invalid card metadata.");
    else if (
      meta.artwork &&
      !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
        meta.artwork,
      )
    )
      error(
        `metadata.${id}.artwork`,
        "Local previews must be raster images. Import SVG through the artwork picker to sanitize it and generate WebP.",
      );
    if (meta.artwork) {
      try {
        fromDataURL(meta.artwork);
      } catch (e) {
        error(`metadata.${id}.artwork`, String(e));
      }
    }
    if (meta.sourceArtwork) {
      try {
        fromDataURL(meta.sourceArtwork);
      } catch (e) {
        error(`metadata.${id}.sourceArtwork`, String(e));
      }
    }
    if (
      meta.artworkApproval !== undefined &&
      !["experimental", "testing", "production"].includes(meta.artworkApproval)
    )
      error(`metadata.${id}.artworkApproval`, "Invalid artwork approval.");
    if (
      meta.artworkId !== undefined &&
      !/^[a-z][a-z0-9-]{0,79}$/.test(meta.artworkId)
    )
      error(
        `metadata.${id}.artworkId`,
        "Artwork identifiers must be lowercase, stable and portable.",
      );
    if (
      meta.artworkRef &&
      !pack.assets?.some(
        (a) =>
          a.id === meta.artworkRef!.id &&
          a.revision === meta.artworkRef!.revision,
      )
    )
      error(
        `metadata.${id}.artworkRef`,
        "Official artwork reference is missing from this content asset manifest.",
      );
  }
  if (pack.assets !== undefined) {
    if (!list(pack.assets))
      error("assets", "Asset manifest must be a bounded list.");
    else {
      const identities = new Set<string>(),
        paths = new Set<string>();
      for (const asset of pack.assets) {
        if (
          !obj(asset) ||
          !str(asset.id) ||
          !/^[a-z][a-z0-9-]{0,79}$/.test(asset.id) ||
          !str(asset.revision) ||
          !/^[a-f0-9]{16}$/.test(asset.revision) ||
          !str(asset.sha256) ||
          !/^[a-f0-9]{64}$/.test(asset.sha256) ||
          !str(asset.path) ||
          !/^assets\/(cards|card-backs|battlefields|icons|animations|branding)\/([a-z0-9._-]+\/)*[a-z0-9._-]+$/.test(
            asset.path,
          ) ||
          asset.path.split("/").includes("..") ||
          !num(asset.bytes, 1, 30 * 1024 * 1024) ||
          !num(asset.width, 1, 20000) ||
          !num(asset.height, 1, 20000) ||
          !["image/webp", "image/png", "image/jpeg", "image/svg+xml"].includes(
            asset.mime,
          ) ||
          !obj(asset.source) ||
          !str(asset.source.path) ||
          !asset.source.path.startsWith("artwork-source/")
        ) {
          error("assets", "Invalid portable artwork manifest entry.");
          continue;
        }
        const key = `${asset.id}@${asset.revision}`;
        if (identities.has(key) || paths.has(asset.path))
          error("assets", "Duplicate asset identity or path.");
        identities.add(key);
        paths.add(asset.path);
      }
    }
  }
  for (const rule of pack.rulesets) {
    if (!obj(rule) || rule.completion !== "twoPasses" || !str(rule.name))
      error(
        "rulesets",
        "Use a named ruleset and the supported two-pass completion condition.",
      );
    out.push(
      ...validateRules(rule.config).map((i) => ({
        ...i,
        path: `rulesets.${rule.id}.${i.path}`,
      })),
    );
    if (
      rule.config?.collection !== "mixed" &&
      !pack.collections.some((c) => c.id === rule.config?.collection)
    )
      error(
        `rulesets.${rule.id}.collection`,
        "Unknown collection restriction.",
      );
  }
  const lib = libraryOf(pack);
  for (const deck of pack.decks) {
    if (!obj(deck) || !str(deck.name) || !strings(deck.cards)) {
      error("decks", "A named deck with card identifiers is required.");
      continue;
    }
    for (const id of deck.cards)
      if (!lib[id])
        error(`decks.${deck.id}`, "Deck references a missing card.");
  }
  if (!out.some((i) => i.severity === "error")) {
    const edges = evolutionEdges(pack.cards);
    const graph = new Map<string, string[]>();
    for (const e of edges.filter((e) => !e.criteria))
      graph.set(e.from, [...(graph.get(e.from) ?? []), e.to]);
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const cycle = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const found = (graph.get(id) ?? []).some(cycle);
      visiting.delete(id);
      visited.add(id);
      return found;
    };
    if (pack.cards.some((c) => cycle(c.id)))
      error(
        "evolution",
        "Circular exact-predecessor evolution relationship. Remove the accidental cycle.",
      );
    for (const c of pack.cards.filter(
      (c) => c.type === "evolution" && c.prerequisite?.tags,
    ))
      if (
        pack.cards.some(
          (p) =>
            p.type === "evolution" &&
            c.prerequisite!.tags!.some((t) => p.tags.includes(t)),
        )
      )
        out.push({
          severity: "warning",
          path: `cards.${c.id}.prerequisite`,
          message:
            "Classification prerequisite includes evolved forms. Review repeatable evolution paths and lineage limits.",
        });
  }
  return out;
}
export function deckAnalysis(
  cards: string[],
  pack: ContentPack,
  config: GameConfig,
) {
  const lib = libraryOf(pack);
  const counts: Record<string, number> = {};
  cards.forEach((id) => (counts[id] = (counts[id] ?? 0) + 1));
  const definitions = cards.flatMap((id) => (lib[id] ? [lib[id]] : []));
  const openings = definitions.filter(
    (c) => c.type === "standard" && c.rank === 1,
  ).length;
  return {
    errors: validateDeck(cards, lib, config),
    counts,
    openings,
    ranks: [1, 2, 3].map(
      (rank) =>
        definitions.filter((c) => c.rank === rank && c.type === "standard")
          .length,
    ),
    types: ["standard", "replacement", "evolution"].map((type) => ({
      type,
      count: definitions.filter((c) => c.type === type).length,
    })),
    abilities: Object.entries(TRIGGERS)
      .map(([id, name]) => ({
        name,
        count: definitions.filter((c) =>
          c.abilities.some((a) => a.trigger === id),
        ).length,
      }))
      .filter((x) => x.count),
    warnings: [
      ...(openings < 5
        ? [
            `Only ${openings} Rank I standard cards; opening opportunities may be scarce.`,
          ]
        : []),
      ...definitions
        .filter(
          (c) =>
            c.type === "evolution" &&
            c.prerequisite?.definitions &&
            !c.prerequisite.definitions.some((id) => cards.includes(id)),
        )
        .map((c) => `${c.name}: no exact predecessor in the deck.`),
    ],
  };
}
