import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {currentOwnerContent} from "../content/current";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import BattlefieldStudy from "./BattlefieldStudy";
import CardInspection from "./CardInspection";
import "./review.css";
const content=currentOwnerContent(),library=libraryOf(content),art=artworkMap(content);
function BattlefieldReview(){const [inspection,setInspection]=useState<{id:string;context?:string}|null>(null);
  return <main className="design-review battlefield-review"><header className="design-review-header"><a href="/card-design.html">◇ KINDRED DOMINION / CARD STUDIES</a><span>APPROVED FOR V1.4</span></header><BattlefieldStudy onInspect={(id,context)=>setInspection({id,context})}/><footer className="battle-review-footer"><p>Prepared position · actual engine evaluation · presentation study only</p><p>This approved renderer is shared with the V1.4 player application.</p></footer>{inspection&&<CardInspection card={library[inspection.id]} library={library} artwork={art[inspection.id]} context={inspection.context} onClose={()=>setInspection(null)}/>}</main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><BattlefieldReview/></React.StrictMode>);
