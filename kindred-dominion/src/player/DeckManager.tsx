import {useEffect,useMemo,useRef,useState} from "react";
import type {ContentPack} from "../content/types";
import type {EligibilityCatalog} from "../content/eligibility";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import CollectibleCard from "../ui/cards/CollectibleCard";
import CardInspection from "../ui/cards/CardInspection";
import {api} from "../account/api";
import {analyzeDeck,emptyEligibility,type DeckDocument} from "./deck-analysis";
import {deckEditorKey,deviceDeckEdits,removeDeviceEdit} from "./deck-recovery";
import {useDeckWorkspace} from "./useDeckWorkspace";
import DeckCollection from "./DeckCollection";
import DeckSummary from "./DeckSummary";
import "./deck-builder.css";

type Metadata={eligibility:EligibilityCatalog;recommendations:any[];contentVersion:string};
type Props={content:ContentPack;decks:any[];player:any;quantities:Map<string,number>;formats?:{id:string;name:string;description:string}[];onSaved:()=>Promise<unknown>;run:(fn:()=>Promise<void>)=>void;busy:boolean};
export default function DeckManager({content,decks,player,quantities,onSaved,run,busy}:Props){
  const [editing,setEditing]=useState<any>(null),[metadata,setMetadata]=useState<Metadata|null>(null),[error,setError]=useState(""),[template,setTemplate]=useState(""),[recoveries,setRecoveries]=useState(()=>deviceDeckEdits(player.id));
  const library=useMemo(()=>libraryOf(content),[content]),art=useMemo(()=>artworkMap(content),[content]),initial=useRef(false);
  useEffect(()=>{let live=true;api<Metadata>("/deck-builder").then(v=>{if(live){setMetadata(v);setTemplate(v.recommendations.find(r=>r.collection===player.startingKindred)?.id??v.recommendations[0]?.id??"");}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[player.id]);
  useEffect(()=>{if(initial.current||!decks.length)return;initial.current=true;try{const id=sessionStorage.getItem(deckEditorKey(player.id)),existing=decks.find(d=>d.id===id);if(existing)setEditing(existing);}catch{/* Server working copies remain available without device storage. */}},[decks,player.id]);
  function open(deck:any){try{sessionStorage.setItem(deckEditorKey(player.id),deck.id);}catch{}setEditing(deck);setError("");}
  function close(){try{sessionStorage.removeItem(deckEditorKey(player.id));}catch{}setEditing(null);setRecoveries(deviceDeckEdits(player.id));}
  async function committed(){try{await onSaved();}catch(e){setError("The deck was saved. Refresh the list when connected: "+(e as Error).message);}finally{close();}}
  async function create(document?:DeckDocument){const d=await api("/decks","POST",{...(document??{name:"New formation",cards:[],config:{scoring:"classic",mode:"standard",collection:"mixed"},testingAccess:false,formatId:null}),draft:true});await onSaved();open(d);}
  async function refresh(){await onSaved();setMetadata(await api("/deck-builder"));setRecoveries(deviceDeckEdits(player.id));}
  const selectedTemplate=metadata?.recommendations.find(r=>r.id===template);
  return <section className="deck-builder">
    <div className="player-section-heading"><div><p className="player-eyebrow">YOUR COLLECTION, YOUR FORMATION</p><h1>Deck Builder</h1><p>Your collection holds every owned copy. Each standard battle deck uses exactly fifteen.</p></div>{!editing&&<button className="primary" disabled={busy} onClick={()=>run(()=>create())}>Create deck</button>}</div>
    {error&&<p role="alert">{error}</p>}
    {!editing?<>
      <section className="player-panel deck-template-choice" aria-label="Recommended starter configurations"><h2>Start with a recommended formation</h2><p>Templates use the published starter configurations and do not grant cards. Missing quantities remain visible in the resulting draft.</p>
        <label>Recommended formation<select aria-label="Recommended formation" value={template} disabled={!metadata} onChange={e=>setTemplate(e.target.value)}>{metadata?.recommendations.map(r=><option key={r.id} value={r.id}>{r.name} · {r.collection}</option>)}</select></label>
        {selectedTemplate&&<p>{selectedTemplate.cards.length} cards · Recommended formation</p>}
        <button disabled={busy||!selectedTemplate} onClick={()=>run(()=>create({name:(selectedTemplate.name+" custom").slice(0,80),cards:selectedTemplate.cards,config:{scoring:"classic",mode:"standard",collection:selectedTemplate.collection},formatId:null,testingAccess:false}))}>Create from recommended formation</button><button disabled={busy} onClick={()=>run(refresh)}>Refresh collection and decks</button>
      </section>
      <div className="player-deck-grid">{decks.map(deck=><article className="player-panel" key={deck.id} data-deck-id={deck.id}>
        <h2>{deck.name}</h2><p>{deck.cards.length} / 15 cards · {deck.config.mode} · {deck.config.scoring}</p>
        <p className="player-muted">{deck.draft?"Draft: finish before battle":deck.legal?deck.id===player.defaultDeckId?"Selected for battle":"Ready for battle":"Needs attention before battle"}{deck.testingAccess?" · Development only":""}</p>
        <p>{Object.entries(deck.cards.reduce((m:Record<string,number>,id:string)=>{const k=library[id]?.kindred??"Unavailable";m[k]=(m[k]??0)+1;return m;},{})).map(([k,n])=>`${k}: ${n}`).join(" · ")||"Empty draft"}</p>
        {deck.workspace&&<p className="deck-working-badge">Working edits saved separately: {deck.workspace.name||"Unnamed formation"} · {deck.workspace.count}/15. The saved battle deck above is unchanged.</p>}
        {deck.legality?.length>0&&<details open><summary>Repair before battle</summary><ul>{deck.legality.map((issue:string,i:number)=><li key={i}>{issue}</li>)}</ul></details>}
        <div className="player-deck-fan">{deck.cards.slice(0,3).map((id:string,index:number)=>library[id]&&<div key={index}><CollectibleCard card={library[id]} library={library} artwork={art[id]} scale="battlefield"/></div>)}</div>
        <div className="button-row"><button onClick={()=>open(deck)}>Edit {deck.name}</button><button onClick={()=>open(deck)}>Rename</button><button disabled={busy} onClick={()=>run(async()=>{await api(`/decks/${deck.id}/duplicate`,"POST",{revision:deck.revision});await onSaved();})}>Duplicate</button><button disabled={busy||!deck.legal} onClick={()=>run(async()=>{await api(`/decks/${deck.id}/default`,"POST",{});await onSaved();})}>Select for battle</button><button disabled={busy} onClick={()=>{if(confirm(`Delete ${deck.name}${deck.workspace?" and its recoverable server working edits":""}? Your collection and match history will remain.`))run(async()=>{await api(`/decks/${deck.id}`,"DELETE",{revision:deck.revision,workspaceRevision:deck.workspace?.revision??0});await onSaved();});}}>Delete</button></div>
      </article>)}</div>
      {!decks.length&&<p className="player-empty">Create an empty draft, or begin with a recommended formation.</p>}
      {recoveries.length>0&&<details className="player-panel"><summary>Device edit recovery ({recoveries.length})</summary><p>These account-scoped edits may not have reached the server. Review before replacing anything.</p><ul>{recoveries.map(r=><li key={r.key}>{r.document.name||"Unnamed formation"} · {r.document.cards.length}/15 · {new Date(r.at).toLocaleString()} <button onClick={()=>{const d=decks.find(d=>d.id===r.deckId);if(d)open(d);else run(async()=>{await create(r.document);removeDeviceEdit(r);setRecoveries(deviceDeckEdits(player.id));});}}>{decks.some(d=>d.id===r.deckId)?"Open recovery":"Recover as separate draft"}</button></li>)}</ul></details>}
    </>:<DeckEditor key={editing.id} deck={decks.find(d=>d.id===editing.id)??editing} player={player} content={content} quantities={quantities} metadata={metadata} onClose={close} onCommitted={committed} onRefresh={refresh} onFork={create} onBackgroundSaved={()=>void onSaved().catch(()=>{})}/>}
  </section>;
}

function DeckEditor({deck,player,content,quantities,metadata,onClose,onCommitted,onRefresh,onFork,onBackgroundSaved}:{deck:any;player:any;content:ContentPack;quantities:Map<string,number>;metadata:Metadata|null;onClose:()=>void;onCommitted:()=>Promise<void>;onRefresh:()=>Promise<void>;onFork:(d:DeckDocument)=>Promise<void>;onBackgroundSaved:()=>void}){
  const workspace=useDeckWorkspace(player.id,deck),doc=workspace.document,eligibility=metadata?.eligibility??emptyEligibility;
  const analysis=useMemo(()=>analyzeDeck(doc,content,quantities,eligibility),[doc.cards,doc.config,doc.formatId,content,quantities,eligibility]),library=useMemo(()=>libraryOf(content),[content]),art=useMemo(()=>artworkMap(content),[content]);
  const [inspect,setInspect]=useState<string|null>(null),[publishing,setPublishing]=useState(false),[error,setError]=useState("");
  const nameInput=useRef<HTMLInputElement>(null),focused=useRef(false);
  useEffect(()=>{if(!focused.current&&workspace.current.loaded){focused.current=true;nameInput.current?.focus();}},[workspace.status]);
  const alter=(patch:Partial<DeckDocument>)=>workspace.change({...doc,...patch});
  function add(id:string){const card=library[id];if(card&&analysis.addition(card).allowed)alter({cards:[...doc.cards,id]});}
  function remove(id:string){const index=doc.cards.indexOf(id);if(index>=0)alter({cards:doc.cards.filter((_,i)=>i!==index)});}
  async function publish(draft:boolean){setPublishing(true);setError("");try{await workspace.flush();const current=workspace.current;await api(`/decks/${deck.id}`,"PUT",{...current.document,draft,revision:current.baseRevision,workspaceRevision:current.revision});workspace.committed();await onCommitted();}catch(e){setError((e as Error).message);}finally{setPublishing(false);}}
  async function fork(){setPublishing(true);try{await onFork({...workspace.current.document,name:((workspace.current.document.name.trim()||"Recovered formation")+" copy").slice(0,80)});workspace.committed();}catch(e){setError((e as Error).message);}finally{setPublishing(false);}}
  const recommendation=metadata?.recommendations.find(r=>r.collection===player.startingKindred);
  const statusText:Record<string,string>={loading:"Loading server working edits…",saved:"Working edits saved on server",unsaved:"Unsaved changes — queued for server",saving:"Saving working edits…",offline:"Not saved on server — device recovery retained where available",conflict:"Conflict — your edits have not overwritten another session"};
  return <>
    <div className="deck-save-state" role="status" data-save-state={workspace.status}><strong>{statusText[workspace.status]}</strong><span>Saved battle deck revision {deck.revision}. Working edits do not change it until you choose Save deck or Save draft.</span></div>
    {(workspace.error||error)&&<p role="alert">{error||workspace.error}</p>}{workspace.deviceError&&<p role="alert">{workspace.deviceError}</p>}
    {workspace.status==="conflict"&&<section className="player-panel deck-conflict"><h2>Keep both versions</h2><p>Review the server edits or save your version as a separate draft. The current saved battle deck is preserved.</p><button type="button" disabled={publishing} onClick={()=>{if(confirm("Review the server version? Your current device edit remains in recovery."))void workspace.load();}}>Review current server edits</button><button type="button" disabled={publishing||!doc.name.trim()} onClick={()=>void fork()}>Save my edits as separate draft</button></section>}
    <form className="deck-edit-form" onSubmit={e=>{e.preventDefault();const draft=((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value==="draft";void publish(draft);}}>
      <fieldset className="player-panel deck-settings" disabled={publishing||workspace.status==="loading"}>
        <legend>Formation settings</legend><div className="player-filters">
          <label>Deck name<input ref={nameInput} value={doc.name} required maxLength={80} onChange={e=>alter({name:e.target.value})}/></label>
          <label>Scoring<select aria-label="Scoring" value={doc.config.scoring} onChange={e=>alter({config:{...doc.config,scoring:e.target.value as "classic"|"domination"}})}><option value="classic">Classic</option><option value="domination">Domination</option></select></label>
          <label>Format<select aria-label="Format" value={doc.config.mode} onChange={e=>alter({config:{...doc.config,mode:e.target.value as "standard"|"free"}})}><option value="standard">Standard</option><option value="free">Free Play</option></select></label>
          <label>Eligibility<select aria-label="Deck eligibility" value={doc.formatId??""} onChange={e=>alter({formatId:e.target.value||null})}><option value="">Default playing eligibility</option>{doc.formatId&&!eligibility.formats.some(f=>f.id===doc.formatId)&&<option value={doc.formatId}>Unavailable: {doc.formatId}</option>}{eligibility.formats.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>Kindred rule<select aria-label="Kindred rule" value={doc.config.collection} onChange={e=>alter({config:{...doc.config,collection:e.target.value}})}><option value="mixed">Mixed Kindreds</option>{content.collections.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
        </div>
        <div className="button-row"><button type="button" disabled={!recommendation} onClick={()=>{if(doc.cards.length&&!confirm("Replace the working card list with your recommended starter? The saved battle deck stays unchanged."))return;alter({cards:[...recommendation.cards],name:doc.name==="New formation"?(recommendation.name+" custom").slice(0,80):doc.name});}}>Use my recommended starter</button><button className="primary" name="saveState" value="ready" disabled={!workspace.current.loaded||workspace.status==="conflict"||!metadata||analysis.errors.length>0||!doc.name.trim()}>Save deck</button><button name="saveState" value="draft" disabled={!workspace.current.loaded||workspace.status==="conflict"||!doc.name.trim()}>Save draft</button><button type="button" onClick={()=>{void workspace.flush().then(onBackgroundSaved).catch(()=>{});onClose();}}>Close editor</button></div>
      </fieldset>
      <div className="deck-edit-toolbar"><strong className="deck-card-counter" aria-live="polite">{doc.cards.length}/15 cards selected</strong><button type="button" disabled={publishing} onClick={()=>void workspace.flush().catch(()=>{})}>Save working edits now</button><button type="button" disabled={publishing} onClick={()=>void onRefresh().catch(e=>setError(e.message))}>Refresh owned quantities</button>{workspace.status==="offline"&&<button type="button" onClick={()=>void (workspace.current.loaded?workspace.flush():workspace.load()).catch(()=>{})}>Retry connection</button>}<button type="button" disabled={publishing||workspace.status==="conflict"||!workspace.current.loaded} onClick={()=>{if(confirm("Discard these working edits and return to the last saved deck?"))void workspace.discard().catch(e=>setError(e.message));}}>Discard working edits</button></div>
      <fieldset disabled={publishing||workspace.status==="loading"||!metadata} className="deck-edit-columns">
        <aside className="deck-selected player-panel" aria-label="Selected battle deck cards"><h2>{doc.cards.length} / 15 cards</h2><p>Selected copies · Each − removes one copy.</p><div className="deck-selected-scroll">
          {[...analysis.counts].map(([id,count])=>{const card=library[id],facts=card?analysis.addition(card):null;return <article key={id} className="deck-selected-card" data-selected-card={id}>
            <button type="button" className="player-card-inspect" aria-label={`Inspect selected ${card?.name??id}`} disabled={!card} onClick={()=>setInspect(id)}>{card?<CollectibleCard card={card} library={library} artwork={art[id]} scale="hand"/>:<span className="player-unavailable-card">{id.toUpperCase()} is unavailable in the current catalog. It remains selected until you explicitly remove it.</span>}</button>
            <div><strong>{card?.collectible?.number??id.toUpperCase()} · {card?.name??"Unavailable identity"}</strong><p>Selected {count} · Owned {facts?.owned??quantities.get(id)??0} · Limit {facts?.limit??"Unavailable"}</p><div className="player-quantity-controls"><button type="button" aria-label={`Remove ${card?.name??id}`} onClick={()=>remove(id)}>−</button><b aria-label={`${count} selected copies`}>{count}</b><button type="button" aria-label={`Add another ${card?.name??id}`} disabled={!facts?.allowed} title={facts?.reasons.join(" ")} onClick={()=>add(id)}>+</button></div></div>
          </article>;})}
          {!doc.cards.length&&<p className="player-empty">Your draft is empty. Add individual owned copies from the collection.</p>}
        </div></aside>
        <DeckCollection content={content} analysis={analysis} eligibility={eligibility} onAdd={add} onInspect={setInspect}/>
      </fieldset>
      <DeckSummary analysis={analysis} total={doc.cards.length} content={content}/>
    </form>
    {workspace.recovery.length>0&&<details className="player-panel"><summary>Other recoverable device edits ({workspace.recovery.length})</summary><ul>{workspace.recovery.map(r=><li key={r.key}>{r.document.name||"Unnamed formation"} · {r.document.cards.length}/15 · {new Date(r.at).toLocaleString()} <button onClick={()=>workspace.recover(r)}>Review device edit</button></li>)}</ul></details>}
    {inspect&&library[inspect]&&<CardInspection card={library[inspect]} library={library} artwork={art[inspect]} onClose={()=>setInspect(null)} context="Inspecting a collection card; working edits remain in place." details={<><h2>{library[inspect].name}</h2><p>{library[inspect].collectible?.number??inspect} · {library[inspect].kindred} · {eligibility.rarities[inspect]??"Rarity not configured"}</p><p>{library[inspect].type} · Placement rank {library[inspect].rank} · Printed power {library[inspect].power}</p><p>{library[inspect].text}</p><p>Owned {analysis.addition(library[inspect]).owned} · Selected {analysis.addition(library[inspect]).selected} · Remaining {analysis.addition(library[inspect]).remaining} · Applicable copy limit {analysis.addition(library[inspect]).limit}</p></>}/>}
  </>;
}
