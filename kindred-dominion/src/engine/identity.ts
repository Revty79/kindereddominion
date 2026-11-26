import type { CardDefinition } from "./types";

export const gameplayId = (card: CardDefinition): string =>
  card.collectible?.gameplayId ?? card.id;

export function collectibleParts(number: string): { prefix: string; serial: string } | null {
  const match = /^([A-Z]+)([0-9]{3,})$/.exec(number);
  if (!match) return null;
  const serial = match[2].replace(/^0+/, "") || "0";
  if (serial === "0" || serial.padStart(3, "0") !== match[2]) return null;
  return { prefix: match[1], serial };
}

export function compareCollectibles(a: CardDefinition, b: CardDefinition): number {
  const x = a.collectible && collectibleParts(a.collectible.number);
  const y = b.collectible && collectibleParts(b.collectible.number);
  if (!x || !y) return x ? -1 : y ? 1 : a.name.localeCompare(b.name);
  const prefixes = ["N", "M", "A", "U", "C"];
  const px = prefixes.indexOf(x.prefix), py = prefixes.indexOf(y.prefix);
  const order = (px < 0 ? prefixes.length : px) - (py < 0 ? prefixes.length : py);
  return order || x.prefix.localeCompare(y.prefix) || x.serial.length - y.serial.length || x.serial.localeCompare(y.serial) || a.id.localeCompare(b.id);
}

export const matchesDefinition = (card: CardDefinition, definitions: string[]) =>
  definitions.includes(card.id) || definitions.includes(gameplayId(card));

export function gameplayFingerprint(card: CardDefinition): string {
  return JSON.stringify(Object.fromEntries(["kindred", "rank", "power", "type", "tags", "influence", "abilities", "prerequisite", "protections", "maxCopies", "continuous", "scaling", "scoring"].map(k => [k, (card as any)[k]])), (_, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
}
