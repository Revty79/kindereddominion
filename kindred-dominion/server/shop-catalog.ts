import crypto from "node:crypto";
import type {DB} from "./db";
import type {Client} from "./economy-assets";
import type {BackendConfig} from "./config";
import {activeContent} from "./catalog";
import {currentEconomy} from "./economy";
import {selectedConfiguration,economyPermitted} from "./configuration";
import {shopSchema,productSchema,inPool,type ShopRules,type Product} from "./shop-rules";
import {packPlan,conditionalChoices} from "./shop-draw";
import {economyDigest} from "./economy-hash";
import {reject} from "./errors";
import {bundleQuantities} from "./shop-quantities";
import {promotionAt,featuredAt} from "./shop-features";

export async function shopState(c:DB|Client,playerId:string,config:BackendConfig){
 const selected=await selectedConfiguration(c,"shop"),economy=await currentEconomy(c,config);if(!selected||!economy||!economyPermitted(config))reject(409,"shop_unavailable","The shop needs active, validated economy and shop publications in this environment.");
 const rules=shopSchema.parse(selected.document);if(!rules.enabled)reject(409,"shop_paused","The shop is temporarily paused; settled acquisitions remain owned.");
 const pack=await activeContent(c),identities=new Set((await c.query("SELECT id FROM kd.card_identity WHERE NOT retired AND id=ANY($1)",[pack.cards.map(card=>card.id)])).rows.map(row=>row.id)),cards=pack.cards.filter(card=>identities.has(card.id));
 const quantities=new Map<string,number>((await c.query("SELECT e.card_id,sum(i.quantity)::text AS quantity FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE player_id=$1 GROUP BY e.card_id",[playerId])).rows.map(row=>[row.card_id,Number(row.quantity)])),lifetime=new Set<string>((await c.query("SELECT card_id FROM kd.lifetime_card WHERE player_id=$1",[playerId])).rows.map(row=>row.card_id)),ownedCosmetics=new Set<string>((await c.query("SELECT cosmetic_id FROM kd.cosmetic_ownership WHERE player_id=$1 AND NOT revoked",[playerId])).rows.map(row=>row.cosmetic_id));
 const account=(await c.query("SELECT e.sandbox,e.rewards_restricted,p.status,p.starting_kindred,coalesce((SELECT level FROM kd.xp_balance WHERE player_id=p.id AND axis='account'),1) AS level FROM kd.player p LEFT JOIN kd.economy_account e ON e.player_id=p.id WHERE p.id=$1",[playerId])).rows[0];if(!account)reject(404,"player_missing","Player was not found.");
 return {id:selected.id,economy,pack,cards,rules,quantities,lifetime,ownedCosmetics,account};
}
export type ShopState=Awaited<ReturnType<typeof shopState>>;
export function resolveProduct(state:Pick<ShopState,"cards"|"rules">,id:string):Product|null{
 const explicit=state.rules.products.find(product=>product.id===id);if(explicit)return explicit;
 const direct=/^card-(first|additional)-([a-z][a-z0-9_-]{0,79})$/.exec(id);if(!direct)return null;const card=state.cards.find(card=>card.id===direct[2]),first=direct[1]==="first",definition=first?state.rules.directFirst:state.rules.directAdditional,rarity=state.rules.rarities[direct[2]];
 if(!card||!rarity||!inPool(card,definition.pool,state.rules))return null;
 return productSchema.parse({id,name:card.name+(first?" first copy":" playable copies"),description:first?"One bound first copy of this permanent card; current ownership and lifetime acquisition are checked together.":`${definition.quantity} explicit playable copies of this card, including copies already owned.`,category:first?"cards":"additional",type:"bundle",mode:first?"first_copy":"additional",status:"published",enabled:definition.enabled,currency:definition.currency,price:definition.overrides[card.id]??definition.prices[rarity],pricing:"per_card",quantity:definition.quantity,tradeable:definition.tradeable,pool:{cards:[card.id]}});
}
const ceilRatio=(value:bigint,divisor:bigint)=>(value+divisor-1n)/divisor;
export function offerPrice(product:Product,eligibleIds:string[],fullCount:number,rules:ShopRules,quantities?:ReturnType<typeof bundleQuantities>){
 if(!eligibleIds.length||!fullCount)return 0;let amount:bigint;
 if(product.pricing==="per_card")amount=BigInt(product.price)*BigInt(quantities?.total??eligibleIds.length*product.quantity);
 else if(product.pricing==="sum_rarity"){const table=product.mode==="first_copy"?rules.directFirst:rules.directAdditional;amount=eligibleIds.reduce((n,id)=>n+BigInt(table.overrides[id]??table.prices[rules.rarities[id]])*BigInt(quantities?.grants[id]??product.quantity),0n);}
 else if(product.mode==="completion")amount=ceilRatio(BigInt(product.price)*BigInt(quantities?.total??eligibleIds.length*product.quantity),BigInt(quantities?.fullTotal??fullCount*product.quantity));
 else amount=product.mode==="first_copy"||product.mode==="cosmetic"?ceilRatio(BigInt(product.price)*BigInt(eligibleIds.length),BigInt(fullCount)):BigInt(product.price);
 amount=ceilRatio(amount*BigInt(10000-product.discountBasisPoints),10000n);if(amount>1000000000000n)reject(400,"price_limit","This product price exceeds the supported integer currency-operation limit.");return Number(amount);
}
export function permittedPool(state:ShopState,product:Product){return state.cards.filter(card=>state.rules.rarities[card.id]&&inPool(card,product.pool,state.rules)&&state.rules.collections.some(collection=>collection.status==="published"&&collection.acquisition!=="unavailable"&&collection.acquisition!=="cosmetic"&&collection.cards.includes(card.id)&&(product.mode!=="first_copy"||collection.acquisition==="free")));}
export type OfferReadContext={now:Date;usage:Map<string,{lifetime:number;daily:number;weekly:number}>};
export async function offer(c:DB|Client,state:ShopState,playerId:string,productId:string,read?:OfferReadContext){
 const product=resolveProduct(state,productId);if(!product||product.status!=="published")reject(404,"product_missing","This published product was not found.");
 const now=read?.now??new Date((await c.query("SELECT now() AS value")).rows[0].value),problems:string[]=[];
 if(!product.enabled)problems.push("This product is inactive.");if(state.account.status!=="active")problems.push("This account is disabled pending administrative review.");if(product.testOnly&&!state.account.sandbox)problems.push("This testing product is available only to a permanently designated sandbox account.");
 if(product.startsAt&&Date.parse(product.startsAt)>now.getTime())problems.push("This product's availability window has not started.");if(product.endsAt&&Date.parse(product.endsAt)<=now.getTime())problems.push("This product's availability window has ended.");
 if(!state.economy.rules.currencies.some(currency=>currency.id===product.currency&&currency.active))problems.push("This product's currency is inactive.");
 let used=0;if(product.limit){const period=product.limit.period,from=period==="lifetime"?null:period==="daily"?new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())):new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-(now.getUTCDay()+6)%7));used=read?(read.usage.get(product.id)?.[period]??0):Number((await c.query("SELECT count(*) AS count FROM kd.shop_purchase WHERE player_id=$1 AND product_id=$2 AND source<>'reward' AND ($3::timestamptz IS NULL OR created_at>=$3)",[playerId,product.id,from])).rows[0].count);if(used>=product.limit.quantity)problems.push("This account has reached the published purchase limit for this period.");}
 const full=product.type==="cosmetic"?[]:permittedPool(state,product),quantities=bundleQuantities(product,full.map(c=>c.id),state.quantities),eligible=product.mode==="first_copy"?full.filter(card=>!state.lifetime.has(card.id)&&!(state.quantities.get(card.id)??0)):product.mode==="completion"?full.filter(card=>quantities.grants[card.id]):full;
 const plan=product.type==="booster"?packPlan(product,eligible,state.rules):null,cosmetics=product.cosmetics.filter(id=>!state.ownedCosmetics.has(id)),ids=product.mode==="cosmetic"?cosmetics:product.type==="booster"?eligible.slice(0,plan!.size).map(card=>card.id):eligible.map(card=>card.id),count=product.type==="booster"?plan!.size:ids.length;
 if(!count)problems.push(product.mode==="cosmetic"?"All included cosmetics are already owned.":product.mode==="first_copy"?"No eligible first copies remain. Lifetime acquisitions stay protected even after cards leave the inventory.":"No eligible published cards remain.");
 if(plan&&!plan.feasible)problems.push("The configured slot guarantees cannot be fulfilled from the eligible pool; use an available completion or direct-card option.");
 const promotion=promotionAt(product,now,{sandbox:!!state.account.sandbox,startingKindred:state.account.starting_kindred,level:state.account.level}),priced=promotion?{...product,discountBasisPoints:promotion.discountBasisPoints}:product;
 const fullCount=product.type==="booster"?product.slots.length:product.mode==="cosmetic"?product.cosmetics.length:full.length,price=offerPrice(priced,ids,fullCount,state.rules,product.type==="bundle"&&product.mode!=="first_copy"?quantities:undefined);
 const odds=plan?.slots.map((slot,index)=>{const conditioned=conditionalChoices(slot,plan.slots.slice(index+1),plan.pool,state.rules,plan.unique);return {slotId:slot.id,baseWeights:slot.weights,conditionalWeights:conditioned.weights,eligibleCounts:conditioned.counts,fallback:conditioned.fallback,policy:slot.depleted};})??[];
 const warnings:string[]=[];if(count&&count<fullCount&&(product.mode==="first_copy"||product.mode==="cosmetic"))warnings.push(`Reduced contents: ${count} of ${fullCount}; the exact ${price}-unit price is prorated before confirmation.`);if(plan?.omittedSlots.length)warnings.push("Omitted reduced-pack slots: "+plan.omittedSlots.join(", ")+".");if(plan)warnings.push("Each slot is conditioned on earlier selections and cards reserved for strict later slots. Disclosed fallback slots use remaining eligible rarities if weighted pools are exhausted or reserved; strict slots never substitute an unpromised rarity.");
 if(product.mode==="completion")warnings.push(`Guaranteed target completion: ${quantities.total} of ${quantities.fullTotal} target copies remain. Price is rounded up after prorating missing copies; all owned copies count. Lifetime history is preserved.`);
 if(plan&&product.currency!=="gold")warnings.push("Additional copies are possible. Commercially funded randomized purchases are disabled pending owner policy review.");
 const originalPrice=offerPrice(promotion?product:{...product,discountBasisPoints:0},ids,fullCount,state.rules,product.type==="bundle"&&product.mode!=="first_copy"?quantities:undefined);
 const terms={product,promotion:promotion?{id:promotion.id,startsAt:promotion.startsAt,endsAt:promotion.endsAt}:null,originalPrice:originalPrice>price?originalPrice:null,discountBasisPoints:priced.discountBasisPoints,featured:featuredAt(product,now),featureSection:product.feature?.section??null,featureOrder:product.feature?.order??10000,shopVersion:state.id,economyVersion:state.economy.id,contentVersion:state.pack.id,currency:product.currency,price,count,unitQuantity:product.quantity,totalCopies:product.mode==="cosmetic"?0:product.type==="bundle"&&product.mode!=="first_copy"?quantities.total:count*product.quantity,grantQuantities:product.type==="bundle"?Object.fromEntries(eligible.map(c=>[c.id,quantities.grants[c.id]])):undefined,targetQuantities:product.type==="bundle"?quantities.targets:undefined,fullCopies:quantities.fullTotal,fullCount,eligibleCount:product.mode==="cosmetic"?cosmetics.length:eligible.length,eligibleIds:eligible.map(card=>card.id).sort(),cosmetics,ownedQuantities:Object.fromEntries(full.map(card=>[card.id,state.quantities.get(card.id)??0])),odds,warnings,limit:product.limit?{...product.limit,used}:null,sandbox:!!state.account.sandbox};
 // Ownership counts are informational for explicit additional-copy purchases;
 // first-copy/cosmetic eligibility and prices remain strict confirmation terms.
 const fingerprint=economyDigest({product,shopVersion:state.id,economyVersion:state.economy.id,contentVersion:state.pack.id,price,count,promotion:terms.promotion,eligibleIds:terms.eligibleIds,completionGrants:product.mode==="completion"?terms.grantQuantities:undefined,cosmetics,sandbox:terms.sandbox});
 return {available:!problems.length,reasons:problems,terms,fingerprint,eligible,product};
}
export async function createShopQuote(c:Client,playerId:string,productId:string,config:BackendConfig){
 const state=await shopState(c,playerId,config),value=await offer(c,state,playerId,productId);if(!value.available)reject(409,"product_unavailable",value.reasons.join(" "));
 const id=crypto.randomUUID();await c.query("INSERT INTO kd.shop_quote(id,player_id,product_id,shop_version,economy_version,content_version,fingerprint,currency_id,price,terms,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+$11::integer*interval '1 second')",[id,playerId,productId,state.id,state.economy.id,state.pack.id,value.fingerprint,value.terms.currency,value.terms.price,value.terms,state.rules.quoteSeconds]);const row=(await c.query("SELECT expires_at FROM kd.shop_quote WHERE id=$1",[id])).rows[0];return {id,expiresAt:row.expires_at,...value.terms};
}
