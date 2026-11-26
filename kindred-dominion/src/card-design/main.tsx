import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {currentOwnerContent} from "../content/current";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import CollectibleCard,{type CardScale} from "./CollectibleCard";
import "./review.css";
const pack=currentOwnerContent(),library=libraryOf(pack),art=artworkMap(pack),ids=["n003","m020","a015","u020","c020","n027","n026"];
function Review(){const [scale,setScale]=useState<CardScale>("inspection"),[selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setSelected(null);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[]);
  return <main className="design-review"><header className="design-review-header"><a href="/">◇ KINDRED DOMINION</a><span>AWAITING OWNER APPROVAL</span></header><section className="design-review-intro"><div><p className="design-eyebrow">THE FOUNDING COLLECTION / CARD STUDY 01</p><h1>Five Kindreds.<br/><em>One shared card language.</em></h1></div><div className="design-review-copy"><p>A creature portrait takes center stage. Placement, power and influence hold the same positions across every Kindred.</p><p>These seven examples use the published artwork and actual card definitions. Choose a card to inspect it.</p><nav aria-label="Card presentation sizes">{([['inspection','Collection / inspection'],['hand','Player hand'],['battlefield','Battlefield']] as const).map(([id,label])=><button key={id} aria-pressed={scale===id} onClick={()=>setScale(id)}>{label}</button>)}</nav></div></section>
    <section className={`design-gallery context-${scale}`} aria-label={`${scale} card examples`}>{ids.map((id,index)=><div className="design-example" key={id}><div className="design-example-caption"><span>{String(index+1).padStart(2,"0")} / {library[id].kindred}</span><span>{library[id].type==="standard"?"Founding creature":library[id].type}</span></div><button className="design-card-button" aria-label={`Inspect ${library[id].name}`} onClick={()=>setSelected(id)}><CollectibleCard card={library[id]} library={library} artwork={art[id]} scale={scale}/></button></div>)}</section>
    <footer className="design-review-footer"><p><b>Influence key</b> E — expansion · G — fortification · O — overthrow. The diamond marks the creature; diagrams face right.</p><p>Selection and other temporary indicators sit outside the printed card. This study is isolated from gameplay. Decorative framing awaits your approval.</p></footer>
    {selected&&<div className="design-inspection-shade" onClick={()=>setSelected(null)}><section className="design-inspection" role="dialog" aria-modal="true" aria-label={`${library[selected].name} full inspection`} onClick={e=>e.stopPropagation()}><button className="design-close" autoFocus aria-label="Close card inspection" onClick={()=>setSelected(null)}>×</button><CollectibleCard card={library[selected]} library={library} artwork={art[selected]} scale="inspection"/><p>{library[selected].collectible?.number} · {library[selected].name}. Printed values from {pack.id}.</p></section></div>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Review/></React.StrictMode>);
