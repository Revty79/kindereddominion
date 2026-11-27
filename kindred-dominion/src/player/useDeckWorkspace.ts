import {useCallback,useEffect,useRef,useState} from "react";
import {api,ApiRequestError} from "../account/api";
import {deckDocumentOf,type DeckDocument} from "./deck-analysis";
import {deviceDeckEdits,removeDeviceEdit,recoveryPrefix,type DeviceDeckEdit} from "./deck-recovery";

export function useDeckWorkspace(playerId:string,deck:any){
  const [document,setDocument]=useState<DeckDocument>(()=>deckDocumentOf(deck)),[status,setStatus]=useState("loading"),[error,setError]=useState(""),[deviceError,setDeviceError]=useState(""),[recovery,setRecovery]=useState<DeviceDeckEdit[]>([]);
  const state=useRef({document:deckDocumentOf(deck),baseRevision:deck.revision,revision:0,dirty:false,blocked:false,loaded:false});
  const loadGeneration=useRef(0),deviceFailed=useRef(false);
  const mounted=useRef(false),flight=useRef<Promise<void>|null>(null),key=useRef(recoveryPrefix(playerId,deck.id)+crypto.randomUUID()),restored=useRef<DeviceDeckEdit|null>(null);
  const present=useCallback((fn:()=>void)=>{if(mounted.current)fn();},[]);
  const backup=useCallback(()=>{const s=state.current;try{localStorage.setItem(key.current,JSON.stringify({schema:1,deckId:deck.id,document:s.document,baseRevision:s.baseRevision,revision:s.revision,at:Date.now()}));deviceFailed.current=false;present(()=>setDeviceError(""));}catch{deviceFailed.current=true;present(()=>setDeviceError("Device recovery storage is unavailable or full. Keep this page open until the server saves your changes."));}},[deck.id,present]);
  const clearBackup=useCallback(()=>{try{localStorage.removeItem(key.current);if(restored.current)removeDeviceEdit(restored.current);}catch{/* Retain harmless recovery entries when storage is unavailable. */}},[]);
  const flush=useCallback(async function flush():Promise<void>{
    if(flight.current){await flight.current;if(state.current.dirty&&!state.current.blocked)return flush();return;}
    const s=state.current;if(!s.loaded||!s.dirty)return;
    if(s.blocked)throw Error("Review the server conflict before saving; your device edit remains available.");
    const sent=structuredClone(s.document),signature=JSON.stringify(sent),revision=s.revision,baseRevision=s.baseRevision;
    present(()=>{setStatus("saving");setError("");});
    const pending=(async()=>{
      try{
        const result=await api(`/decks/${deck.id}/workspace`,"PUT",{revision,baseRevision,document:sent},{keepalive:true});
        s.revision=result.revision;
        s.dirty=JSON.stringify(s.document)!==signature;
        if(s.dirty)backup();else clearBackup();
        present(()=>{setStatus(s.dirty?"unsaved":"saved");setRecovery(deviceDeckEdits(playerId,deck.id).filter(r=>r.key!==key.current));});
      }catch(e){
        s.blocked=e instanceof ApiRequestError&&e.status===409;backup();
        present(()=>{setStatus(s.blocked?"conflict":"offline");setError((e as Error).message);});throw e;
      }
    })();flight.current=pending;
    try{await pending;}finally{flight.current=null;}
    if(s.dirty&&!s.blocked&&mounted.current)return flush();
  },[backup,clearBackup,deck.id,playerId,present]);
  const load=useCallback(async()=>{
    const ticket=++loadGeneration.current;
    if(flight.current)await flight.current.catch(()=>{});
    // Keep local unsent edits as a distinct recoverable copy before loading a server copy.
    if(state.current.dirty)backup();
    present(()=>{setStatus("loading");setError("");});
    try{
      const r=await api(`/decks/${deck.id}/workspace`),entries=deviceDeckEdits(playerId,deck.id);
      if(!mounted.current||ticket!==loadGeneration.current)return;
      const serverDocument=deckDocumentOf(r.document);
      state.current={document:serverDocument,baseRevision:r.baseRevision,revision:r.revision,dirty:false,blocked:r.stale,loaded:true};
      const recovered=entries.find(e=>e.baseRevision===r.baseRevision&&e.revision===r.revision&&JSON.stringify(e.document)!==JSON.stringify(serverDocument));
      if(recovered&&!r.stale){state.current.document=recovered.document;state.current.dirty=true;restored.current=recovered;backup();}
      setDocument(state.current.document);setRecovery(entries);setStatus(r.stale?"conflict":recovered?"unsaved":"saved");
      if(r.stale)setError("The saved deck changed. Review the current saved version before applying working edits.");
    }catch(e){present(()=>{setStatus("offline");setError((e as Error).message);setRecovery(deviceDeckEdits(playerId,deck.id));});}
  },[backup,deck.id,playerId,present]);
  useEffect(()=>{
    mounted.current=true;void load();
    const save=()=>{void flush().catch(()=>{});};
    const retry=()=>{void (state.current.loaded?flush():load()).catch(()=>{});};
    const before=(event:BeforeUnloadEvent)=>{if(state.current.dirty&&deviceFailed.current){event.preventDefault();event.returnValue="";}};
    window.addEventListener("online",retry);window.addEventListener("pagehide",save);window.addEventListener("beforeunload",before);
    return()=>{mounted.current=false;window.removeEventListener("online",retry);window.removeEventListener("pagehide",save);window.removeEventListener("beforeunload",before);void flush().catch(()=>{});};
  },[load,flush]);
  useEffect(()=>{if(!state.current.dirty||state.current.blocked)return;const timer=setTimeout(()=>void flush().catch(()=>{}),650);return()=>clearTimeout(timer);},[document,flush]);
  function change(next:DeckDocument){state.current.document=next;state.current.dirty=true;backup();setDocument(next);setStatus(state.current.blocked?"conflict":"unsaved");}
  async function discard(){await flush().catch(()=>{});const s=state.current;await api(`/decks/${deck.id}/workspace`,"DELETE",{revision:s.revision});s.dirty=false;clearBackup();await load();}
  function recover(entry:DeviceDeckEdit){
    restored.current=entry;state.current.blocked=entry.baseRevision!==state.current.baseRevision||entry.revision!==state.current.revision;
    change(entry.document);if(state.current.blocked){setStatus("conflict");setError("This device edit differs from the server revision. Save it as a separate draft, or review the server copy.");}
  }
  function committed(){state.current.dirty=false;state.current.loaded=false;clearBackup();}
  return {document,status,error,deviceError,recovery,change,flush,load,discard,recover,committed,current:state.current};
}
