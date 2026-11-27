import {useEffect,useRef,useState} from "react";
import {api} from "../account/api";
import {DEFAULT_PRESENTATION,normalizePresentation,motionProfile,type PresentationPreferences} from "./presentation-preferences";
export type SavedPresentation={revision:number;preferences:PresentationPreferences};
export function usePresentationPreferences(enabled=true){
  const [saved,setSaved]=useState<SavedPresentation>({revision:0,preferences:{...DEFAULT_PRESENTATION}}),[loaded,setLoaded]=useState(!enabled),[error,setError]=useState(""),[systemReduced,setSystemReduced]=useState(()=>matchMedia("(prefers-reduced-motion: reduce)").matches);
  const ticket=useRef(0),abort=useRef<AbortController|null>(null),mounted=useRef(true);
  async function reload(){if(!enabled)return;const generation=++ticket.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
    try{const value=await api("/preferences/presentation","GET",undefined,{signal:controller.signal});if(mounted.current&&generation===ticket.current){setSaved({revision:value.revision,preferences:normalizePresentation(value.preferences)});setError("");}}
    catch(e){if(mounted.current&&generation===ticket.current&&!(e instanceof DOMException&&e.name==="AbortError"))setError("Saved display settings are temporarily unavailable. Device-safe defaults apply.");}
    finally{if(mounted.current&&generation===ticket.current)setLoaded(true);}
  }
  function accept(value:SavedPresentation){ticket.current++;abort.current?.abort();setSaved({revision:value.revision,preferences:normalizePresentation(value.preferences)});setLoaded(true);setError("");}
  useEffect(()=>{mounted.current=true;void reload();const refresh=()=>{if(!document.hidden)void reload();},query=matchMedia("(prefers-reduced-motion: reduce)"),change=()=>setSystemReduced(query.matches);query.addEventListener("change",change);window.addEventListener("focus",refresh);window.addEventListener("online",refresh);window.addEventListener("kindred-presentation-updated",refresh);const interval=setInterval(refresh,30000);
    return()=>{mounted.current=false;ticket.current++;abort.current?.abort();clearInterval(interval);query.removeEventListener("change",change);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);window.removeEventListener("kindred-presentation-updated",refresh);};
  },[enabled]);
  return {saved,loaded,error,reload,accept,profile:motionProfile(saved.preferences,systemReduced)};
}
