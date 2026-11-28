import {z} from "zod";
import {bundleQuantities} from "./shop-quantities";
import type {DB} from "./db";
import type {BackendConfig} from "./config";
import {shopState,resolveProduct,offer,offerPrice,type OfferReadContext,type ShopState} from "./shop-catalog";
import {inPool,type Product} from "./shop-rules";
import {inDepartment,productDepartment,STORE_DEPARTMENTS} from "../src/shop/departments";

export const storefrontQuery=z.object({
 page:z.coerce.number().int().min(0).max(10000).default(0),q:z.string().max(80).default(""),
 category:z.enum(["all","boosters","kindreds","cards","additional","expansions","artwork","cosmetics","offers"]).default("all"),
 department:z.enum(["all",...STORE_DEPARTMENTS.map(d=>d.id)]).default("all"),
 kindred:z.string().max(80).default(""),rarity:z.string().max(30).default(""),collection:z.string().max(80).default(""),
 ownership:z.enum(["all","owned","unowned"]).default("all"),mode:z.enum(["all","first_copy","additional","completion","cosmetic"]).default("all"),
 currency:z.string().max(80).default(""),availability:z.enum(["all","available"]).default("all"),
 sort:z.enum(["name","price_asc","price_desc"]).default("name"),
}).strict();

export function visibleProduct(state:ShopState,product:Product){return product.status==="published"&&(!product.testOnly||!!state.account.sandbox);}
export function storefrontArtwork(product:Product,version:string){return product.artwork?`/api/shop/product-artwork/${encodeURIComponent(product.id)}?version=${encodeURIComponent(version)}`:null;}
function productCards(state:ShopState,product:Product){return state.cards.filter(card=>product.mode==="cosmetic"?state.rules.cosmetics.some(c=>product.cosmetics.includes(c.id)&&c.cardId===card.id):inPool(card,product.pool,state.rules));}
export async function storefrontCatalog(pool:DB,playerId:string,config:BackendConfig,raw:unknown){
 const query=storefrontQuery.parse(raw),state=await shopState(pool,playerId,config),q=query.q.trim().toLowerCase();
 const ids=[...new Set([...state.rules.products.map(p=>p.id),...state.cards.flatMap(card=>[`card-first-${card.id}`,`card-additional-${card.id}`])])];
 const definitions=ids.map(id=>resolveProduct(state,id)).filter((p):p is Product=>!!p&&visibleProduct(state,p)).filter(product=>{
  if(!inDepartment(product,query.department,state.rules.cosmetics)||query.category!=="all"&&query.category!==product.category||query.mode!=="all"&&query.mode!==product.mode||query.currency&&query.currency!==product.currency)return false;
  const cards=productCards(state,product);
  const collections=state.rules.collections.filter(c=>c.status==="published"&&cards.some(card=>c.cards.includes(card.id)));
  if(q&&![product.id,product.name,product.description,product.edition,...cards.map(c=>`${c.name} ${c.collectible?.number??c.id}`),...collections.map(c=>c.name)].join(" ").toLowerCase().includes(q))return false;
  if(query.kindred&&!cards.some(c=>c.kindred===query.kindred)||query.rarity&&!cards.some(c=>state.rules.rarities[c.id]===query.rarity)||query.collection&&!collections.some(c=>c.id===query.collection))return false;
  if(query.ownership!=="all"){
   const owned=product.mode==="cosmetic"?product.cosmetics.every(id=>state.ownedCosmetics.has(id)):product.id.startsWith("card-")?!!state.quantities.get(product.pool.cards[0]):cards.length>0&&cards.every(c=>(state.quantities.get(c.id)??0)>0);
   if(owned!==(query.ownership==="owned"))return false;
  }
  return true;
 });
 const now=new Date((await pool.query("SELECT now() AS value")).rows[0].value),day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())),week=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(now.getUTCDay()+6)%7));
 const usage=(await pool.query("SELECT product_id,count(*)::int lifetime,count(*) FILTER(WHERE created_at>=$3)::int daily,count(*) FILTER(WHERE created_at>=$4)::int weekly FROM kd.shop_purchase WHERE player_id=$1 AND product_id=ANY($2::text[]) AND source<>'reward' GROUP BY product_id",[playerId,definitions.filter(p=>p.limit).map(p=>p.id),day,week])).rows;
 const read:OfferReadContext={now,usage:new Map(usage.map(r=>[r.product_id,{lifetime:r.lifetime,daily:r.daily,weekly:r.weekly}]))};
 const products=[];
 for(const product of definitions){
  const value=await offer(pool,state,playerId,product.id,read);if(query.availability==="available"&&!value.available)continue;
  const cards=productCards(state,product),collections=state.rules.collections.filter(c=>c.status==="published"&&cards.some(card=>c.cards.includes(card.id)));
  const originalPrice=offerPrice({...product,discountBasisPoints:0},product.mode==="cosmetic"?value.terms.cosmetics:product.type==="booster"?value.terms.eligibleIds.slice(0,value.terms.count):value.terms.eligibleIds,value.terms.fullCount,state.rules,product.type==="bundle"&&product.mode!=="first_copy"?bundleQuantities(product,cards.map(c=>c.id),state.quantities):undefined);
  products.push({id:product.id,name:product.name,description:product.description,type:product.type,mode:product.mode,category:product.category,department:productDepartment(product,state.rules.cosmetics),featured:product.featured||product.category==="offers",edition:product.edition,
   artwork:product.artwork??null,artworkUrl:storefrontArtwork(product,state.id),available:value.available,reasons:value.reasons,currency:product.currency,price:value.terms.price,originalPrice:originalPrice>value.terms.price?originalPrice:null,discountBasisPoints:product.discountBasisPoints,
   count:value.terms.count,totalCopies:value.terms.totalCopies,fullCopies:value.terms.fullCopies,eligibleCount:value.terms.eligibleCount,fullCount:value.terms.fullCount,warnings:value.terms.warnings,limit:value.terms.limit,startsAt:product.startsAt??null,endsAt:product.endsAt??null,
   pool:product.pool,previewCardIds:cards.slice(0,3).map(c=>c.id),collections:collections.map(c=>({id:c.id,name:c.name})),kindreds:[...new Set(cards.map(c=>c.kindred))],
   ownedUnique:cards.filter(c=>(state.quantities.get(c.id)??0)>0).length,ownedCopies:cards.reduce((n,c)=>n+(state.quantities.get(c.id)??0),0),ownedCosmetics:product.cosmetics.filter(id=>state.ownedCosmetics.has(id)).length,
   ownedQuantities:product.id.startsWith("card-")?value.terms.ownedQuantities:undefined,rarity:product.pool.cards.length===1?state.rules.rarities[product.pool.cards[0]]:null});
 }
 products.sort((a,b)=>query.sort==="name"?a.name.localeCompare(b.name)||a.id.localeCompare(b.id):a.currency.localeCompare(b.currency)||(query.sort==="price_asc"?a.price-b.price:b.price-a.price)||a.id.localeCompare(b.id));
 const buckets=(await pool.query("SELECT currency_id,origin,balance,held FROM kd.wallet_balance WHERE player_id=$1",[playerId])).rows;
 const wallet=state.economy.rules.currencies.map(currency=>{const rows=buckets.filter(row=>row.currency_id===currency.id&&(state.account.sandbox?row.origin==="sandbox":row.origin!=="sandbox"));return {id:currency.id,name:currency.name,available:rows.reduce((n,row)=>n+Number(row.balance)-Number(row.held),0)};});
 const pendingCommerceOrders=Number((await pool.query("SELECT count(*) n FROM kd.commerce_order WHERE player_id=$1 AND payment_state NOT IN('cancelled','expired','failed') AND fulfillment_state NOT IN('fulfilled','reversed')",[playerId])).rows[0].n);
 return {enabled:true,shopVersion:state.id,economyVersion:state.economy.id,sandbox:!!state.account.sandbox,products:products.slice(query.page*20,query.page*20+20),total:products.length,page:query.page,hasMore:products.length>(query.page+1)*20,wallet,pendingCommerceOrders,kindreds:state.pack.collections.map(k=>k.id),collections:state.rules.collections.filter(c=>c.status==="published"),rarities:state.rules.rarities,formats:state.rules.formats.filter(f=>f.enabled)};
}
