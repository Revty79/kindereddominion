import crypto from "node:crypto";
import type {BackendConfig} from "./config";
import {transaction,type DB} from "./db";
import {inventoryTransaction} from "./inventory";
import {lockPlayer,moveCurrency,assetEnvironment,type Client,type Provenance} from "./economy-assets";
import {economyDigest} from "./economy-hash";
import {economySchema} from "./economy-rules";
import {economyEvent} from "./economy";
import {requireEconomy} from "./configuration";
import {contentVersion} from "./catalog";
import {shopSchema,productSchema,type Product} from "./shop-rules";
import {drawPack,packPlan} from "./shop-draw";
import {shopState,offer,permittedPool,type ShopState} from "./shop-catalog";
import {registerRewardEntitlement,type RewardEntitlement,type EntitlementContext} from "./reward-entitlements";
import {reject} from "./errors";

type Fulfillment={purchaseId:string;source:"wallet"|"reward"|"commercial"|"sandbox";sourceReference?:string;actorId?:string;rewardId?:string;funding?:{lot_id:string;origin:string;quantity:string;source_reference:string|null}[];cardOrigin?:Provenance["origin"];allowEmpty?:boolean};
export async function fulfillShopAssets(c:Client,playerId:string,state:ShopState,product:Product,eligible:ShopState["cards"],context:Fulfillment){
 const sandbox=!!state.account.sandbox,testFunding=context.funding?.some(lot=>["administrator","sandbox"].includes(lot.origin))??false;
 if(product.testOnly&&!sandbox)reject(403,"sandbox_account_required","Testing artwork and products require a permanently designated sandbox account.");
 const originalQuantities=new Map(state.quantities),observed=new Set(state.lifetime),now=new Date((await c.query("SELECT now() AS value")).rows[0].value),purchasedFunds=context.funding?.some(lot=>lot.origin==="purchased")??false;
 const origin:Provenance["origin"]=sandbox?"sandbox":testFunding?"administrator":context.cardOrigin??(product.mode==="first_copy"?"first_copy":"purchased"),tradeable=product.mode==="additional"&&product.tradeable&&!sandbox&&!testFunding&&origin!=="administrator";
 const provenance:Provenance={origin,tradeable,sandbox,configVersion:state.id,sourceReference:context.purchaseId,...(tradeable&&purchasedFunds&&state.rules.purchasedHoldHours?{holdUntil:new Date(now.getTime()+state.rules.purchasedHoldHours*3600000).toISOString()}: {})};
 let slots:ReturnType<typeof drawPack>=[],items:{cardId:string;quantity:number;newCard:boolean;rarity:string;previousQuantity:number;currentQuantity:number}[]=[],acquisition:any=null;
 const cosmetics:string[]=[],packIds:string[]=[];
 if(product.type==="booster"){
  const plan=packPlan(product,eligible,state.rules);if(!plan.feasible&&!context.allowEmpty)reject(409,"pack_unavailable","This pack can no longer satisfy its disclosed eligible contents.");
  if(plan.feasible)slots=drawPack(product,eligible,state.rules,observed);
  const totals=new Map<string,number>();for(const slot of slots)totals.set(slot.cardId,(totals.get(slot.cardId)??0)+slot.quantity);
  items=[...totals].map(([cardId,quantity])=>({cardId,quantity,newCard:!observed.has(cardId),rarity:state.rules.rarities[cardId],previousQuantity:originalQuantities.get(cardId)??0,currentQuantity:(originalQuantities.get(cardId)??0)+quantity}));
 }else if(product.type==="bundle")items=eligible.map(card=>({cardId:card.id,quantity:product.quantity,newCard:!observed.has(card.id),rarity:state.rules.rarities[card.id],previousQuantity:originalQuantities.get(card.id)??0,currentQuantity:(originalQuantities.get(card.id)??0)+product.quantity}));
 if(product.type!=="cosmetic"){
  if(!items.length&&!context.allowEmpty)reject(409,"empty_acquisition","No eligible playable cards remain; no currency was charged.");
  if(items.length){const changes=items.map(item=>{const card=state.pack.cards.find(card=>card.id===item.cardId);if(!card?.collectible)reject(409,"card_unavailable","A permanent card identity is unavailable in the original published snapshot.");return {editionId:`${card.collectible.gameplayId}:${card.collectible.edition}`,quantity:item.quantity};});acquisition=await inventoryTransaction(c,playerId,"shop:"+context.purchaseId,"shop:"+product.id,changes,context.actorId??null,provenance);}
 }
 for(const cosmeticId of product.cosmetics){const definition=state.rules.cosmetics.find(cosmetic=>cosmetic.id===cosmeticId);if(!definition||!definition.enabled||definition.status!=="published"||definition.testOnly&&!sandbox)reject(409,"cosmetic_unavailable","This cosmetic's published snapshot or account eligibility is unavailable.");
  const acquisitionId=crypto.randomUUID(),cosmeticOrigin=sandbox?"sandbox":context.source==="reward"?(context.cardOrigin??"achievement"):testFunding?"administrator":"purchased";
  const owned=await c.query("INSERT INTO kd.cosmetic_ownership(player_id,cosmetic_id,acquired_version,origin,environment,sandbox,current_acquisition) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(player_id,cosmetic_id) DO UPDATE SET revoked=false,current_acquisition=$7 WHERE kd.cosmetic_ownership.revoked AND NOT kd.cosmetic_ownership.restricted",[playerId,cosmeticId,state.id,cosmeticOrigin,await assetEnvironment(c),sandbox,acquisitionId]);
  if(owned.rowCount){await c.query("INSERT INTO kd.cosmetic_acquisition(id,player_id,cosmetic_id,purchase_id,config_version,origin,operation,reason) VALUES($1,$2,$3,$4,$5,$6,'grant',$7)",[acquisitionId,playerId,cosmeticId,context.purchaseId,state.id,cosmeticOrigin,product.name]);cosmetics.push(cosmeticId);}
 }
 if(product.type==="cosmetic"&&!cosmetics.length&&!context.allowEmpty)reject(409,"cosmetics_already_owned","No unowned cosmetic remains; no currency was charged.");
 if(product.type==="booster"){
  const packId=crypto.randomUUID();await c.query("INSERT INTO kd.shop_pack(id,player_id,purchase_id,product_id,shop_version,content_version,label,cards,slot_results,acquisition_id,revealed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN jsonb_array_length($8::jsonb)=0 THEN now() ELSE NULL END)",[packId,playerId,context.purchaseId,product.id,state.id,state.pack.id,product.name,JSON.stringify(slots.map(slot=>({cardId:slot.cardId,quantity:slot.quantity,newCard:slot.newCard,rarity:slot.rarity}))),JSON.stringify(slots),acquisition?.id??null]);packIds.push(packId);
 }
 return {cards:items,cosmetics,packIds,acquisitionId:acquisition?.id??null,provenance:{origin,tradeable,sandbox,holdUntil:provenance.holdUntil??null},emptyReason:!items.length&&!cosmetics.length?"Eligible first copies or cosmetics were already complete; the free entitlement has no further assets.":null};
}
export async function purchaseShop(c:Client,playerId:string,quoteId:string,key:string,config:BackendConfig,actorId?:string){
 requireEconomy(config);await lockPlayer(c,playerId);const fingerprint=economyDigest({quoteId}),previous=(await c.query("SELECT * FROM kd.shop_purchase WHERE player_id=$1 AND idempotency_key=$2",[playerId,key])).rows[0];
 if(previous){if(previous.fingerprint!==fingerprint)reject(409,"idempotency_conflict","This purchase key was already used for another confirmation.");return {...previous.result,replayed:true};}
 const sameQuote=(await c.query("SELECT result FROM kd.shop_purchase WHERE player_id=$1 AND quote_id=$2",[playerId,quoteId])).rows[0];if(sameQuote)return {...sameQuote.result,replayed:true};
 const quote=(await c.query("SELECT *,expires_at>now() AS fresh FROM kd.shop_quote WHERE id=$1 AND player_id=$2 FOR UPDATE",[quoteId,playerId])).rows[0];if(!quote)reject(404,"quote_missing","This account's purchase confirmation was not found.");if(!quote.fresh)reject(409,"quote_expired","This confirmation expired. Review a fresh exact price and eligible contents.");
 await c.query("SELECT domain FROM kd.configuration_selection WHERE domain=ANY($1) ORDER BY domain FOR SHARE",[["economy","shop"]]);
 const state=await shopState(c,playerId,config),current=await offer(c,state,playerId,quote.product_id);if(!current.available)reject(409,"product_unavailable",current.reasons.join(" "));if(quote.fingerprint!==current.fingerprint)reject(409,"quote_changed","Price, publication or first-copy eligibility changed. Review and confirm the new terms before spending.");
 const id=crypto.randomUUID(),money=await moveCurrency(c,playerId,"shop-debit:"+id,{[current.product.currency]:-current.terms.price},{type:"shop-purchase",reason:current.product.name,origin:state.account.sandbox?"sandbox":"earned",configVersion:state.economy.id,referenceId:id,actorId:actorId??null},state.economy.rules),funding=(await c.query("SELECT l.id AS lot_id,l.origin,s.quantity,l.source_reference FROM kd.currency_consumption s JOIN kd.currency_lot l ON l.id=s.lot_id WHERE s.transaction_id=$1 ORDER BY l.id",[money.id])).rows;
 const source=state.account.sandbox?"sandbox":"wallet",assets=await fulfillShopAssets(c,playerId,state,current.product,current.eligible,{purchaseId:id,source,actorId,funding}),result={id,productId:current.product.id,label:current.product.name,shopVersion:state.id,economyVersion:state.economy.id,contentVersion:state.pack.id,currency:current.terms.currency,price:current.terms.price,transactionId:money.id,source,funding,...assets};
 await c.query("INSERT INTO kd.shop_purchase(id,player_id,idempotency_key,fingerprint,quote_id,product_id,shop_version,economy_version,content_version,environment,source,currency_id,price,transaction_id,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",[id,playerId,key,fingerprint,quoteId,current.product.id,state.id,state.economy.id,state.pack.id,await assetEnvironment(c),source,current.terms.currency,current.terms.price,money.id,result]);
 await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'shop-purchase',$2,$3)",[actorId??playerId,id,{playerId,productId:current.product.id,transactionId:money.id,configVersion:state.id,sandbox:!!state.account.sandbox}]);
 if(!state.account.sandbox){const newCards=assets.cards.filter(card=>card.newCard);if(newCards.length)await economyEvent(c,playerId,"unique_card","purchase:"+id,newCards.length,{},state.economy);if(current.product.type==="booster")await economyEvent(c,playerId,"booster_acquired","purchase-pack:"+id,1,{},state.economy);}
 return {...result,replayed:false};
}
async function entitlementShopState(c:Client,playerId:string,snapshot:any,context:EntitlementContext):Promise<ShopState>{
 const pack=await contentVersion(c,snapshot.content_version),rules=shopSchema.parse(snapshot.snapshot.rules),economyRow=(await c.query("SELECT document FROM kd.configuration_version WHERE id=$1 AND domain='economy'",[context.economyVersion])).rows[0];if(!economyRow)reject(409,"reward_version_missing","The original economy reward publication is unavailable.");
 const identities=new Set((await c.query("SELECT id FROM kd.card_identity WHERE NOT retired")).rows.map(row=>row.id)),quantities=new Map<string,number>((await c.query("SELECT e.card_id,sum(i.quantity)::text AS quantity FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE player_id=$1 GROUP BY e.card_id",[playerId])).rows.map(row=>[row.card_id,Number(row.quantity)])),lifetime=new Set<string>((await c.query("SELECT card_id FROM kd.lifetime_card WHERE player_id=$1",[playerId])).rows.map(row=>row.card_id)),ownedCosmetics=new Set<string>((await c.query("SELECT cosmetic_id FROM kd.cosmetic_ownership WHERE player_id=$1 AND NOT revoked",[playerId])).rows.map(row=>row.cosmetic_id)),account=(await c.query("SELECT e.*,p.status FROM kd.economy_account e JOIN kd.player p ON p.id=e.player_id WHERE e.player_id=$1",[playerId])).rows[0];
 if(!account||account.status!=="active"||context.origin==="sandbox"&&!account.sandbox)reject(409,"reward_account_unavailable","The reward account or its sandbox boundary is unavailable.");
 return {id:snapshot.shop_version,economy:{id:context.economyVersion,rules:economySchema.parse(economyRow.document)},pack,cards:pack.cards.filter(card=>identities.has(card.id)),rules,quantities,lifetime,ownedCosmetics,account};
}
export function registerShopRewards(){
 const handler=async(c:Client,playerId:string,entitlement:RewardEntitlement,context:EntitlementContext)=>{
  await lockPlayer(c,playerId);const pinned=(await c.query("SELECT * FROM kd.reward_product_snapshot WHERE economy_version=$1 AND type=$2 AND definition_id=$3",[context.economyVersion,entitlement.type,entitlement.definitionId])).rows[0];if(!pinned)reject(409,"reward_product_snapshot_missing","The original reward product snapshot is unavailable; no partial grant was accepted.");
  const rewardId=(await c.query("SELECT reward_id FROM kd.reward_entitlement WHERE id=$1 AND player_id=$2",[entitlement.entitlementId,playerId])).rows[0]?.reward_id;if(!rewardId)reject(409,"reward_receipt_missing","The entitlement's original reward receipt is unavailable.");
  for(let index=0;index<entitlement.quantity;index++){
   const key=`entitlement:${entitlement.entitlementId}:${index}`;if((await c.query("SELECT id FROM kd.shop_purchase WHERE player_id=$1 AND idempotency_key=$2",[playerId,key])).rowCount)continue;
   const state=await entitlementShopState(c,playerId,pinned,context),definition=pinned.snapshot.definition;
   const product=entitlement.type==="booster"?productSchema.parse(definition):productSchema.parse({id:"reward-"+definition.id,name:definition.name,description:"Published cosmetic reward",category:"cosmetics",type:"cosmetic",mode:"cosmetic",status:"published",enabled:true,testOnly:definition.testOnly,currency:"gold",price:1,cosmetics:[definition.id]});
   const pool=permittedPool(state,product),eligible=product.mode==="first_copy"?pool.filter(card=>!state.lifetime.has(card.id)&&!(state.quantities.get(card.id)??0)):pool,id=crypto.randomUUID(),assets=await fulfillShopAssets(c,playerId,state,product,eligible,{purchaseId:id,source:"reward",sourceReference:entitlement.entitlementId,rewardId,actorId:context.actorId,cardOrigin:context.cardOrigin,allowEmpty:true}),result={id,productId:entitlement.definitionId,label:product.name,shopVersion:state.id,economyVersion:context.economyVersion,contentVersion:state.pack.id,currency:null,price:0,source:"reward",entitlementId:entitlement.entitlementId,...assets};
   await c.query("INSERT INTO kd.shop_purchase(id,player_id,idempotency_key,fingerprint,product_id,shop_version,economy_version,content_version,environment,source,source_reference,reward_id,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reward',$10,$11,$12)",[id,playerId,key,economyDigest({entitlementId:entitlement.entitlementId,index}),entitlement.definitionId,state.id,context.economyVersion,state.pack.id,await assetEnvironment(c),entitlement.entitlementId,rewardId,result]);
   if(!state.account.sandbox){const newly=assets.cards.filter(card=>card.newCard);if(newly.length)await economyEvent(c,playerId,"unique_card","reward-purchase:"+id,newly.length,{},state.economy);if(entitlement.type==="booster"&&assets.cards.length)await economyEvent(c,playerId,"booster_acquired","reward-pack:"+id,1,{},state.economy);}
  }
 };
 registerRewardEntitlement("booster",handler);registerRewardEntitlement("cosmetic",handler);
}
export async function confirmShopPurchase(pool:DB,playerId:string,quoteId:string,key:string,config:BackendConfig){return transaction(pool,c=>purchaseShop(c,playerId,quoteId,key,config));}
