import type { CardLibrary } from "./types";
import { ADVANCED_ENGINE_VERSION } from "./advanced-types";
import { hasAdvancedMechanics } from "./evaluation";

export const OWNER_ENGINE_VERSION = "1.3.1";
export const SUPPORTED_ENGINES = ["1.1.0", ADVANCED_ENGINE_VERSION, OWNER_ENGINE_VERSION];

export function requiresOwnerRules(library: CardLibrary): boolean {
  const cap = (v: unknown): boolean => !!v && typeof v === "object" && (
    ("kind" in v && v.kind === "value" && "value" in v && v.value === "maximumFortification") ||
    Object.values(v).some(cap)
  );
  return Object.values(library).some(c => !!c.collectible || cap(c));
}

export function engineVersionFor(library: CardLibrary): string {
  return requiresOwnerRules(library) ? OWNER_ENGINE_VERSION : hasAdvancedMechanics(library) ? ADVANCED_ENGINE_VERSION : "1.1.0";
}
