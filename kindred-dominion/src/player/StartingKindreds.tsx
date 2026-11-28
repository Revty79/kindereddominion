import {useState} from "react";
import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import CollectibleCard from "../ui/cards/CollectibleCard";
import CardInspection from "../ui/cards/CardInspection";
import {KINDRED_GUIDES} from "./learning-model";
import "./learning.css";
export default function StartingKindreds({content,chosen,onChoose}:{content:ContentPack;chosen:string;onChoose:(id:string)=>void}){
 const library=libraryOf(content),art=artworkMap(content),[inspect,setInspect]=useState("");
 return <><div className="player-starter-options">{content.collections.map(k=>{const guide=KINDRED_GUIDES[k.id],cards=(guide?.cards??content.cards.filter(c=>c.kindred===k.id).slice(0,2).map(c=>c.id)).filter(id=>library[id]);return <article key={k.id} className="player-starter-choice" aria-current={chosen===k.id}><h3>{k.name}</h3><p>{k.description}</p><p>{guide?.summary}</p><div className="starter-representatives">{cards.map(id=><CollectibleCard key={id} card={library[id]} library={library} artwork={art[id]} scale="hand"/>)}</div><p>{guide?.tip}</p><div className="button-row">{cards.map(id=><button key={id} onClick={()=>setInspect(id)}>Inspect {library[id].name}</button>)}</div><button aria-label={k.name} aria-pressed={chosen===k.id} onClick={()=>onChoose(k.id)}>{chosen===k.id?"Selected: ":"Choose "}{k.name}</button></article>;})}</div>{inspect&&<CardInspection card={library[inspect]} library={library} artwork={art[inspect]} onClose={()=>setInspect("")} context="Representative published card. Your starting collection contains all 30 identities of the chosen Kindred."/>}</>;
}
