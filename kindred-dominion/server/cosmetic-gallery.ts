import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import type {DB} from "./db";
import {selectedConfiguration} from "./configuration";
import {shopSchema,type Cosmetic} from "./shop-rules";
import {activeContent} from "./catalog";
import {ownedCosmeticViews} from "./cosmetic-views";
import {shopState,offer} from "./shop-catalog";
import {FUNCTIONAL_COSMETICS} from "../src/shop/cosmetic-types";
export const galleryQuery=z.object({page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(80).default(""),card:z.string().max(80).default(""),kindred:z.string().max(80).default(""),theme:z.string().max(80).default(""),type:z.enum(["all",...FUNCTIONAL_COSMETICS]).default("all"),ownership:z.enum(["all","owned","unowned"]).default("all")}).strict();
export function cosmeticGalleryRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 app.get("/api/cosmetics/gallery",async req=>{
  const actor=await auth.actor(req),q=galleryQuery.parse(req.query),[selected,owned,pack,account]=await Promise.all([selectedConfiguration(pool,"shop"),ownedCosmeticViews(pool,actor.id),activeContent(pool),pool.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[actor.id])]),rules=selected?shopSchema.parse(selected.document):null,sandbox=!!account.rows[0]?.sandbox;
  const published=rules?.cosmetics.filter(c=>c.status==="published"&&c.enabled&&(!c.testOnly||sandbox))??[],definitions=[...new Map<string,Cosmetic>([...owned.filter(o=>o.definition&&(FUNCTIONAL_COSMETICS as readonly string[]).includes(o.type)).map(o=>[o.id,o.definition!]as const),...published.map(c=>[c.id,c]as const)]).values()];
  const quantities=new Map((await pool.query("SELECT e.card_id,sum(i.quantity)::int quantity FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE i.player_id=$1 GROUP BY e.card_id",[actor.id])).rows.map(r=>[r.card_id,r.quantity]));
  const all=definitions.filter(c=>{const card=pack.cards.find(v=>v.id===c.cardId),isOwned=owned.some(o=>o.id===c.id&&!o.revoked);return(q.type==="all"||q.type===c.type)&&(!q.card||q.card===c.cardId)&&(!q.kindred||q.kindred===(c.kindred??card?.kindred))&&(!q.theme||c.themes?.includes(q.theme))&&(q.ownership==="all"||isOwned===(q.ownership==="owned"))&&(!q.q||`${c.name} ${c.description} ${c.cardId??""} ${card?.name??""} ${(c.themes??[]).join(" ")}`.toLowerCase().includes(q.q.toLowerCase()));}).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const state=rules?.enabled?await shopState(pool,actor.id,config):null,now=new Date((await pool.query("SELECT now() value")).rows[0].value),products=new Map<string,any>();
  for(const p of rules?.products.filter(p=>p.type==="cosmetic"&&p.status==="published"&&p.enabled&&(!p.testOnly||sandbox)&&p.cosmetics.some(id=>all.slice(q.page*24,q.page*24+24).some(c=>c.id===id)))??[])if(state){const value=await offer(pool,state,actor.id,p.id,{now,usage:new Map()});if(p.limit){const exact=await offer(pool,state,actor.id,p.id);products.set(p.id,exact);}else products.set(p.id,value);}
  return {page:q.page,total:all.length,hasMore:all.length>(q.page+1)*24,themes:[...new Set(definitions.flatMap(c=>c.themes??[]))].sort(),items:all.slice(q.page*24,q.page*24+24).map(c=>{const ownership=owned.find(o=>o.id===c.id),card=pack.cards.find(v=>v.id===c.cardId);return {definition:c,owned:!!ownership&&!ownership.revoked,revoked:!!ownership?.revoked,restricted:!!ownership?.restricted,usable:!!ownership&&!ownership.revoked&&!ownership.restricted&&(!c.cardId||Number(quantities.get(c.cardId)??0)>0),ownedQuantity:c.cardId?quantities.get(c.cardId)??0:null,kindred:c.kindred??card?.kindred??null,url:ownership&&!ownership.revoked?ownership.url:c.asset?`/api/shop/appearance-preview/${encodeURIComponent(c.id)}`:null,products:[...products].filter(([,value])=>value.product.cosmetics.includes(c.id)).map(([id,value])=>({id,name:value.product.name,price:value.terms.price,currency:value.terms.currency,available:value.available,reasons:value.reasons,contents:value.terms.cosmetics}))};})};
 });
}
