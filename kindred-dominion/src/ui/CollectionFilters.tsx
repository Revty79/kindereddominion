import type { CardDefinition } from "../engine/types";
import { mechanicsOf } from "./collection";
import type { CollectionFilter } from "./collection";
export default function CollectionFilters({ cards, value, onChange }: { cards: CardDefinition[]; value: CollectionFilter; onChange: (v: CollectionFilter) => void }) {
  const select = (key: keyof CollectionFilter, label: string, entries: string[]) => <label>{label}<select aria-label={label} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })}><option value="all">All</option>{entries.map(s => <option key={s}>{s}</option>)}</select></label>;
  return <div className="collection-extra-filters">
    {select("set", "Card set", [...new Set(cards.flatMap(c => c.collectible ? [c.collectible.setId] : []))])}
    {select("placement", "Placement type", ["standard", "replacement", "evolution"])}
    {select("rank", "Placement rank", [...new Set(cards.map(card=>String(card.rank)))].sort((a,b)=>Number(a)-Number(b)))}
    {select("classification", "Creature classification", [...new Set(cards.flatMap(c => c.tags))].sort())}
    {select("mechanic", "Card mechanic", [...new Set(cards.flatMap(mechanicsOf))].sort())}
    <label>Minimum base power<input aria-label="Minimum base power" type="number" min="1" value={value.minPower} onChange={e => onChange({ ...value, minPower: e.target.value })} /></label>
    <label>Maximum base power<input aria-label="Maximum base power" type="number" min="1" value={value.maxPower} onChange={e => onChange({ ...value, maxPower: e.target.value })} /></label>
    <label>Sort cards<select aria-label="Sort cards" value={value.sort} onChange={e => onChange({ ...value, sort: e.target.value })}><option value="number">Collectible number</option><option value="name">Name</option><option value="power">Base power</option></select></label>
  </div>;
}
