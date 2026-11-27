import {useEffect,useRef} from "react";
import type {CardDefinition,CardLibrary,Player} from "../../engine/types";
import CollectibleCard from "./CollectibleCard";
export default function CardInspection({card,library,artwork,context,player=0,onClose}:{card:CardDefinition;library:CardLibrary;artwork?:string;context?:string;player?:Player;onClose:()=>void}){
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";close.current?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();if(event.key==="Tab"){event.preventDefault();close.current?.focus();}};
    window.addEventListener("keydown",key);
    return()=>{document.body.style.overflow=overflow;window.removeEventListener("keydown",key);previous?.focus();};
  },[onClose]);
  return <div className="design-inspection-shade" onClick={onClose}><section className="design-inspection" role="dialog" aria-modal="true" aria-label={`${card.name} full inspection`} onClick={e=>e.stopPropagation()}><button className="design-close" ref={close} aria-label="Close card inspection" onClick={onClose}>×</button><CollectibleCard card={card} library={library} artwork={artwork} scale="inspection" player={player}/>{context&&<p className="battle-inspection-context">{context}</p>}<p>{card.collectible?.number} · {card.name} · Printed card face</p></section></div>;
}
