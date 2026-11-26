import { baselineContent } from "./baseline";
import { ENGINE_VERSION } from "./types";
import type { ContentPack, EntityType, Transfer, Workspace } from "./types";
import { validatePack } from "./validation";
import { validateScenario } from "../sandbox/scenario";
import { validateRecord } from "../replay/record";
import { ADVANCED_ENGINE_VERSION } from "../engine/advanced-types";
import { hasAdvancedMechanics } from "../engine/evaluation";
import { libraryOf } from "./validation";
import { engineVersionFor, SUPPORTED_ENGINES } from "../engine/versions";
const plain = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function safeTree(value: unknown, depth = 0): void {
  if (depth > 70)
    throw new Error("Import nesting exceeds the supported limit.");
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Unsafe object key in import.");
      safeTree(child, depth + 1);
    }
}
const canonical = (v: any): string =>
  JSON.stringify(v, (_, x) =>
    plain(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );
export function validateWorkspace(value: unknown): void {
  safeTree(value);
  if (
    !plain(value) ||
    value.schema !== 1 ||
    !Array.isArray(value.versions) ||
    !Array.isArray(value.scenarios) ||
    !Array.isArray(value.replays) ||
    !Array.isArray(value.reports) ||
    !Number.isSafeInteger(value.revision)
  )
    throw new Error("Invalid Studio workspace schema.");
  const ws = value as Workspace;
  const seen = new Set<string>();
  for (const version of [ws.working, ...ws.versions]) {
    if (seen.has(version.id))
      throw new Error("Duplicate content-version identifier.");
    seen.add(version.id);
    const errors = validatePack(version).filter(
      (i) =>
        i.severity === "error" &&
        !(version.kind === "draft" && i.path === "evolution"),
    );
    if (errors.length)
      throw new Error(
        `${version.name}: ${errors.map((e) => `${e.path}: ${e.message}`).join("\n")}`,
      );
  }
  const base = ws.versions.find((v) => v.id === "v1.1-baseline");
  if (!base || canonical(base) !== canonical(baselineContent()))
    throw new Error("The immutable original V1.1 version must remain intact.");
  if (!ws.versions.some((v) => v.id === ws.activeVersion))
    throw new Error("Active version is missing.");
  for (const scenario of ws.scenarios) {
    const errors = validateScenario(scenario).filter(
      (i) => i.severity === "error",
    );
    if (errors.length)
      throw new Error(
        `Scenario ${scenario.name}: ${errors.map((e) => e.message).join("; ")}`,
      );
  }
  for (const replay of ws.replays) validateRecord(replay);
  for (const report of ws.reports) validateReport(report);
}
function validateReport(value: any): void {
  if (
    !plain(value) ||
    value.schema !== 1 ||
    !SUPPORTED_ENGINES.includes(value.engineVersion) ||
    !plain(value.request) ||
    !Array.isArray(value.failures) ||
    !Array.isArray(value.examples) ||
    !Number.isSafeInteger(value.attempted) ||
    !Number.isSafeInteger(value.completed) ||
    value.completed + value.timeouts + value.faults + value.invariants !==
      value.attempted
  )
    throw new Error("Invalid simulation report or outcome accounting.");
  const errors = validatePack(value.request.content).filter(
    (i) => i.severity === "error",
  );
  if (errors.length) throw new Error("Simulation content snapshot is invalid.");
  for (const summary of [...value.examples, ...value.failures])
    if (summary.replay) validateRecord(summary.replay);
}
function newestIncludedEngine(data: unknown, fallback: string): string {
  let index = SUPPORTED_ENGINES.indexOf(fallback);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("engineVersion" in value) index = Math.max(index, SUPPORTED_ENGINES.indexOf(String(value.engineVersion)));
    for (const child of Object.values(value)) visit(child);
  };
  visit(data);
  return SUPPORTED_ENGINES[Math.max(0, index)];
}
export function exportTransfer(
  workspace: Workspace,
  type: EntityType,
): Transfer {
  const data =
    type === "backup"
      ? workspace
      : type === "content"
        ? workspace.working
        : ["cards", "collections", "decks", "rulesets"].includes(type)
          ? {
              items: (workspace.working as any)[type],
              metadata:
                type === "cards" ? workspace.working.metadata : undefined,
            }
          : workspace[type as "scenarios" | "replays" | "reports"];
  return {
    format: "kindred-dominion-studio",
    schema: 1,
    engineVersion: newestIncludedEngine(data, workspace.working.engineVersion),
    type,
    exportedAt: new Date().toISOString(),
    data: structuredClone(data),
  };
}
export function parseTransfer(text: string): Transfer {
  if (text.length > 50 * 1024 * 1024)
    throw new Error("Import exceeds the 50 MB safety limit.");
  const value = JSON.parse(text);
  safeTree(value);
  if (
    !plain(value) ||
    value.format !== "kindred-dominion-studio" ||
    value.schema !== 1 ||
    !SUPPORTED_ENGINES.includes(value.engineVersion) ||
    ![
      "cards",
      "collections",
      "decks",
      "rulesets",
      "scenarios",
      "replays",
      "reports",
      "content",
      "backup",
    ].includes(value.type)
  )
    throw new Error("Unsupported transfer format, schema or engine version.");
  return value as Transfer;
}
export function importPreview(workspace: Workspace, transfer: Transfer) {
  const type = transfer.type;
  const items =
    type === "backup"
      ? (transfer.data as Workspace).working?.cards
      : type === "content"
        ? (transfer.data as ContentPack).cards
        : ["cards", "collections", "decks", "rulesets"].includes(type)
          ? (transfer.data as any)?.items
          : transfer.data;
  if (!Array.isArray(items))
    throw new Error("Import does not contain the expected item list.");
  const existing =
    type === "backup" || type === "content"
      ? workspace.working.cards
      : ["cards", "collections", "decks", "rulesets"].includes(type)
        ? (workspace.working as any)[type]
        : (workspace as any)[type];
  return {
    type,
    count: items.length,
    conflicts: items
      .filter((item: any) => existing.some((old: any) => old.id === item?.id))
      .map((item: any) => item.id),
    names: items
      .slice(0, 30)
      .map((item: any) => item?.name ?? item?.id ?? "Unnamed"),
  };
}
export function applyImport(
  workspace: Workspace,
  transfer: Transfer,
  policy: "reject" | "replace",
): Workspace {
  const preview = importPreview(workspace, transfer);
  if (preview.conflicts.length && policy === "reject")
    throw new Error(
      "Import has identifier conflicts. Review the preview and explicitly choose replacement, or cancel.",
    );
  let next = structuredClone(workspace);
  if (transfer.type === "backup") {
    next = structuredClone(transfer.data as Workspace);
    next.revision = workspace.revision + 1;
  } else if (transfer.type === "content") {
    const pack = structuredClone(transfer.data as ContentPack);
    const errors = validatePack(pack).filter((i) => i.severity === "error");
    if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));
    next.working = { ...pack, id: "working", kind: "draft" };
  } else if (
    ["cards", "collections", "decks", "rulesets"].includes(transfer.type)
  ) {
    const { items, metadata } = transfer.data as any;
    const key = transfer.type as "cards" | "collections" | "decks" | "rulesets";
    const conflicts = new Set(items.map((i: any) => i.id));
    (next.working as any)[key] = [
      ...next.working[key].filter((i) => !conflicts.has(i.id)),
      ...structuredClone(items),
    ];
    if (key === "cards")
      next.working.metadata = {
        ...next.working.metadata,
        ...structuredClone(metadata ?? {}),
      };
  } else {
    const key = transfer.type as "scenarios" | "replays" | "reports";
    const items = transfer.data as { id: string }[];
    const conflicts = new Set(items.map((i) => i.id));
    (next as any)[key] = [
      ...next[key].filter((i) => !conflicts.has(i.id)),
      ...structuredClone(items),
    ];
  }
  // Entire candidate is validated BEFORE the caller can commit a single IndexedDB transaction.
  if (
    transfer.type === "cards" &&
    hasAdvancedMechanics(libraryOf(next.working))
  ) {
    next.working.schema = 2;
    next.working.engineVersion = engineVersionFor(libraryOf(next.working));
  }
  validateWorkspace(next);
  return next;
}
