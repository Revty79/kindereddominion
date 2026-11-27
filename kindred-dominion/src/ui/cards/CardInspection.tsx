import {useEffect,useRef,type ReactNode} from "react";
import type {CardDefinition,CardLibrary,Player} from "../../engine/types";
import CollectibleCard from "./CollectibleCard";
export default function CardInspection({card,library,artwork,context,details,player=0,onClose}:{card:CardDefinition;library:CardLibrary;artwork?:string;context?:string;details?:ReactNode;player?:Player;onClose:()=>void}){
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";close.current?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();if(event.key==="Tab"){const items=[...close.current!.parentElement!.querySelectorAll<HTMLElement>('button,[tabindex="0"]')].filter(item=>item.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    window.addEventListener("keydown",key);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener("keydown",key);previous?.focus();};
  },[onClose]);
  return <div className="design-inspection-shade" onClick={onClose}><section className="design-inspection" role="dialog" aria-modal="true" aria-label={`${card.name} full inspection`} onClick={e=>e.stopPropagation()}><button className="design-close" ref={close} aria-label="Close card inspection" onClick={onClose}>×</button><CollectibleCard card={card} library={library} artwork={artwork} scale="inspection" player={player}/>{context&&<p className="battle-inspection-context">{context}</p>}<p>{card.collectible?.number} · {card.name} · Printed card face</p>{details&&<div className="inspection-readable" role="region" tabIndex={0} aria-label="Readable card information">{details}</div>}</section></div>;
}
