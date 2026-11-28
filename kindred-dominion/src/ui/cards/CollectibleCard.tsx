import {memo} from "react";
import "./cards.css";
import type {CardDefinition,CardLibrary,Player} from "../../engine/types";
import Artwork from "../Artwork";
import {FALLBACK_ART,portableAssetURL} from "../../assets/references";
import {useCardPresentation} from "./CardPresentation";
export type CardScale="inspection"|"hand"|"battlefield";
const roman=(n:number)=>["","I","II","III","IV","V"][n]??String(n);
export const InfluenceDiagram=memo(function InfluenceDiagram({card,player=0}:{card:CardDefinition;player?:Player}){
  const radius=Math.max(2,...card.influence.flatMap(i=>[Math.abs(i.x),Math.abs(i.y)])),side=radius*2+1;
  return <div className="collectible-influence" role="img" aria-label={`Territory influence facing ${player===0?"right":"left"}: ${card.influence.map(i=>`${i.mechanic} ${i.amount} at ${i.x},${i.y}`).join("; ")||"none"}`} style={{gridTemplateColumns:`repeat(${side},1fr)`}}>{Array.from({length:side*side},(_,n)=>{const x=(n%side-radius)*(player===0?1:-1),y=Math.floor(n/side)-radius,effects=card.influence.filter(i=>i.x===x&&i.y===y),origin=x===0&&y===0;return <span key={n} className={`${origin?"influence-origin":""} ${effects.map(e=>`influence-${e.mechanic}`).join(" ")}`} title={[origin?"Creature position":"",...effects.map(e=>`${e.mechanic} ${e.amount}`)].filter(Boolean).join(", ")||"No influence"}>{origin&&<b>◆</b>}{effects.map((e,index)=><span key={index}>{e.mechanic==="fortification"?"G":e.mechanic[0].toUpperCase()}{e.amount}</span>)}</span>;})}</div>;
});
function Ornament({kindred}:{kindred:string}){
  return <svg className="collectible-ornament" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="ornament-line" d="M2.5 28V6Q2.5 2.5 6 2.5H28M72 2.5H94Q97.5 2.5 97.5 6V28M97.5 72V94Q97.5 97.5 94 97.5H72M28 97.5H6Q2.5 97.5 2.5 94V72"/>{kindred==="Nature"?<><path d="M4 13Q2 5 11 4Q9 11 4 13ZM89 4Q98 5 96 13Q91 11 89 4ZM4 87Q9 89 11 96Q2 95 4 87ZM89 96Q91 89 96 87Q98 95 89 96Z"/></>:kindred==="Constructs"?<>{[[5,5],[95,5],[5,95],[95,95]].map(([x,y])=><g key={x+":"+y}><circle cx={x} cy={y} r="2.3"/><circle className="ornament-cut" cx={x} cy={y} r=".8"/><path className="ornament-line" d={`M${x-3} ${y}h6M${x} ${y-3}v6`}/></g>)}</>:kindred==="Arcane"?<>{[[5,5],[95,5],[5,95],[95,95]].map(([x,y])=><path key={x+":"+y} d={`M${x} ${y-2.5}l2 2.5-2 2.5-2-2.5Z`}/>)}</>:kindred==="Undead"?<><path d="M4 4q3-2 5 1l-4 4q-3-2-1-5ZM91 5q2-3 5-1q2 3-1 5ZM4 96q-2-3 1-5l4 4q-2 3-5 1ZM91 95l4-4q3 2 1 5q-3 2-5-1Z"/></>:<><path d="M4 4l5 1-4 4ZM96 4l-1 5-4-4ZM4 96l1-5 4 4ZM96 96l-5-1 4-4Z"/></>}</svg>;
}
function CollectibleCard({card,library,artwork,scale="inspection",player=0,original=false}:{card:CardDefinition;library:CardLibrary;artwork?:string;scale?:CardScale;player?:Player;original?:boolean}){
  const presentation=useCardPresentation(),illustration=!original&&player===0?presentation.cosmetics?.[card.id]??artwork:artwork,rarity=presentation.rarities?.[card.id];
  const type=card.type==="evolution"?"Evolution":card.type==="replacement"?"Replacement":`Rank ${roman(card.rank)}`;
  const prerequisites=[card.prerequisite?.definitions?.map(id=>`${library[id]?.collectible?.number??id} ${library[id]?.name??""}`).join(" or "),card.prerequisite?.tags?.length?`${card.prerequisite.tags.join(" or ")} classification`:"",card.prerequisite?.minPower!==undefined?`Host power ≥ ${card.prerequisite.minPower}`:""].filter(Boolean).join("; ");
  const ability=card.type!=="standard"?type:card.continuous?.some(effect=>effect.kind==="power")?"Power aura":card.protections?.length||card.continuous?.some(effect=>effect.kind==="protection")?"Protection":card.scaling?.length?"Dynamic power":card.abilities.length?"Triggered ability":"Territory influence";
  return <div className={`collectible-shell scale-${scale}`}><article className={`collectible-card kindred-${card.kindred.toLowerCase()}`} aria-label={`${card.collectible?.number??card.id} ${card.name}, ${card.kindred}, ${type}, printed power ${card.power}`} data-card-id={card.id}>
    <div className="collectible-art" data-layer="artwork"><Artwork src={illustration??portableAssetURL(FALLBACK_ART)} alt={`${card.name} illustration`}/></div>
    <div className="collectible-permanent" data-layer="permanent">
    <Ornament kindred={card.kindred}/><header className="collectible-heading"><span className={`collectible-rank type-${card.type}`} aria-label={`${type}, placement rank ${card.rank}`}><small>{card.type==="standard"?"RANK":card.type==="evolution"?"EVOLVE":"REPLACE"}</small><b>{card.type==="standard"?roman(card.rank):card.type==="evolution"?"E":"R"}</b></span><h2>{card.name}</h2><span className="collectible-power" aria-label={`Printed power ${card.power}`}><b>{card.power}</b><small>POWER</small></span></header>
    <div className="collectible-identity"><strong>{card.kindred}{rarity&&scale==="inspection"&&<small className="collectible-rarity"> · {rarity}</small>}</strong><span className="collectible-number">{card.collectible?.number??card.id}</span></div>
    <div className="collectible-rules"><div className="collectible-diagram"><InfluenceDiagram card={card} player={player}/><small>E · G · O</small></div><div className="collectible-ability"><h3>{ability}</h3><p>{card.text}</p></div></div>
    <div className="collectible-requirement">{prerequisites?`${card.type==="evolution"?`Evolution ${roman(card.rank)}`:"Requires"} · ${prerequisites}`:card.type==="replacement"?"Replaces a friendly creature":`${type} placement`}</div>
    <footer className="collectible-footer"><span className="collectible-classification">{card.tags.join(" · ")}</span><span>{(card.collectible?.setId??"Kindred Dominion").replace(/-\d+$/,"").replaceAll("-"," ")}</span></footer>
    </div>
  </article></div>;
}

// The face contains immutable printed information. Power, selection and other
// gameplay overlays render separately; appearance context still updates it.
export default memo(CollectibleCard);
