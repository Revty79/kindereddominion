import {useEffect,useState} from "react";
import {api} from "../account/api";
import {usePresentationPreferences,type SavedPresentation} from "./usePresentationPreferences";
import type {PresentationMode,PresentationPreferences} from "./presentation-preferences";
import "./history.css";
export default function PresentationSettings({authenticated=true,onSaved}:{authenticated?:boolean;onSaved?:(value:SavedPresentation)=>void}){
  const settings=usePresentationPreferences(authenticated),[draft,setDraft]=useState(settings.saved.preferences),[base,setBase]=useState(0),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>{if(!dirty){setDraft(settings.saved.preferences);setBase(settings.saved.revision);}},[settings.saved,dirty]);
  if(!authenticated)return <section className="player-panel"><h1>Presentation settings</h1><p>Log in to save display settings across your devices. System reduced motion applies by default.</p></section>;
  function edit(next:PresentationPreferences){setDraft(next);setDirty(true);setMessage("");}
  return <section className="presentation-settings" aria-label="Presentation settings"><h2>Battle presentation</h2><p>Saved to your account and shared across devices.</p>
    {settings.error&&<p role="alert">{settings.error}</p>}
    <label>Animation mode<select aria-label="Animation mode" value={draft.mode} disabled={busy||!settings.loaded} onChange={e=>edit({...draft,mode:e.target.value as PresentationMode})}><option value="system">Follow device setting</option><option value="normal">Normal</option><option value="fast">Fast</option><option value="reduced">Reduced motion</option><option value="instant">Instant</option></select></label>
    <p>{draft.mode==="instant"?"Accepted results appear immediately. Last Move remains available.":draft.mode==="reduced"?"Static changes and readable descriptions, without card flight or pulsing effects.":draft.mode==="fast"?"Shorter animations keep the same event order.":draft.mode==="normal"?"Standard animations, including when this device requests reduced motion.":"Uses reduced motion when requested by this device; otherwise standard animations."}</p>
    {([['cardMovement','Card movement animations'],['abilityAnimations','Ability effect animations'],['scoreAnimations','Score animations'],['highlighting','Resolved battlefield highlights'],['descriptions','Live effect descriptions']]as const).map(([key,label])=><label className="presentation-check" key={key}><input type="checkbox" checked={draft[key]} disabled={busy||!settings.loaded} onChange={e=>edit({...draft,[key]:e.target.checked})}/>{label}</label>)}
    <p>Move inspection always retains readable details. These settings affect presentation only.</p>
    <div className="button-row"><button disabled={busy||!dirty||!settings.loaded} onClick={()=>void(async()=>{setBusy(true);setMessage("");try{const next=await api("/preferences/presentation","PUT",{revision:base,preferences:draft});settings.accept(next);setDirty(false);setBase(next.revision);onSaved?.(next);window.dispatchEvent(new Event("kindred-presentation-updated"));setMessage("Presentation settings saved.");}catch(e){setMessage(e instanceof Error?e.message:"Settings could not be saved.");}finally{setBusy(false);}})()}>Save presentation settings</button><button disabled={busy} onClick={()=>{setDirty(false);void settings.reload();setMessage("Reloading saved settings...");}}>Reload saved settings</button></div>
    {message&&<p role="status">{message}</p>}
  </section>;
}
