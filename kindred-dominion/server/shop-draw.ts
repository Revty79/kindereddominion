import crypto from "node:crypto";
import type {CardDefinition} from "../src/engine/types";
import {inPool,rarities,type Product,type Rarity,type ShopRules,type Slot} from "./shop-rules";

export type IntegerRandom=(exclusiveMaximum:number)=>number;
export const secureRandom:IntegerRandom=maximum=>crypto.randomInt(maximum);
export function seededRandom(seed:number):IntegerRandom{let state=seed>>>0;return maximum=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return Math.floor(state/4294967296*maximum);};}
export function weightedRarity(weights:Record<Rarity,number>,random:IntegerRandom):Rarity{
 const total=rarities.reduce((n,r)=>n+weights[r],0);if(!total)throw Error("No conditional rarity weight remains.");
 let value=random(total);if(!Number.isInteger(value)||value<0||value>=total)throw Error("Random source returned an out-of-range integer.");
 for(const rarity of rarities){if(value<weights[rarity])return rarity;value-=weights[rarity];}throw Error("Unreachable rarity interval.");
}
const available=(card:CardDefinition,slot:Slot,rules:ShopRules)=>inPool(card,slot.pool,rules)&&(slot.depleted==="available_pool"||slot.weights[rules.rarities[card.id]]>0);
// Maximum bipartite matching reserves scarce identities for strict future
// slots. It never changes a card's rarity or relaxes its collection/Kindred pool.
export function canFill(slots:Slot[],cards:CardDefinition[],rules:ShopRules):boolean{
 if(slots.length>cards.length)return false;
 const owners=new Map<string,number>();
 function assign(index:number,seen:Set<string>):boolean{for(const card of cards){if(seen.has(card.id)||!available(card,slots[index],rules))continue;seen.add(card.id);const previous=owners.get(card.id);if(previous===undefined||assign(previous,seen)){owners.set(card.id,index);return true;}}return false;}
 return slots.every((_,index)=>assign(index,new Set()));
}
export function packPlan(product:Product,cards:CardDefinition[],rules:ShopRules){
 const pool=cards.filter(card=>inPool(card,product.pool,rules)),unique=product.mode==="first_copy"||product.duplicates==="none",size=unique?Math.min(pool.length,product.slots.length):product.slots.length,slots=product.slots.slice(0,size);
 const feasible=!!size&&(unique?canFill(slots,pool,rules):slots.every(slot=>pool.some(card=>available(card,slot,rules))));
 return {pool,slots,size,unique,feasible,omittedSlots:product.slots.slice(size).map(slot=>slot.id)};
}
export function conditionalChoices(slot:Slot,following:Slot[],pool:CardDefinition[],rules:ShopRules,unique:boolean){
 let choices=pool.filter(card=>available(card,slot,rules));
 if(unique&&following.length){
  // Candidates with the same future eligibility vector are interchangeable
  // for matching, so large common pools require one feasibility check/group.
  const viable=new Map<string,boolean>();choices=choices.filter(card=>{const key=following.map(next=>available(card,next,rules)?"1":"0").join("");let value=viable.get(key);if(value===undefined){value=canFill(following,pool.filter(other=>other.id!==card.id),rules);viable.set(key,value);}return value;});
 }
 const counts=Object.fromEntries(rarities.map(rarity=>[rarity,choices.filter(card=>rules.rarities[card.id]===rarity).length])) as Record<Rarity,number>;
 let weights=Object.fromEntries(rarities.map(rarity=>[rarity,counts[rarity]?slot.weights[rarity]:0])) as Record<Rarity,number>,fallback=false;
 if(!Object.values(weights).some(Boolean)&&slot.depleted==="available_pool"){weights={...counts};fallback=true;}
 return {choices,counts,weights,fallback,totalWeight:Object.values(weights).reduce((a,b)=>a+b,0)};
}
export type SlotResult={slotId:string;cardId:string;rarity:Rarity;quantity:number;newCard:boolean;fallback:boolean;baseWeights:Record<Rarity,number>;conditionalWeights:Record<Rarity,number>;eligibleCounts:Record<Rarity,number>};
export function drawPack(product:Product,cards:CardDefinition[],rules:ShopRules,owned:Set<string>,random:IntegerRandom=secureRandom):SlotResult[]{
 const plan=packPlan(product,cards,rules);if(!plan.feasible)throw Error("The disclosed pack slots cannot be fulfilled from the eligible pool.");
 let remaining=plan.pool;const result:SlotResult[]=[],seen=new Set(owned);
 for(let index=0;index<plan.slots.length;index++){
  const slot=plan.slots[index],conditional=conditionalChoices(slot,plan.slots.slice(index+1),remaining,rules,plan.unique);if(!conditional.totalWeight)throw Error("No valid conditional pack allocation remains.");
  const rarity=weightedRarity(conditional.weights,random),choices=conditional.choices.filter(card=>rules.rarities[card.id]===rarity),position=random(choices.length);if(!Number.isInteger(position)||position<0||position>=choices.length)throw Error("Random source returned an out-of-range card position.");const card=choices[position];
  result.push({slotId:slot.id,cardId:card.id,rarity,quantity:product.quantity,newCard:!seen.has(card.id),fallback:conditional.fallback,baseWeights:slot.weights,conditionalWeights:conditional.weights,eligibleCounts:conditional.counts});seen.add(card.id);
  if(plan.unique)remaining=remaining.filter(candidate=>candidate.id!==card.id);
 }
 return result;
}
