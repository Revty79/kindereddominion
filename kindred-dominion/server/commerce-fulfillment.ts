import {ownedCosmeticIds} from "./cosmetic-views";
import {financialRisk} from "./commerce-refund-state";
import {retainedAssetsApproved,explicitCommercialHold} from "./commerce-financial";
import crypto from "node:crypto";
import type {DB} from "./db";
import {transaction} from "./db";
import type {BackendConfig} from "./config";
import type {Client} from "./economy-assets";
import {lockPlayer,moveCurrency,assetEnvironment} from "./economy-assets";
import {commerceAccount} from "./commerce-orders";
import {economyDigest} from "./economy-hash";
import {economySchema} from "./economy-rules";
import {shopSchema,productSchema} from "./shop-rules";
import {contentVersion} from "./catalog";
import {fulfillShopAssets} from "./shop-purchases";
import type {ShopState} from "./shop-catalog";
import {reject} from "./errors";

export async function commercialOrder(c:DB|Client,id:string){const row=(await c.query(`SELECT o.*,p.economy_version,p.shop_version,p.content_version,p.digest AS publication_digest
 FROM kd.commerce_order o JOIN kd.commerce_product_snapshot p ON p.config_version=o.config_version AND p.product_id=o.product_id WHERE o.id=$1`,[id])).rows[0];
 if(!row)reject(404,"commercial_order_missing","The saved commercial order was not found.");if(economyDigest(row.snapshot)!==row.digest||row.digest!==row.publication_digest)reject(503,"commercial_snapshot_integrity","The original commercial publication requires investigation.");return row;}
async function pinnedState(c:Client,order:any):Promise<ShopState>{const economy=(await c.query("SELECT * FROM kd.configuration_version WHERE id=$1 AND domain='economy'",[order.economy_version])).rows[0];if(!economy||economyDigest(economy.document)!==economy.digest)reject(503,"commercial_economy_integrity","The original commercial economy snapshot is unavailable.");
 const pack=await contentVersion(c,order.content_version),quantities=new Map<string,number>((await c.query("SELECT e.card_id,sum(i.quantity)::text AS quantity FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE player_id=$1 GROUP BY e.card_id",[order.player_id])).rows.map(r=>[r.card_id,Number(r.quantity)])),lifetime=new Set<string>((await c.query("SELECT card_id FROM kd.lifetime_card WHERE player_id=$1",[order.player_id])).rows.map(r=>r.card_id)),ownedCosmetics=await ownedCosmeticIds(c,order.player_id),account=(await c.query("SELECT e.*,p.status FROM kd.economy_account e JOIN kd.player p ON p.id=e.player_id WHERE e.player_id=$1",[order.player_id])).rows[0];
 return {id:order.shop_version,economy:{id:economy.id,rules:economySchema.parse(economy.document)},pack,cards:pack.cards,rules:shopSchema.parse(order.snapshot.shopRules),quantities,lifetime,ownedCosmetics,account};}

// Verification is committed separately. Every asset and its source link commits together here.
export async function fulfillCommercialOrder(pool:DB,id:string,eventId:string,config:BackendConfig,afterComponent?:(index:number)=>Promise<void>){if(config.environment==="prod"||!config.economyEnabled)reject(403,"commercial_fulfillment_disabled","Sandbox fulfillment is disabled in this environment.");const identity=await commercialOrder(pool,id);return transaction(pool,async c=>{
 await lockPlayer(c,identity.player_id);const order=await commercialOrder(c,id);await c.query("SELECT id FROM kd.commerce_order WHERE id=$1 FOR UPDATE",[id]);const prior=(await c.query("SELECT result FROM kd.commerce_fulfillment WHERE order_id=$1",[id])).rows[0];if(prior)return {...prior.result,replayed:true};await commerceAccount(c,order.player_id);
 if(order.environment!==await assetEnvironment(c)||!order.sandbox||order.payment_state!=="paid"||!(await c.query("SELECT order_id FROM kd.commerce_payment WHERE order_id=$1 AND payment_id=$2",[id,order.payment_id])).rowCount)reject(409,"payment_verification_required","The original sandbox payment must be independently verified before delivery.");
 const pendingRefund=(await c.query("SELECT id FROM kd.commerce_refund_request WHERE order_id=$1 AND state IN('requested','pending','ambiguous') LIMIT 1",[id])).rowCount;if(await explicitCommercialHold(c,id)||pendingRefund||(financialRisk(order)&&!await retainedAssetsApproved(c,order))) {await c.query("UPDATE kd.commerce_order SET fulfillment_state='needs_review',error_code='commercial_review_required',updated_at=now() WHERE id=$1",[id]);return {orderId:id,needsReview:true};}
 const economy=(await c.query("SELECT document,digest FROM kd.configuration_version WHERE id=$1",[order.economy_version])).rows[0];if(!economy||economyDigest(economy.document)!==economy.digest)reject(503,"commercial_economy_integrity","The pinned economy requires investigation.");
 const money=await moveCurrency(c,order.player_id,"commercial-credit:"+id,order.snapshot.product.aether?{aether:order.snapshot.product.aether}:{},{type:"commercial-sandbox",reason:order.snapshot.product.name,origin:"sandbox",configVersion:order.economy_version,referenceId:id},economySchema.parse(economy.document)),components:any[]=[];
 for(let index=0;index<order.snapshot.components.length;index++){const component=order.snapshot.components[index],state=await pinnedState(c,order),product=productSchema.parse(component.definition),eligible=component.cardIds.map((cardId:string)=>state.pack.cards.find(card=>card.id===cardId));if(eligible.some((card:any)=>!card))reject(409,"commercial_component_missing","An originally promised card definition is unavailable; no partial grant was accepted.");
  const purchaseId=crypto.randomUUID(),assets=await fulfillShopAssets(c,order.player_id,state,product,eligible,{purchaseId,source:"commercial",sourceReference:id,cardOrigin:"sandbox"}),result={id:purchaseId,productId:product.id,label:product.name,shopVersion:state.id,economyVersion:order.economy_version,contentVersion:order.content_version,source:"commercial",commercialOrderId:id,transactionId:money.id,price:0,currency:null,...assets};
  await c.query("INSERT INTO kd.shop_purchase(id,player_id,idempotency_key,fingerprint,product_id,shop_version,economy_version,content_version,environment,source,source_reference,commercial_order_id,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'commercial',$10::uuid::text,$10::uuid,$11)",[purchaseId,order.player_id,`commercial:${id}:${index}`,economyDigest({orderId:id,index,digest:order.digest}),product.id,state.id,order.economy_version,order.content_version,order.environment,id,result]);components.push(result);await afterComponent?.(index);
 }
 const result={orderId:id,paymentId:order.payment_id,eventId,transactionId:money.id,aether:order.snapshot.product.aether,components,sandbox:true,realMoney:false};await c.query("INSERT INTO kd.commerce_fulfillment(order_id,event_id,transaction_id,result) VALUES($1,$2,$3,$4)",[id,eventId,money.id,result]);
 const purchases=components.map(p=>p.id),acquisitions=components.map(p=>p.acquisitionId).filter(Boolean);
 for(const [column,sql,args]of [["currency_lot","SELECT id FROM kd.currency_lot WHERE transaction_id=$1",[money.id]],["ownership_lot","SELECT id FROM kd.ownership_lot WHERE acquisition_id=ANY($1)",[acquisitions]],["cosmetic_acquisition","SELECT id FROM kd.cosmetic_acquisition WHERE purchase_id=ANY($1) AND operation='grant'",[purchases]],["pack_id","SELECT id FROM kd.shop_pack WHERE purchase_id=ANY($1)",[purchases]]] as const)for(const row of(await c.query(sql,[...args])).rows)await c.query(`INSERT INTO kd.commerce_asset_link(id,order_id,${column}) VALUES($1,$2,$3)`,[crypto.randomUUID(),id,row.id]);
 await c.query("UPDATE kd.commerce_order SET fulfillment_state='fulfilled',fulfilled_at=now(),error_code=NULL,updated_at=now() WHERE id=$1",[id]);await c.query("INSERT INTO kd.audit_event(operation,target_id,details) VALUES('commercial-sandbox-fulfillment',$1,$2)",[id,{playerId:order.player_id,paymentId:order.payment_id,eventId,transactionId:money.id}]);return {...result,replayed:false};
 });}

// The immutable fulfillment receipt is the outbox; notification failure cannot undo assets.
export async function projectCommerceNotifications(pool:DB,playerId:string){return transaction(pool,async c=>{await lockPlayer(c,playerId);return c.query(`INSERT INTO kd.commerce_notification(id,player_id,order_id,event_id,kind,title,body,created_at)
 SELECT gen_random_uuid(),o.player_id,o.id,f.event_id,'commercial-delivery','Sandbox purchase delivered','Your verified sandbox purchase is available. Open the permanent order receipt.',f.created_at
 FROM kd.commerce_fulfillment f JOIN kd.commerce_order o ON o.id=f.order_id WHERE o.player_id=$1
 AND NOT EXISTS(SELECT 1 FROM kd.commerce_notification n WHERE n.player_id=$1 AND n.order_id=o.id AND n.kind='commercial-delivery') ORDER BY f.created_at,o.id LIMIT 100 ON CONFLICT DO NOTHING`,[playerId]);});}
