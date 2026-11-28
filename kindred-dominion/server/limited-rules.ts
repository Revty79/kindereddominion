import {z} from "zod";
import {portable} from "./economy-rules";
const positive=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const limitedMethods=["shop","achievement","promotion","tournament","administrator","redemption"] as const;
export const limitedComponent=z.object({kind:z.enum(["card","cosmetic"]),id:portable,quantity:z.number().int().min(1).max(1000)}).strict();
export const limitedEditionSchema=z.object({id:portable,name:z.string().trim().min(1).max(100),description:z.string().max(1000),type:z.enum(["gameplay_card","alternate_art","card_back","battlefield","treatment","effect","bundle"]),maxSupply:positive,serialized:z.boolean().default(true),contents:z.array(limitedComponent).min(1).max(100),testOnly:z.boolean().default(true),exclusiveGameplay:z.boolean().default(false),allowedFormats:z.array(portable).max(100).default([]),tradeable:z.boolean().default(false),cosmeticTrading:z.boolean().default(false),methods:z.array(z.enum(limitedMethods)).min(1).max(6),allocations:z.array(z.object({id:portable,method:z.enum(["achievement","promotion","tournament","administrator","redemption"]),quantity:positive}).strict()).max(100).default([]),purchaseLimit:z.number().int().min(1).max(10000).optional(),artwork:z.object({id:portable,revision:z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9_-]*$/)}).strict().optional(),releaseAt:z.string().datetime().optional(),startsAt:z.string().datetime().optional(),endsAt:z.string().datetime().optional(),status:z.enum(["draft","published","suspended","archived"]).default("draft"),enabled:z.boolean().default(false)}).strict().superRefine((e,c)=>{
 if(new Set(e.contents.map(x=>x.kind+":"+x.id)).size!==e.contents.length)c.addIssue({code:"custom",message:"Edition components must have distinct identities."});
 if(e.contents.filter(x=>x.kind==="cosmetic").some(x=>x.quantity!==1))c.addIssue({code:"custom",message:"A cosmetic component grants one license per instance, never playable copies."});
 if(new Set(e.methods).size!==e.methods.length||new Set(e.allocations.map(a=>a.id)).size!==e.allocations.length)c.addIssue({code:"custom",message:"Acquisition methods and allocation identities must be distinct."});
 if(e.allocations.reduce((n,a)=>n+BigInt(a.quantity),0n)>BigInt(e.maxSupply)||e.allocations.some(a=>!e.methods.includes(a.method)))c.addIssue({code:"custom",message:"Reward allocations must fit lifetime supply and enabled acquisition methods."});
 if(e.endsAt&&Date.parse(e.endsAt)<=Date.parse(e.startsAt??e.releaseAt??"1970-01-01T00:00:00Z"))c.addIssue({code:"custom",message:"Availability requires an increasing UTC window."});
 if(e.type!=="bundle"&&e.contents.length!==1)c.addIssue({code:"custom",message:"Use a bundle edition for multiple underlying identities."});
 if(e.cosmeticTrading&&!e.tradeable)c.addIssue({code:"custom",message:"Cosmetic trading also requires explicit edition tradeability."});
});
export const limitedRulesSchema=z.object({label:z.string().min(1).max(100),editions:z.array(limitedEditionSchema).max(1000)}).strict().refine(v=>new Set(v.editions.map(e=>e.id)).size===v.editions.length,"Permanent edition identities must be distinct.");
export type LimitedEdition= z.infer<typeof limitedEditionSchema>;
export type LimitedMethod=typeof limitedMethods[number];
export const DEFAULT_LIMITED={label:"Limited editions - unpublished owner content",editions:[]} as z.infer<typeof limitedRulesSchema>;
// These fields describe the collectible promise, not editable merchandising.
export const limitedCore=(e:LimitedEdition)=>({id:e.id,type:e.type,maxSupply:e.maxSupply,serialized:e.serialized,contents:e.contents,testOnly:e.testOnly,exclusiveGameplay:e.exclusiveGameplay,allocations:e.allocations});
