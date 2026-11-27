import type {analyzeDeck} from "./deck-analysis";
import type {ContentPack} from "../content/types";
export default function DeckSummary({analysis,total,content}:{analysis:ReturnType<typeof analyzeDeck>;total:number;content:ContentPack}){
  const labels=(map:Record<string,number>)=>Object.entries(map).map(([name,n])=>`${name}: ${n}`).join(" · ")||"None selected";
  const name=(id:string)=>{const c=content.cards.find(c=>c.id===id);return c?`${c.collectible?.number??id} ${c.name}`:id.toUpperCase();};
  return <section className="deck-analysis player-panel" aria-label="Deck composition analysis">
    <h2>Formation overview</h2><p>{total}/15 selected · {analysis.unique} unique identities · {analysis.additional} additional copies</p>
    <dl><div><dt>Placement requirements</dt><dd>{labels(analysis.distribution)}</dd></div><div><dt>Kindred composition</dt><dd>{labels(analysis.kindreds)}</dd></div><div><dt>Opening cards</dt><dd>{analysis.openers} rank-one standard cards</dd></div></dl>
    <details><summary>Abilities and evolution support</summary><p>{labels(analysis.abilities)}</p>{analysis.evolutions.length?<ul>{analysis.evolutions.map(e=><li key={e.id}><strong>{name(e.id)}</strong>: {e.supported?`selected predecessor ${e.selected.map(name).join(", ")}`:`no selected predecessor; candidates ${e.possible.map(name).join(", ")||"depend on the printed requirement"}`}. {e.conditions}</li>)}</ul>:<p>No evolution cards selected.</p>}</details>
    <div className="player-deck-legality" role="status"><h3>{analysis.errors.length?"Before battle":"Legal deck preview"}</h3>{analysis.errors.length?<ul>{analysis.errors.map(issue=><li key={issue}>{issue}</li>)}</ul>:<p>Owned quantities and current published rules are satisfied. The server checks again when saving and starting a match.</p>}</div>
    {analysis.warnings.length>0&&<details className="deck-strategy-warnings" open><summary>Strategic guidance — does not block a legal deck</summary><ul>{analysis.warnings.map(issue=><li key={issue}>{issue}</li>)}</ul></details>}
  </section>;
}
