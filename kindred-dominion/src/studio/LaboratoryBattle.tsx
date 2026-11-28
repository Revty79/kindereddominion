import {createPortal} from "react-dom";
import {useMemo,useState,useEffect,useRef} from "react";
import PersistentGame from "../account/PersistentGame";
import {BattleConnectionContext} from "../player/BattleConnection";
import type {LaboratorySession} from "../sandbox/laboratory";
import "../player/player.css";
import "./laboratory.css";
export default function LaboratoryBattle({session,onExit,onChange}:{session:LaboratorySession;onExit:()=>void;onChange:()=>void}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const overflow=document.body.style.overflow;document.body.style.overflow="hidden";const previous=document.activeElement as HTMLElement|null,others=[...document.body.children].filter(e=>e!==root.current).map(e=>({element:e as HTMLElement,inert:(e as HTMLElement).inert}));for(const item of others)item.element.inert=true;root.current?.querySelector<HTMLButtonElement>(".studio-lab-banner button")?.focus();return()=>{document.body.style.overflow=overflow;for(const item of others)item.element.inert=item.inert;previous?.focus();};},[]);
 const [value,setValue]=useState(()=>session.view()),[error,setError]=useState("");
 const connection=useMemo(()=>({request:session.request,sandbox:true,refresh:false,preferenceEvent:"kindred-laboratory-presentation-updated"}),[session]);
 const large=value.configuration.battlefield.rows>3||value.configuration.battlefield.cols>5;
 return createPortal(<div ref={root} className={`studio-lab-battle ${large?"is-large-board":""}`} role="region" aria-label="Isolated Battle Laboratory"><header className="studio-lab-banner"><strong>PRIVATE BATTLE LABORATORY · {session.scenario.laboratory?.classification??"legacy artificial fixture"}</strong><span>No account rewards, ownership or competitive results</span><button onClick={onExit}>Return to laboratory controls</button></header>{error&&<p className="studio-lab-error" role="alert">{error}</p>}<BattleConnectionContext value={connection}><PersistentGame value={value} onChange={next=>{setValue(next);onChange();}} onExit={onExit} onError={setError}/></BattleConnectionContext></div>,document.body);
}
