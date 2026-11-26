import type { CardDefinition } from "../engine/types";
import type { CardMetadata, ContentPack, Workspace } from "./types";
import { defaultMetadata } from "./baseline";
import { ID, validateCard, validatePack } from "./validation";
import { validateDeck } from "../engine/game";
import { DEFAULT_CONFIG } from "../engine/config";
import { libraryOf } from "./validation";
export function saveCard(
  pack: ContentPack,
  card: CardDefinition,
  metadata: CardMetadata,
  originalId: string | null,
): ContentPack {
  if (originalId && originalId !== card.id)
    throw new Error(
      "Internal card identifiers are immutable. Change the display name, or duplicate the card.",
    );
  if (!originalId && pack.cards.some((c) => c.id === card.id))
    throw new Error("This card identifier already exists.");
  const next = structuredClone(pack);
  const index = next.cards.findIndex((c) => c.id === originalId);
  if (index < 0) next.cards.push(structuredClone(card));
  else next.cards[index] = structuredClone(card);
  const errors = validateCard(card, next).filter((i) => i.severity === "error");
  if (errors.length)
    throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  next.metadata[card.id] = structuredClone(metadata);
  const metadataErrors = validatePack(next).filter(
    (i) =>
      i.severity === "error" &&
      (i.path.startsWith(`metadata.${card.id}`) || i.path === "assets"),
  );
  if (metadataErrors.length)
    throw new Error(
      metadataErrors.map((e) => `${e.path}: ${e.message}`).join("\n"),
    );
  return next;
}
export function duplicateCard(
  pack: ContentPack,
  id: string,
  newId: string,
): { card: CardDefinition; metadata: CardMetadata } {
  if (!ID.test(newId) || pack.cards.some((c) => c.id === newId))
    throw new Error("Choose a new valid identifier.");
  const card = structuredClone(pack.cards.find((c) => c.id === id)!);
  if (!card) throw new Error("Card not found.");
  card.id = newId;
  card.name += " copy";
  card.abilities.forEach((a, i) => (a.id = `${newId}-ability-${i + 1}`));
  return {
    card,
    metadata: {
      ...defaultMetadata(),
      ...structuredClone(pack.metadata[id]),
      status: "draft",
    },
  };
}
export function checkpoint(
  workspace: Workspace,
  name: string,
  kind: "checkpoint" | "testing" = "checkpoint",
): Workspace {
  if (!name.trim()) throw new Error("Name this content checkpoint.");
  const errors = validatePack(workspace.working).filter(
    (i) => i.severity === "error",
  );
  if (errors.length)
    throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  const pack = structuredClone(workspace.working);
  pack.id = `version-${workspace.revision + 1}-${Date.now().toString(36)}`;
  pack.name = name.trim();
  pack.kind = kind;
  pack.createdAt = new Date().toISOString();
  return { ...workspace, versions: [...workspace.versions, pack] };
}
export function restoreDraft(workspace: Workspace, version: string): Workspace {
  const pack = workspace.versions.find((v) => v.id === version);
  if (!pack) throw new Error("Version not found.");
  return {
    ...workspace,
    versions: [
      ...workspace.versions,
      {
        ...structuredClone(workspace.working),
        id: `before-restore-${workspace.revision}-${Date.now().toString(36)}`,
        name: `Automatic recovery before restoring ${pack.name}`,
        kind: "draft",
        createdAt: new Date().toISOString(),
      },
    ],
    working: {
      ...structuredClone(pack),
      id: "working",
      name: `Draft from ${pack.name}`,
      kind: "draft",
    },
  };
}
export function activateVersion(workspace: Workspace, id: string): Workspace {
  const pack = workspace.versions.find((p) => p.id === id);
  if (!pack || pack.kind === "archived")
    throw new Error("Select an available saved version.");
  const errors = validatePack(pack).filter((i) => i.severity === "error");
  if (errors.length) throw new Error("Invalid content cannot be activated.");
  const playable = pack.decks.some(
    (d) => validateDeck(d.cards, libraryOf(pack), DEFAULT_CONFIG).length === 0,
  );
  if (!playable)
    throw new Error("Normal gameplay needs a 15-card deck in this version.");
  return { ...workspace, activeVersion: id };
}
export function compareContent(before: ContentPack, after: ContentPack) {
  const changes: { type: string; id: string; change: string }[] = [];
  for (const type of ["cards", "collections", "decks", "rulesets"] as const) {
    const old = new Map(before[type].map((x) => [x.id, x]));
    for (const item of after[type]) {
      const prior = old.get(item.id);
      if (!prior) changes.push({ type, id: item.id, change: "added" });
      else if (
        JSON.stringify(prior) !== JSON.stringify(item) ||
        (type === "cards" &&
          JSON.stringify(before.metadata[item.id]) !==
            JSON.stringify(after.metadata[item.id]))
      )
        changes.push({ type, id: item.id, change: "changed" });
      old.delete(item.id);
    }
    for (const id of old.keys()) changes.push({ type, id, change: "removed" });
  }
  return changes;
}
