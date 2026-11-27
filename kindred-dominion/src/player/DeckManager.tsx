import {useMemo,useState} from "react";
import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {validateDeck} from "../engine/game";
import {DEFAULT_CONFIG} from "../engine/config";
import {artworkMap} from "../assets/references";
import CollectibleCard from "../ui/cards/CollectibleCard";
import CardInspection from "../ui/cards/CardInspection";
import CardBrowser from "./CardBrowser";
import {api} from "../account/api";

export default function DeckManager({content,decks,player,quantities,onSaved,run,busy}:{content:ContentPack;decks:any[];player:any;quantities:Map<string,number>;onSaved:()=>Promise<unknown>;run:(fn:()=>Promise<void>)=>void;busy:boolean}){
  const [edit,setEdit]=useState<any>(null),[name,setName]=useState(""),[cards,setCards]=useState<string[]>([]),[scoring,setScoring]=useState("classic"),[mode,setMode]=useState("standard"),[kindred,setKindred]=useState("mixed"),[inspect,setInspect]=useState<string|null>(null);
  const library=useMemo(()=>libraryOf(content),[content]),art=useMemo(()=>artworkMap(content),[content]);
  function open(deck?:any){setEdit(deck??{id:null});setName(deck?.name??"");setCards(deck?.cards??[]);setScoring(deck?.config.scoring??"classic");setMode(deck?.config.mode??"standard");setKindred(deck?.config.collection??"mixed");}
  const composition=cards.reduce((map,id)=>(map.set(id,(map.get(id)??0)+1),map),new Map<string,number>());
  const config={...structuredClone(DEFAULT_CONFIG),scoring,mode:mode as "standard"|"free",collection:kindred};
  const errors=[...validateDeck(cards,library,config),...[...composition].filter(([id,count])=>count>(quantities.get(library[id]?.collectible?.gameplayId??id)??0)).map(([id])=>`${library[id]?.name??id}: more copies selected than owned.`)];
  return <section>
    <div className="player-section-heading"><div><h1>Deck Builder</h1><p>Build a formation from your own collection.</p></div><button className="primary" onClick={()=>open()}>Create deck</button></div>
    {!edit?<><div className="player-deck-grid">{decks.map(deck=><article className="player-panel" key={deck.id}><h2>{deck.name}</h2><p>{deck.cards.length} / 15 cards · {deck.config.mode} · {deck.config.scoring}</p><p className="player-muted">{deck.id===player.defaultDeckId?"Selected for battle":"Saved deck"}{deck.testingAccess?" · Development only":""}</p><div className="player-deck-fan">{deck.cards.slice(0,3).map((id:string,index:number)=>library[id]&&<div key={index}><CollectibleCard card={library[id]} library={library} artwork={art[id]} scale="battlefield"/></div>)}</div><div className="button-row"><button onClick={()=>open(deck)}>Edit {deck.name}</button><button disabled={busy} onClick={()=>run(async()=>{await api(`/decks/${deck.id}/duplicate`,"POST",{});await onSaved();})}>Duplicate</button><button disabled={busy} onClick={()=>run(async()=>{await api(`/decks/${deck.id}/default`,"POST",{});await onSaved();})}>Select for battle</button><button disabled={busy} onClick={()=>{if(confirm(`Delete ${deck.name}? Its match history will remain.`))run(async()=>{await api(`/decks/${deck.id}`,"DELETE");await onSaved();});}}>Delete</button></div></article>)}</div>{!decks.length&&<p className="player-empty">Choose a starter collection, then create your first deck.</p>}</>:<>
      <form className="player-panel player-deck-editor" onSubmit={e=>{e.preventDefault();run(async()=>{await api(edit.id?`/decks/${edit.id}`:"/decks",edit.id?"PUT":"POST",{name,cards,config:{scoring,mode,collection:kindred},...(edit.id?{revision:edit.revision}:{})});setEdit(null);await onSaved();});}}>
        <div className="player-filters"><label>Deck name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></label><label>Scoring<select value={scoring} onChange={e=>setScoring(e.target.value)}><option value="classic">Classic</option><option value="domination">Domination</option></select></label><label>Format<select value={mode} onChange={e=>setMode(e.target.value)}><option value="standard">Standard</option><option value="free">Free Play</option></select></label><label>Kindred rule<select value={kindred} onChange={e=>setKindred(e.target.value)}><option value="mixed">Mixed Kindreds</option>{content.collections.map(k=><option key={k.id}>{k.id}</option>)}</select></label></div>
        <div className="button-row"><button type="button" onClick={()=>{const starter=content.decks.find(d=>d.collection===player.startingKindred);if(starter){setCards(starter.cards);if(!name)setName(`${starter.name} custom`);}}}>Use my recommended starter</button><button className="primary" disabled={busy||errors.length>0}>Save deck</button><button type="button" onClick={()=>setEdit(null)}>Close editor</button></div>
        <h2>{cards.length} / 15 cards</h2><div className="player-deck-composition">{[...composition].map(([id,count])=><div key={id}><button type="button" className="player-card-inspect" aria-label={`Inspect selected ${library[id]?.name}`} onClick={()=>setInspect(id)}><CollectibleCard card={library[id]} library={library} artwork={art[id]} scale="hand"/></button><div className="player-quantity-controls"><button type="button" aria-label={`Remove ${library[id].name}`} onClick={()=>setCards(cards.filter((card,index)=>index!==cards.indexOf(id)))}>−</button><b>{count}</b><button type="button" aria-label={`Add another ${library[id].name}`} disabled={cards.length>=15||count>=(quantities.get(id)??0)} onClick={()=>setCards([...cards,id])}>+</button></div></div>)}</div>
        <div className="player-deck-legality" role="status">{errors.length?<><b>Before battle</b><ul>{errors.map((error,i)=><li key={i}>{error}</li>)}</ul></>:<p>Legal deck · Owned quantities and all format rules satisfied.</p>}</div>
      </form>
      <h2>Choose cards from your collection</h2><CardBrowser content={content} quantities={quantities} personal onAdd={id=>{if(cards.length<15&&(composition.get(id)??0)<(quantities.get(id)??0))setCards([...cards,id]);}}/>
    </>}
    {inspect&&<CardInspection card={library[inspect]} library={library} artwork={art[inspect]} onClose={()=>setInspect(null)}/>}
  </section>;
}
