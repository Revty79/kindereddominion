import type {CardDefinition,GameConfig} from "../engine/types";
import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {DEFAULT_CONFIG} from "../engine/config";
import {validateDeck} from "../engine/game";
import {formatIssues,type EligibilityCatalog} from "../content/eligibility";
import {mechanicsOf} from "../ui/collection";

export type DeckDocument={name:string;cards:string[];config:{scoring:"classic"|"domination";mode:"standard"|"free";collection:string};formatId:string|null;testingAccess:boolean};
export const deckDocumentOf=(d:any):DeckDocument=>({name:d.name,cards:[...d.cards],config:{scoring:d.config.scoring,mode:d.config.mode,collection:d.config.collection},formatId:d.formatId??null,testingAccess:!!d.testingAccess});
export const countsOf=(cards:string[])=>cards.reduce((m,id)=>(m.set(id,(m.get(id)??0)+1),m),new Map<string,number>());
export const emptyEligibility:EligibilityCatalog={version:null,defaultFormat:null,formats:[],collections:[],rarities:{},retired:[]};

export function analyzeDeck(document:DeckDocument,content:ContentPack,owned:Map<string,number>,eligibility:EligibilityCatalog=emptyEligibility){
  const library=libraryOf(content),counts=countsOf(document.cards),config={...structuredClone(DEFAULT_CONFIG),...document.config} as GameConfig;
  const selectedFormat=document.formatId??(config.mode==="standard"?eligibility.defaultFormat:null);
  const format=selectedFormat?eligibility.formats.find(f=>f.id===selectedFormat):null;
  const errors=validateDeck(document.cards,library,config),warnings:string[]=[];
  const identityCounts=new Map<string,number>();
  for(const [id,n]of counts){const identity=library[id]?.collectible?.gameplayId??id;identityCounts.set(identity,(identityCounts.get(identity)??0)+n);}
  for(const [id,n]of identityCounts)if(n>(owned.get(id)??0))errors.push(`${id.toUpperCase()}: deck requires ${n}, owned ${owned.get(id)??0}. Acquire the missing copies or remove them from this deck.`);
  for(const id of counts.keys())if(eligibility.retired.includes(library[id]?.collectible?.gameplayId??id))errors.push(`${id.toUpperCase()}: retired; retained here for repair, unavailable for new matches.`);
  if(format)errors.push(...formatIssues(document.cards,library,format,eligibility));
  else if(selectedFormat)errors.push("The saved format is unavailable; select a published playing format.");
  const distribution:Record<string,number>={},kindreds:Record<string,number>={},abilities:Record<string,number>={};
  const evolutions:{id:string;name:string;selected:string[];possible:string[];supported:boolean;conditions:string}[]=[];
  let openers=0,high=0;
  for(const [id,n]of counts){const card=library[id];if(!card)continue;
    const placement=card.type==="standard"?`Rank ${card.rank}`:card.type==="evolution"?"Evolution":"Replacement";
    distribution[placement]=(distribution[placement]??0)+n;kindreds[card.kindred]=(kindreds[card.kindred]??0)+n;
    for(const ability of mechanicsOf(card))abilities[ability]=(abilities[ability]??0)+n;
    if(card.type==="standard"&&card.rank===1)openers+=n;
    if(card.type==="standard"&&card.rank>=3)high+=n;
    if(card.type==="evolution"){
      const pre=card.prerequisite,possible=content.cards.filter(c=>c.id!==id&&(!pre?.definitions||pre.definitions.includes(c.id))&&(!pre?.tags||pre.tags.some(tag=>c.tags.includes(tag)))).map(c=>c.id),selected=possible.filter(id=>counts.has(id));
      const supported=selected.length>0,conditions=[pre?.minPower!==undefined?`Host power must reach ${pre.minPower}.`:"","Printed gameplay conditions must also hold."].filter(Boolean).join(" ");
      evolutions.push({id,name:card.name,possible,selected,supported,conditions});
      if(!supported)warnings.push(`${card.name}: no matching predecessor is selected. Evolution may be difficult; this is a strategic warning, not a deck rule violation.`);
    }
  }
  if(document.cards.length&&openers<5)warnings.push(`Only ${openers} rank-one opening cards. Initial hands may need a mulligan or have limited placement options.`);
  if(high>=5)warnings.push(`${high} rank-three standard cards need developed territory; consider how the deck creates placement tokens.`);
  if(document.cards.length&&![...counts].some(([id])=>library[id]?.influence.some(i=>i.mechanic==="expansion"&&i.x>0)))warnings.push("No forward expansion influence is selected. Review territory development before battle.");
  const baseLimits=new Map<string,number>(),memberships=new Map<string,EligibilityCatalog["collections"]>();
  for(const card of content.cards){const id=card.collectible?.gameplayId??card.id;const max=config.mode==="free"?15:card.maxCopies??config.maxCopies;baseLimits.set(id,Math.min(baseLimits.get(id)??max,max));}
  for(const collection of eligibility.collections)if(collection.status!=="draft")for(const id of collection.cards){const entries=memberships.get(id)??[];entries.push({...collection,cards:[id]});memberships.set(id,entries);}
  const addition=(card:CardDefinition)=>{
    const identity=card.collectible?.gameplayId??card.id,selected=identityCounts.get(identity)??0,total=owned.get(identity)??0;
    const baseLimit=baseLimits.get(identity)??config.maxCopies;
    const limit=format?Math.min(baseLimit,format.maxCopies,format.cardLimits[card.id]??format.maxCopies):baseLimit;
    const reasons:string[]=[];
    if(document.cards.length>=15)reasons.push("Deck already contains 15 cards.");
    if(selected>=total)reasons.push(`No unselected owned copies (${total} owned).`);
    if(selected>=limit)reasons.push(`Copy limit ${limit} reached.`);
    if(config.collection!=="mixed"&&card.kindred!==config.collection)reasons.push(`This deck explicitly allows only ${config.collection}.`);
    if(eligibility.retired.includes(identity))reasons.push("This identity is retired.");
    if(format)reasons.push(...formatIssues([card.id],library,{...format,deckSize:1,maxCopies:15,cardLimits:{}},{rarities:eligibility.rarities,collections:memberships.get(card.id)??[]}));
    if(selectedFormat&&!format)reasons.push("Choose an available playing format.");
    return {owned:total,selected,remaining:Math.max(0,total-selected),limit,reasons:[...new Set(reasons)],allowed:reasons.length===0};
  };
  return {counts,unique:identityCounts.size,additional:document.cards.length-identityCounts.size,errors:[...new Set(errors)],warnings:[...new Set(warnings)],distribution,kindreds,abilities,evolutions,openers,addition};
}
