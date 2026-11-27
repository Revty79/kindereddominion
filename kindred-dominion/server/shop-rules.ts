import {z} from "zod";
import {portable,units} from "./economy-rules";
import {ownerContent} from "../src/content/owner";
import type {CardDefinition} from "../src/engine/types";

export const rarities=["common","uncommon","rare","epic","legendary"] as const;
export const raritySchema=z.enum(rarities);
export type Rarity=typeof rarities[number];
export const assetRefSchema=z.object({id:portable,revision:z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/)}).strict();
export const weightsSchema=z.object({common:units,uncommon:units,rare:units,epic:units,legendary:units}).strict().refine(weights=>Object.values(weights).every(n=>n<=10000)&&Object.values(weights).reduce((a,b)=>a+b,0)===10000,"Rarity weights must total exactly 10,000 basis points.");
export const poolSchema=z.object({collections:z.array(portable).max(100).default([]),kindreds:z.array(z.string().min(1).max(80)).max(50).default([]),cards:z.array(portable).max(10000).default([]),exclude:z.array(portable).max(10000).default([]),rarities:z.array(raritySchema).max(5).default([])}).strict();
export const slotSchema=z.object({id:portable,pool:poolSchema.default(()=>poolSchema.parse({})),weights:weightsSchema,depleted:z.enum(["available_pool","unavailable"]).default("available_pool")}).strict();
export const pricesSchema=z.object({common:units,uncommon:units,rare:units,epic:units,legendary:units}).strict().refine(prices=>Object.values(prices).every(n=>n>0),"Prices must use positive integer units.");
const directSchema=z.object({enabled:z.boolean(),currency:portable,prices:pricesSchema,overrides:z.record(portable,units.refine(n=>n>0)).default({}),pool:poolSchema,quantity:z.number().int().min(1).max(100).default(1),tradeable:z.boolean().default(false)}).strict();
export const productSchema=z.object({
 id:portable,name:z.string().min(1).max(100),description:z.string().max(600),category:z.enum(["boosters","kindreds","cards","additional","expansions","artwork","cosmetics","offers"]),
 type:z.enum(["booster","bundle","cosmetic"]),mode:z.enum(["first_copy","additional","cosmetic"]),status:z.enum(["draft","published","archived"]),enabled:z.boolean(),testOnly:z.boolean().default(false),
 artwork:assetRefSchema.optional(),currency:portable,price:units.refine(n=>n>0),pricing:z.enum(["fixed","per_card","sum_rarity"]).default("fixed"),discountBasisPoints:z.number().int().min(0).max(9500).default(0),
 pool:poolSchema.default(()=>poolSchema.parse({})),slots:z.array(slotSchema).max(50).default([]),cosmetics:z.array(portable).max(100).default([]),
 quantity:z.number().int().min(1).max(100).default(1),duplicates:z.enum(["none","allowed"]).default("none"),tradeable:z.boolean().default(false),
 startsAt:z.string().datetime().optional(),endsAt:z.string().datetime().optional(),limit:z.object({period:z.enum(["lifetime","daily","weekly"]),quantity:z.number().int().min(1).max(10000)}).strict().optional(),
}).strict().superRefine((p,c)=>{
 if(p.type==="booster"&&(!p.slots.length||p.pricing!=="fixed"))c.addIssue({code:"custom",message:"Boosters require explicit slots and a fixed full-pack price."});
 if(new Set(p.slots.map(slot=>slot.id)).size!==p.slots.length)c.addIssue({code:"custom",message:"Slot identifiers must be distinct within a pack."});
 if(p.type==="booster"&&p.duplicates==="allowed"&&p.slots.length*p.quantity>1000)c.addIssue({code:"custom",message:"A repeated identity must fit the supported 1,000-copy atomic inventory change."});
 if(p.type!=="booster"&&p.slots.length)c.addIssue({code:"custom",message:"Only booster products have randomized slots."});
 if(p.type==="cosmetic"?(p.mode!=="cosmetic"||!p.cosmetics.length):(p.mode==="cosmetic"||!!p.cosmetics.length))c.addIssue({code:"custom",message:"Cosmetic products and gameplay products use separate asset grants."});
 if(p.type==="cosmetic"&&(p.quantity!==1||p.tradeable||p.duplicates!=="none"||new Set(p.cosmetics).size!==p.cosmetics.length))c.addIssue({code:"custom",message:"Cosmetic ownership is distinct, single, nontransferable and separate from playable quantities."});
 if(p.mode==="first_copy"&&(p.quantity!==1||p.duplicates!=="none"||p.tradeable))c.addIssue({code:"custom",message:"Ordinary first-copy products grant one bound copy per distinct identity."});
 if(p.endsAt&&p.startsAt&&Date.parse(p.endsAt)<=Date.parse(p.startsAt))c.addIssue({code:"custom",message:"Availability must have an increasing UTC window."});
});
const collectionSchema=z.object({id:portable,name:z.string().min(1).max(100),description:z.string().max(600),classification:z.enum(["founding","expansion","premium","promotional","cosmetic"]),status:z.enum(["draft","published","archived"]),acquisition:z.enum(["free","premium","promotional","cosmetic","unavailable"]),cards:z.array(portable).max(10000),artwork:assetRefSchema.optional(),releaseAt:z.string().datetime().optional()}).strict();
const cosmeticSchema=z.object({id:portable,name:z.string().min(1).max(100),description:z.string().max(600),type:z.enum(["alternate_art","animated_art","border","card_back","battlefield","title","victory_effect","evolution_effect"]),cardId:portable.optional(),asset:assetRefSchema.optional(),status:z.enum(["draft","published","archived"]),enabled:z.boolean(),testOnly:z.boolean().default(false)}).strict().superRefine((v,c)=>{if(v.enabled&&(v.type!=="alternate_art"||!v.cardId||!v.asset))c.addIssue({code:"custom",message:"Only readable alternate artwork with a permanent card identity and approved asset is rendered in this milestone."});});
export const formatSchema=z.object({id:portable,name:z.string().min(1).max(100),description:z.string().max(600),enabled:z.boolean(),collections:z.array(portable).max(100),excludeCollections:z.array(portable).max(100),kindreds:z.array(z.string().min(1).max(80)).max(50),excludeCards:z.array(portable).max(10000),rarities:z.array(raritySchema).max(5),deckSize:z.number().int().min(1).max(100),maxCopies:z.number().int().min(1).max(100),cardLimits:z.record(portable,z.number().int().min(0).max(100)),standardArtwork:z.boolean().default(false),eventPool:z.array(portable).max(10000).default([])}).strict();
export const shopSchema=z.object({
 label:z.string().min(1).max(100),enabled:z.boolean(),quoteSeconds:z.number().int().min(30).max(900),
 collections:z.array(collectionSchema).max(300),rarities:z.record(portable,raritySchema),products:z.array(productSchema).max(500),cosmetics:z.array(cosmeticSchema).max(1000),formats:z.array(formatSchema).min(1).max(100),defaultFormat:portable,
 directFirst:directSchema,directAdditional:directSchema,purchasedHoldHours:z.number().int().min(0).max(8760),
}).strict().superRefine((v,c)=>{
 for(const field of ["collections","products","cosmetics","formats"] as const)if(new Set(v[field].map(x=>x.id)).size!==v[field].length)c.addIssue({code:"custom",path:[field],message:"Permanent identifiers must be unique."});
 if(!v.formats.some(f=>f.id===v.defaultFormat&&f.enabled))c.addIssue({code:"custom",message:"Choose an enabled default playing format."});
 if(v.directFirst.currency!=="gold"||v.directFirst.quantity!==1||v.directFirst.tradeable)c.addIssue({code:"custom",message:"The founding first-copy route uses bound single copies and Gold."});
 if(v.products.some(p=>p.mode==="first_copy"&&p.currency!=="gold"))c.addIssue({code:"custom",message:"First-copy shop products use Gold; additional products remain explicit."});
 const collectionIds=new Set(v.collections.map(x=>x.id)),cosmeticIds=new Set(v.cosmetics.map(x=>x.id));
 for(const pool of [v.directFirst.pool,v.directAdditional.pool,...v.products.flatMap(p=>[p.pool,...p.slots.map(s=>s.pool)])])if(pool.collections.some(id=>!collectionIds.has(id)))c.addIssue({code:"custom",message:"A product pool references an unknown collection."});
 for(const p of v.products)if(p.cosmetics.some(id=>!cosmeticIds.has(id)))c.addIssue({code:"custom",message:"A product references an unknown cosmetic."});
 for(const f of v.formats){if([...f.collections,...f.excludeCollections].some(id=>!collectionIds.has(id)))c.addIssue({code:"custom",message:"Format collections must exist."});if(f.enabled&&f.deckSize!==15)c.addIssue({code:"custom",message:"Active permanent game formats preserve the established 15-card rule; other event sizes remain inactive."});}
 for(const collection of v.collections)if(new Set(collection.cards).size!==collection.cards.length)c.addIssue({code:"custom",message:"Collection membership must contain distinct identities."});
});
export type ShopRules=z.infer<typeof shopSchema>;
export type Product=z.infer<typeof productSchema>;
export type PoolRule=z.infer<typeof poolSchema>;
export type Slot=z.infer<typeof slotSchema>;
export type FormatRule=z.infer<typeof formatSchema>;
export type Cosmetic=z.infer<typeof cosmeticSchema>;

// Explicit, reviewable proposal. Lower stages remain accessible; printed power
// is never converted automatically into commercial rarity.
const proposedNumbers:Record<string,{uncommon:number[];rare:number[];epic:number[];legendary:number[]}>= {
 Nature:{uncommon:[13,14,15,16,17,18,19,20],rare:[21,22,24,25,27],epic:[23,26,29],legendary:[28,30]},
 Mythical:{uncommon:[3,14,15,16,17,18,19,24],rare:[20,21,22,25,26],epic:[23,28,30],legendary:[27,29]},
 Arcane:{uncommon:[13,14,15,16,17,18,19,24],rare:[20,25,26,27,28],epic:[22,29,30],legendary:[21,23]},
 Undead:{uncommon:[13,14,15,16,17,18,19,27],rare:[21,22,23,24,28],epic:[25,26,30],legendary:[20,29]},
 Constructs:{uncommon:[13,14,15,16,17,18,19,27],rare:[20,21,22,28,29],epic:[23,26,30],legendary:[24,25]},
};
export function proposedRarities(){return Object.fromEntries(ownerContent().cards.map(card=>{const number=Number(card.collectible!.number.slice(1)),group=proposedNumbers[card.kindred],rarity=(Object.entries(group).find(([,numbers])=>numbers.includes(number))?.[0]??"common") as Rarity;return [card.id,rarity];}));}
const weights=(common:number,uncommon:number,rare:number,epic:number,legendary:number)=>({common,uncommon,rare,epic,legendary});
export const STANDARD_SLOTS:Slot[]=[weights(7500,2000,400,90,10),weights(7500,2000,400,90,10),weights(0,8000,1500,400,100),weights(0,0,8500,1200,300),weights(4500,3000,1700,600,200)].map((weights,i)=>slotSchema.parse({id:"slot-"+(i+1),weights,depleted:"available_pool"}));
export const FIRST_PRICES={common:75,uncommon:150,rare:300,epic:600,legendary:1200};
export const ADDITIONAL_PRICES={common:20,uncommon:40,rare:80,epic:160,legendary:320};
export const DEFAULT_SHOP:ShopRules=(()=>{
 const pack=ownerContent(),all=pack.cards.map(card=>card.id),collections=[{id:"founding-all",name:"The Founding Kindreds",description:"All 150 permanent founding creatures.",classification:"founding",status:"published",acquisition:"free",cards:all},...pack.collections.map(kindred=>({id:"founding-"+kindred.id.toLowerCase(),name:kindred.name,description:kindred.description,classification:"founding",status:"published",acquisition:"free",cards:pack.cards.filter(c=>c.kindred===kindred.id).map(c=>c.id)}))];
 const pool={collections:["founding-all"]},products:unknown[]=[];
 const product=(value:any)=>productSchema.parse({status:"published",enabled:true,...value});
 const booster=(id:string,name:string,pool:any,currency:string,price:number,mode:string)=>product({id,name,description:mode==="first_copy"?"Five distinct eligible first copies. Results are owned at settlement; revealing is presentation only.":"Five explicit additional playable copies. This is not a first-copy product.",category:mode==="first_copy"?"boosters":"additional",type:"booster",mode,currency,price,pool,slots:STANDARD_SLOTS,duplicates:mode==="first_copy"?"none":"allowed",tradeable:mode==="additional"});
 products.push(booster("founding-first","Founding first-copy booster",pool,"gold",250,"first_copy"),booster("founding-additional","Founding additional-copy booster",pool,"aether",199,"additional"));
 for(const collection of collections){const isAll=collection.id==="founding-all";if(!isAll){products.push(booster(collection.id+"-first",collection.name+" first-copy booster",{collections:[collection.id]},"gold",300,"first_copy"),booster(collection.id+"-additional",collection.name+" additional-copy booster",{collections:[collection.id]},"aether",249,"additional"));}
  products.push(product({id:collection.id+"-complete",name:collection.name+" completion",description:"One bound copy of every eligible missing first copy. The quote lists exactly what remains eligible; earlier lifetime acquisitions stay excluded.",category:"kindreds",type:"bundle",mode:"first_copy",currency:"gold",price:50,pricing:"per_card",discountBasisPoints:isAll?1500:0,pool:{collections:[collection.id]}}),product({id:collection.id+"-extra-set",name:collection.name+" additional complete set",description:"One additional playable copy of every listed card, including cards already owned.",category:"additional",type:"bundle",mode:"additional",currency:"aether",price:isAll?2999:999,pool:{collections:[collection.id]},tradeable:true}));
 }
 const format=(id:string,name:string,collections:string[],enabled=true,eventPool:string[]=[])=>({id,name,description:name+" deck eligibility; existing gameplay and ownership validation also apply.",enabled,collections,excludeCollections:[],kindreds:[],excludeCards:[],rarities:[],deckSize:15,maxCopies:3,cardLimits:{},standardArtwork:false,eventPool});
 return shopSchema.parse({label:"Provisional DEV founding shop",enabled:true,quoteSeconds:120,collections,rarities:proposedRarities(),products,cosmetics:[],formats:[format("founders","Founders",["founding-all"]),format("standard","Standard",["founding-all"]),format("unlimited","Unlimited",[]),format("draft","Draft event pool",[],false),format("special","Special event",[],false)],defaultFormat:"founders",directFirst:{enabled:true,currency:"gold",prices:FIRST_PRICES,pool},directAdditional:{enabled:true,currency:"aether",prices:ADDITIONAL_PRICES,pool,tradeable:true},purchasedHoldHours:168});
})();

export function inPool(card:CardDefinition,pool:PoolRule,rules:ShopRules){
 const memberships=rules.collections.filter(collection=>collection.cards.includes(card.id));
 return !pool.exclude.includes(card.id)&&(!pool.cards.length||pool.cards.includes(card.id))&&(!pool.kindreds.length||pool.kindreds.includes(card.kindred))&&(!pool.collections.length||memberships.some(c=>pool.collections.includes(c.id)))&&(!pool.rarities.length||pool.rarities.includes(rules.rarities[card.id]));
}
export function formatIssues(cards:string[],library:Record<string,CardDefinition>,format:FormatRule,rules:ShopRules){
 const errors:string[]=[];if(!format.enabled)return ["This event format is not active."];if(cards.length!==format.deckSize)errors.push(`This format requires ${format.deckSize} cards.`);
 const counts=new Map<string,number>();for(const id of cards)counts.set(id,(counts.get(id)??0)+1);
 for(const [id,count]of counts){const card=library[id];if(!card){errors.push(id+": unpublished card.");continue;}const membership=rules.collections.filter(c=>c.status!=="draft"&&c.cards.includes(id));
  if(format.collections.length&&!membership.some(c=>format.collections.includes(c.id)))errors.push(id.toUpperCase()+": outside this format's allowed collections.");
  if(membership.some(c=>format.excludeCollections.includes(c.id))||format.excludeCards.includes(id))errors.push(id.toUpperCase()+": excluded by this format.");
  if(format.kindreds.length&&!format.kindreds.includes(card.kindred))errors.push(id.toUpperCase()+": Kindred not permitted.");
  if(format.rarities.length&&!format.rarities.includes(rules.rarities[id]))errors.push(id.toUpperCase()+": rarity not permitted.");
  if(format.eventPool.length&&!format.eventPool.includes(id))errors.push(id.toUpperCase()+": outside the event pool.");
  const maximum=Math.min(format.maxCopies,format.cardLimits[id]??format.maxCopies);if(count>maximum)errors.push(`${id.toUpperCase()}: this format permits at most ${maximum} copies.`);
 }
 return errors;
}
