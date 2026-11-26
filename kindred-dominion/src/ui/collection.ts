import type { CardDefinition } from "../engine/types";
import { compareCollectibles, collectibleParts } from "../engine/identity";
export type CollectionFilter = { set: string; placement: string; classification: string; mechanic: string; minPower: string; maxPower: string; sort: string };
export const emptyCollectionFilter: CollectionFilter = { set: "all", placement: "all", classification: "all", mechanic: "all", minPower: "", maxPower: "", sort: "number" };
export function mechanicsOf(card: CardDefinition): string[] {
  return [...new Set([...card.influence.map(i => i.mechanic), ...card.abilities.flatMap(a => [a.trigger, ...a.effects.map(e => e.type)]), ...(card.continuous?.map(x => x.kind === "power" ? "aura" : "protection") ?? []), ...(card.scaling?.length ? ["dynamic"] : []), ...(card.scoring?.length ? ["scoring bonus"] : []), ...(card.protections?.length ? ["protection"] : [])])];
}
export function filterCollection(cards: CardDefinition[], kindred: string, query: string, f: CollectionFilter): CardDefinition[] {
  const number = collectibleParts(query.trim().toUpperCase()) ? query.trim().toUpperCase() : null;
  return cards.filter(c => (kindred === "all" || c.kindred === kindred) && (number ? c.collectible?.number === number : `${c.collectible?.number ?? ""} ${c.id} ${c.name} ${c.text} ${c.type} ${c.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())) &&
    (f.set === "all" || c.collectible?.setId === f.set) && (f.placement === "all" || c.type === f.placement) && (f.classification === "all" || c.tags.includes(f.classification)) && (f.mechanic === "all" || mechanicsOf(c).includes(f.mechanic)) &&
    (f.minPower === "" || c.power >= Number(f.minPower)) && (f.maxPower === "" || c.power <= Number(f.maxPower)))
    .sort(f.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : f.sort === "power" ? (a, b) => a.power - b.power || compareCollectibles(a, b) : compareCollectibles);
}
