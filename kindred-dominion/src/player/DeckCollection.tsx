import {useMemo,useState} from "react";
import type {ContentPack} from "../content/types";
import type {CardDefinition} from "../engine/types";
import {emptyCollectionFilter,filterCollection} from "../ui/collection";
import CollectionFilters from "../ui/CollectionFilters";
import CollectibleCard from "../ui/cards/CollectibleCard";
import type {analyzeDeck} from "./deck-analysis";
import type {EligibilityCatalog} from "../content/eligibility";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";

export default function DeckCollection({content,analysis,eligibility,onAdd,onInspect}:{content:ContentPack;analysis:ReturnType<typeof analyzeDeck>;eligibility:EligibilityCatalog;onAdd:(id:string)=>void;onInspect:(id:string)=>void}){
  const [query,setQuery]=useState(""),[kindred,setKindred]=useState("all"),[ownership,setOwnership]=useState("owned"),[rarity,setRarity]=useState("all"),[collection,setCollection]=useState("all"),[evolution,setEvolution]=useState("all"),[filter,setFilter]=useState({...emptyCollectionFilter}),[page,setPage]=useState(0);
  const library=useMemo(()=>libraryOf(content),[content]),art=useMemo(()=>artworkMap(content),[content]);
  const supports=(c:CardDefinition)=>c.type==="evolution"&&[...analysis.counts.keys()].some(id=>id!==c.id&&library[id]&&(!c.prerequisite?.definitions||c.prerequisite.definitions.includes(id))&&(!c.prerequisite?.tags||c.prerequisite.tags.some(tag=>library[id].tags.includes(tag))));
  const cards=useMemo(()=>filterCollection(content.cards,kindred,query,filter).filter(c=>{
    const counts=analysis.addition(c);
    return (ownership==="all"||ownership==="owned"&&counts.owned>0||ownership==="available"&&counts.allowed)&&
      (rarity==="all"||eligibility.rarities[c.id]===rarity)&&
      (collection==="all"||eligibility.collections.find(k=>k.id===collection)?.cards.includes(c.id)||c.collectible?.setId===collection)&&
      (evolution==="all"||evolution==="evolution"&&c.type==="evolution"||evolution==="supported"&&supports(c)||evolution==="unsupported"&&c.type==="evolution"&&!supports(c)||evolution==="predecessor"&&content.cards.some(e=>e.type==="evolution"&&(e.prerequisite?.definitions?.includes(c.id)||e.prerequisite?.tags?.some(t=>c.tags.includes(t)))));
  }),[content,kindred,query,filter,analysis,ownership,rarity,collection,evolution,eligibility]);
  const filterKey=JSON.stringify([query,kindred,ownership,rarity,collection,evolution,filter]);
  const [previousFilter,setPreviousFilter]=useState(filterKey);
  if(previousFilter!==filterKey){setPreviousFilter(filterKey);setPage(0);}
  const pages=Math.max(1,Math.ceil(cards.length/24)),current=Math.min(page,pages-1),visible=cards.slice(current*24,current*24+24);
  const collections=eligibility.collections.length?eligibility.collections:[...new Set(content.cards.map(c=>c.collectible?.setId).filter(Boolean))].map(id=>({id:id!,name:id!,cards:[],status:"published"}));
  return <section className="deck-available" aria-label="Available collection cards">
    <h2>Choose cards from your collection</h2><p>Copies can be used by several saved decks. Adding a card here never consumes or reserves it.</p>
    <div className="player-filters deck-card-filters">
      <label>Search cards<input type="search" value={query} placeholder="Name, permanent ID or ability" onChange={e=>setQuery(e.target.value)}/></label>
      <label>Kindred<select aria-label="Kindred" value={kindred} onChange={e=>setKindred(e.target.value)}><option value="all">All Kindreds</option>{content.collections.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
      <label>Ownership<select aria-label="Ownership" value={ownership} onChange={e=>setOwnership(e.target.value)}><option value="owned">Owned cards</option><option value="available">Available for addition</option><option value="all">All published cards</option></select></label>
    </div>
    <details className="player-more-filters"><summary>More filters and sorting</summary>
      <div className="player-filters"><label>Collection<select aria-label="Collection" value={collection} onChange={e=>setCollection(e.target.value)}><option value="all">All collections</option>{collections.map(k=><option key={k.id} value={k.id}>{k.name??k.id}</option>)}</select></label>
      <label>Rarity<select aria-label="Rarity" value={rarity} onChange={e=>setRarity(e.target.value)}><option value="all">All configured rarities</option>{[...new Set(Object.values(eligibility.rarities))].sort().map(r=><option key={r}>{r}</option>)}</select></label>
      <label>Evolution eligibility<select aria-label="Evolution eligibility" value={evolution} onChange={e=>setEvolution(e.target.value)}><option value="all">All cards</option><option value="evolution">Evolution cards</option><option value="supported">Predecessor selected</option><option value="unsupported">Predecessor not selected</option><option value="predecessor">Evolution predecessor cards</option></select></label></div>
      <CollectionFilters cards={content.cards} value={filter} onChange={setFilter}/>
    </details>
    <p role="status">{cards.length} matching identities · Showing {visible.length} · Page {current+1} / {pages}</p>
    <div className="player-card-grid deck-card-grid">{visible.map(card=>{const count=analysis.addition(card);return <article className="player-catalog-card" key={card.id} data-card-id={card.id}>
      <button type="button" className="player-card-inspect" aria-label={`Inspect ${card.collectible?.number??card.id} ${card.name}`} onClick={()=>onInspect(card.id)}><CollectibleCard card={card} library={library} artwork={art[card.id]} scale="hand"/></button>
      <p className="deck-card-identity">{card.collectible?.number??card.id} · {card.name}<span>{card.kindred}{eligibility.rarities[card.id]?" · "+eligibility.rarities[card.id]:""}</span></p>
      <dl className="deck-copy-facts"><div><dt>Owned</dt><dd>{count.owned}</dd></div><div><dt>Selected</dt><dd>{count.selected}</dd></div><div><dt>Remaining</dt><dd>{count.remaining}</dd></div><div><dt>Deck limit</dt><dd>{count.limit}</dd></div></dl>
      <button type="button" className="player-add-card" disabled={!count.allowed} title={count.reasons.join(" ")} onClick={()=>onAdd(card.id)}>Add {card.collectible?.number??card.id.toUpperCase()} to deck</button>
      {!count.allowed&&<small className="deck-add-reason">{count.reasons.join(" ")}</small>}
    </article>;})}</div>
    {!cards.length&&<p className="player-empty">No cards match these filters. Broaden the filters or remove a selected copy to make room.</p>}
    <div className="button-row deck-pagination"><button type="button" disabled={!current} onClick={()=>setPage(current-1)}>Previous collection page</button><button type="button" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>Next collection page</button></div>
  </section>;
}
