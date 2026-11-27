import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {currentOwnerContent} from "../content/current";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import CollectibleCard,{type CardScale} from "./CollectibleCard";
import BattlefieldStudy from "./BattlefieldStudy";
import CardInspection from "./CardInspection";
import "./review.css";
const pack=currentOwnerContent(),library=libraryOf(pack),art=artworkMap(pack),ids=["n003","m020","a015","u020","c020","n027","n026"];
function Review(){const [scale,setScale]=useState<CardScale>("inspection"),[selected,setSelected]=useState<{id:string;context?:string}|null>(null);
  return <main className="design-review"><header className="design-review-header"><a href="/">◇ KINDRED DOMINION</a><span>AWAITING OWNER APPROVAL</span></header><section className="design-review-intro"><div><p className="design-eyebrow">THE FOUNDING COLLECTION / ARTWORK-FIRST STUDY</p><h1>The illustration.<br/><em>The entire card face.</em></h1></div><div className="design-review-copy"><p>Full-bleed 3:4 artwork. Permanent information in transparent overlays. Gameplay state on its own layer.</p><p>Seven actual cards, five Kindreds, one shared component. Choose a card for full inspection, or compare the hand and battlefield sizes.</p><nav aria-label="Card presentation sizes">{([['inspection','Collection / inspection'],['hand','Player hand'],['battlefield','Battlefield']] as const).map(([id,label])=><button key={id} aria-pressed={scale===id} onClick={()=>setScale(id)}>{label}</button>)}</nav></div></section>
    {scale==="battlefield"?<BattlefieldStudy onInspect={(id,context)=>setSelected({id,context})}/>:<section className={`design-gallery context-${scale}`} aria-label={`${scale} card examples`}>{ids.map((id,index)=><div className="design-example" key={id}><div className="design-example-caption"><span>{String(index+1).padStart(2,"0")} / {library[id].kindred}</span><span>{library[id].type==="standard"?"Founding creature":library[id].type}</span></div><button className="design-card-button" aria-label={`Inspect ${library[id].name}`} onClick={()=>setSelected({id})}><CollectibleCard card={library[id]} library={library} artwork={art[id]} scale={scale}/></button></div>)}</section>}
    <footer className="design-review-footer"><p><b>Influence key</b> E — expansion · G — fortification · O — overthrow. The diamond marks the creature; diagrams face right.</p><p>Selection and other temporary indicators sit outside the printed card. This study is isolated from gameplay. Decorative framing awaits your approval.</p></footer>
    {selected&&<CardInspection card={library[selected.id]} library={library} artwork={art[selected.id]} context={selected.context} onClose={()=>setSelected(null)}/>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Review/></React.StrictMode>);
