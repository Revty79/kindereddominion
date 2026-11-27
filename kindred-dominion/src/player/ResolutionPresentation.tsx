import {useLayoutEffect,useRef,type RefObject} from "react";
import type {CardLibrary} from "../engine/types";
import type {ResolutionEvent} from "../ui/resolution-presentation";
import CollectibleCard from "../ui/cards/CollectibleCard";
import {RESOLUTION_TIMING} from "./resolution-queue";
import "./resolution.css";

export function ResolutionFlight({event,root,library,art,onFailure}:{event:ResolutionEvent|null;root:RefObject<HTMLElement|null>;library:CardLibrary;art:Record<string,any>;onFailure:()=>void}){
  const element=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(event?.kind!=="move"||event.actor!==1||!event.target||!element.current)return;
    const origin=root.current?.querySelector<HTMLElement>("[data-opponent-origin]")?.getBoundingClientRect(),destination=root.current?.querySelector<HTMLElement>(`[data-placement-row="${event.target.row}"][data-placement-col="${event.target.col}"] .player-tile-card-space`)?.getBoundingClientRect();
    if(!origin||!destination){onFailure();return;}
    const width=Math.min(120,destination.width,destination.height*.75),height=width*4/3,x=destination.left+(destination.width-width)/2,y=destination.top+(destination.height-height)/2;
    element.current.style.cssText=`left:${x}px;top:${y}px;width:${width}px;`;
    let animation:Animation|undefined;
    try{animation=element.current.animate([{transform:`translate(${origin.left+origin.width/2-x-width/2}px,${origin.top+origin.height/2-y-height/2}px) scale(.65)`,opacity:.6},{transform:"translate(0,0) scale(1)",opacity:1}],{duration:RESOLUTION_TIMING.move,easing:"cubic-bezier(.2,.7,.2,1)",fill:"both"});}catch{onFailure();}
    return()=>animation?.cancel();
  },[event?.id]);
  if(event?.kind!=="move"||event.actor!==1||!event.card||!library[event.card.definitionId])return null;
  return <div ref={element} className="resolution-flight" data-resolution-flight={event.card.definitionId} aria-hidden="true"><CollectibleCard card={library[event.card.definitionId]} library={library} artwork={art[event.card.definitionId]} scale="battlefield" player={event.actor}/></div>;
}

export function ResolvedBadges({event,row,col}:{event:ResolutionEvent|null;row:number;col:number}){
  const effects=event?.effects.filter(e=>e.row===row&&e.col===col)??[];
  if(!effects.length)return null;
  return <div className="resolved-badges" data-layer="resolved" aria-label={effects.map(e=>e.text).join(" ")} title={effects.map(e=>e.text).join(" ")}><small>RESOLVED</small><span>{effects.slice(0,3).map((e,i)=><b data-resolved-effect={e.category} key={i}>{e.label}</b>)}{effects.length>3&&<b>+{effects.length-3}</b>}</span></div>;
}

export function InfluenceDirection({event,root}:{event:ResolutionEvent|null;root:RefObject<HTMLElement|null>}){
  if(event?.kind!=="influence"||!event.source)return null;
  const box=(p:{row:number;col:number})=>root.current?.querySelector<HTMLElement>(`[data-placement-row="${p.row}"][data-placement-col="${p.col}"]`)?.getBoundingClientRect(),source=box(event.source);
  if(!source)return null;
  return <svg className="resolution-direction" aria-hidden="true"><defs><marker id="resolved-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="currentColor"/></marker></defs>{event.effects.filter((e,i,a)=>a.findIndex(p=>p.row===e.row&&p.col===e.col)===i).map(e=>{const target=box(e);return target?<line key={`${e.row}:${e.col}`} x1={source.left+source.width/2} y1={source.top+source.height/2} x2={target.left+target.width/2} y2={target.top+target.height/2} markerEnd="url(#resolved-arrow)"/>:null;})}</svg>;
}
