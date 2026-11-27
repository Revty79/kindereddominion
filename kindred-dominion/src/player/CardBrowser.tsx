import {useMemo,useState} from "react";
import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import {emptyCollectionFilter,filterCollection} from "../ui/collection";
import CollectionFilters from "../ui/CollectionFilters";
import CollectibleCard from "../ui/cards/CollectibleCard";
import CardInspection from "../ui/cards/CardInspection";

export default function CardBrowser({content,quantities,personal=false,onAdd,canAdd}:{content:ContentPack;quantities?:Map<string,number>;personal?:boolean;onAdd?:(id:string)=>void;canAdd?:(id:string)=>boolean}){
  const [query,setQuery]=useState(""),[kindred,setKindred]=useState("all"),[ownership,setOwnership]=useState(personal?"owned":"all"),[filter,setFilter]=useState({...emptyCollectionFilter}),[inspect,setInspect]=useState<string|null>(null);
  const library=useMemo(()=>libraryOf(content),[content]),art=useMemo(()=>artworkMap(content),[content]);
  const owned=(id:string)=>quantities?.get(library[id].collectible?.gameplayId??id)??0;
  const cards=filterCollection(content.cards,kindred,query,filter).filter(card=>ownership==="all"||ownership==="owned"&&owned(card.id)>0||ownership==="missing"&&!owned(card.id));
  return <section className="player-card-browser" aria-label={personal?"Personal card collection":"Published card catalog"}>
    <div className="player-filters"><label>Search cards<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, number or ability"/></label><label>Kindred<select aria-label="Kindred" value={kindred} onChange={e=>setKindred(e.target.value)}><option value="all">All five Kindreds</option>{content.collections.map(k=><option key={k.id}>{k.id}</option>)}</select></label>{quantities&&<label>Ownership<select aria-label="Ownership" value={ownership} onChange={e=>setOwnership(e.target.value)}><option value="all">All published cards</option><option value="owned">Owned cards</option><option value="missing">Not yet owned</option></select></label>}</div>
    <details className="player-more-filters"><summary>More filters and sorting</summary><CollectionFilters cards={content.cards} value={filter} onChange={setFilter}/></details>
    <p className="player-muted" role="status">{cards.length} cards{personal?" in your collection view":" in the published catalog"}</p>
    <div className="player-card-grid">{cards.map(card=><article className="player-catalog-card" key={card.id} data-card-id={card.id}>
      <button className="player-card-inspect" aria-label={`Inspect ${card.collectible?.number??card.id} ${card.name}`} onClick={()=>setInspect(card.id)}><CollectibleCard card={card} library={library} artwork={art[card.id]} scale="hand"/></button>
      {quantities&&<div className={`player-ownership ${owned(card.id)?"is-owned":"is-missing"}`}>{owned(card.id)?`Owned ×${owned(card.id)}`:"Not yet owned"}</div>}
      {onAdd&&<button className="player-add-card" disabled={!owned(card.id)||canAdd?.(card.id)===false} onClick={()=>onAdd(card.id)}>Add {card.collectible?.number} to deck</button>}
    </article>)}</div>
    {!cards.length&&<p className="player-empty">No cards match these filters.</p>}
    {inspect&&library[inspect]&&<CardInspection card={library[inspect]} library={library} artwork={art[inspect]} onClose={()=>setInspect(null)}/>}
  </section>;
}
