import {shopSchema,productSchema,type ShopRules} from "./shop-rules";
import {ownerContent} from "../src/content/owner";
export const FOUNDING_COSMETIC_NAMES={Nature:"Ancient Woodland",Mythical:"Dragon's Sanctum",Arcane:"Astral Nexus",Undead:"Forgotten Crypt",Constructs:"The Great Foundry"};
export function cosmeticProposal(base:ShopRules){
 const rules=structuredClone(base),kindreds=Object.keys(FOUNDING_COSMETIC_NAMES) as (keyof typeof FOUNDING_COSMETIC_NAMES)[];
 // Draft definitions describe required owner artwork; no placeholder is
 // silently registered, approved, sold or granted to ordinary accounts.
 for(const p of rules.products)if(p.id.endsWith("-extra-set")||p.type==="booster"&&p.mode==="additional"&&p.id.startsWith("founding-")){p.status="archived";p.enabled=false;}
 const product=(id:string,name:string,cosmetics:string[],price:number)=>productSchema.parse({id,name,description:"Provisional cosmetic product. Supply approved artwork and review prices before publication; grants no playable cards.",type:"cosmetic",mode:"cosmetic",category:"cosmetics",status:"draft",enabled:false,currency:"aether",price,cosmetics});
 for(const kindred of kindreds){const key=kindred.toLowerCase(),back="standard-back-"+key,field="standard-battlefield-"+key,card=ownerContent().cards.find(c=>c.kindred===kindred)!,alt="alternate-study-"+card.id;
  rules.cosmetics.push({id:back,name:kindred+" standard card back",description:"Original starting Kindred's standard card back. Owner artwork and exact free-grant approval pending.",type:"card_back",kindred,status:"draft",enabled:false,testOnly:false,themes:["founding-standard"]},{id:field,name:FOUNDING_COSMETIC_NAMES[kindred],description:"Working battlefield name. Owner artwork and exact free-grant approval pending.",type:"battlefield",kindred,status:"draft",enabled:false,testOnly:false,themes:["founding-standard"]},{id:alt,name:card.name+" alternate study",description:"Owner-selected alternate artwork example; no illustration has been commissioned or approved here.",type:"alternate_art",cardId:card.id,kindred,status:"draft",enabled:false,testOnly:false,themes:["founding-studies"]});
  rules.products.push(product("back-"+key,kindred+" card back",[back],199),product("battlefield-"+key,FOUNDING_COSMETIC_NAMES[kindred],[field],499),{...product("artwork-"+card.id,card.name+" alternate artwork",[alt],149),category:"artwork"});
 }
 for(const treatment of["metallic","holographic","edge"]as const){const id="treatment-"+treatment;rules.cosmetics.push({id,name:treatment[0].toUpperCase()+treatment.slice(1)+" card treatment",description:"Lightweight static edge decoration. No gameplay statistics or full-face effects.",type:"border",treatment,status:"draft",enabled:false,testOnly:false,themes:["founding-treatments"]});rules.products.push(product("product-"+id,treatment+" treatment",[id],299));}
 rules.startingCosmetics={enabled:false,backfillEnabled:false,approval:null,kindreds:Object.fromEntries(kindreds.map(k=>[k,{cardBack:"standard-back-"+k.toLowerCase(),battlefield:"standard-battlefield-"+k.toLowerCase()}])) as NonNullable<ShopRules["startingCosmetics"]>["kindreds"]};
 return shopSchema.parse(rules);
}
