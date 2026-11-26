import type {CardDefinition,CardLibrary} from "../engine/types";
import Artwork from "../ui/Artwork";
import {FALLBACK_ART,portableAssetURL} from "../assets/references";
export type CardScale="inspection"|"hand"|"battlefield";
const roman=(n:number)=>["","I","II","III","IV","V"][n]??String(n);
export function InfluenceDiagram({card}:{card:CardDefinition}){
  const radius=Math.max(2,...card.influence.flatMap(i=>[Math.abs(i.x),Math.abs(i.y)])),side=radius*2+1;
  return <div className="collectible-influence" role="img" aria-label={`Territory influence facing right: ${card.influence.map(i=>`${i.mechanic} ${i.amount} at ${i.x},${i.y}`).join("; ")||"none"}`} style={{gridTemplateColumns:`repeat(${side},1fr)`}}>{Array.from({length:side*side},(_,n)=>{const x=n%side-radius,y=Math.floor(n/side)-radius,effects=card.influence.filter(i=>i.x===x&&i.y===y);return <span key={n} className={`${x===0&&y===0?"influence-origin":""} ${effects.map(e=>`influence-${e.mechanic}`).join(" ")}`} title={x===0&&y===0?"Creature position":effects.map(e=>`${e.mechanic} ${e.amount}`).join(", ")||"No influence"}>{x===0&&y===0?"◆":effects.map(e=>`${e.mechanic==="fortification"?"G":e.mechanic[0].toUpperCase()}${e.amount}`).join("/")}</span>;})}</div>;
}
function Ornament({kindred}:{kindred:string}){
  return <svg className="collectible-ornament" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="ornament-line" d="M2.5 28V6Q2.5 2.5 6 2.5H28M72 2.5H94Q97.5 2.5 97.5 6V28M97.5 72V94Q97.5 97.5 94 97.5H72M28 97.5H6Q2.5 97.5 2.5 94V72"/>{kindred==="Nature"?<><path d="M4 13Q2 5 11 4Q9 11 4 13ZM89 4Q98 5 96 13Q91 11 89 4ZM4 87Q9 89 11 96Q2 95 4 87ZM89 96Q91 89 96 87Q98 95 89 96Z"/></>:kindred==="Constructs"?<>{[[5,5],[95,5],[5,95],[95,95]].map(([x,y])=><g key={x+":"+y}><circle cx={x} cy={y} r="2.3"/><circle className="ornament-cut" cx={x} cy={y} r=".8"/><path className="ornament-line" d={`M${x-3} ${y}h6M${x} ${y-3}v6`}/></g>)}</>:kindred==="Arcane"?<>{[[5,5],[95,5],[5,95],[95,95]].map(([x,y])=><path key={x+":"+y} d={`M${x} ${y-2.5}l2 2.5-2 2.5-2-2.5Z`}/>)}</>:kindred==="Undead"?<><path d="M4 4q3-2 5 1l-4 4q-3-2-1-5ZM91 5q2-3 5-1q2 3-1 5ZM4 96q-2-3 1-5l4 4q-2 3-5 1ZM91 95l4-4q3 2 1 5q-3 2-5-1Z"/></>:<><path d="M4 4l5 1-4 4ZM96 4l-1 5-4-4ZM4 96l1-5 4 4ZM96 96l-5-1 4-4Z"/></>}</svg>;
}
export default function CollectibleCard({card,library,artwork,scale="inspection"}:{card:CardDefinition;library:CardLibrary;artwork?:string;scale?:CardScale}){
  const type=card.type==="evolution"?"Evolution":card.type==="replacement"?"Replacement":`Rank ${roman(card.rank)}`,predecessors=card.prerequisite?.definitions?.map(id=>`${library[id]?.collectible?.number??id} ${library[id]?.name??""}`).join(" or ");
  return <div className={`collectible-shell scale-${scale}`}><article className={`collectible-card kindred-${card.kindred.toLowerCase()}`} aria-label={`${card.collectible?.number??card.id} ${card.name}, ${card.kindred}, ${type}, printed power ${card.power}`} data-card-id={card.id}>
    <Ornament kindred={card.kindred}/><header className="collectible-heading"><span className={`collectible-rank type-${card.type}`} aria-label={`${type}, placement rank ${card.rank}`}><small>{card.type==="standard"?"RANK":card.type==="evolution"?"EVOLVE":"REPLACE"}</small><b>{card.type==="standard"?roman(card.rank):card.type==="evolution"?"E":"R"}</b></span><h2>{card.name}</h2><span className="collectible-power" aria-label={`Printed power ${card.power}`}><b>{card.power}</b><small>POWER</small></span></header>
    <div className="collectible-art"><Artwork src={artwork??portableAssetURL(FALLBACK_ART)} alt={`${card.name} illustration`}/><div className="collectible-classification">{card.tags.join(" · ")}</div></div>
    <div className="collectible-identity"><strong>{card.kindred}</strong><span>{card.collectible?.number??card.id}</span></div>
    <div className="collectible-rules"><div className="collectible-diagram"><InfluenceDiagram card={card}/><small>E · G · O</small></div><div className="collectible-ability"><h3>{card.type==="standard"?"Territory influence":type}</h3><p>{card.text}</p></div></div>
    <div className="collectible-requirement">{predecessors?`Evolution ${roman(card.rank)} ? ${predecessors}`:card.type==="replacement"?"Replaces a friendly creature":`${type} placement`}</div>
    <footer className="collectible-footer"><span>{(card.collectible?.setId??"Kindred Dominion").replace(/-\d+$/,"").replaceAll("-"," ")}</span><span>◆</span></footer>
  </article></div>;
}
