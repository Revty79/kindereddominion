import crypto from "node:crypto";
import {z} from "zod";
import type {Client} from "./economy-assets";
import {assetEnvironment} from "./economy-assets";
import type {TradeItems,TradingRules} from "./trading-rules";
import {originIssues} from "./trading-rules";
import {lotAncestry,lockTradingAncestry} from "./trading-inventory";
import {inventoryTransaction} from "./inventory";
import {limitedEdition,limitedReady} from "./limited-supply";
import {limitedFinanciallyHeld,syncLimitedCosmetics} from "./limited-assets";
import {reject} from "./errors";
export const instanceIds=z.array(z.string().uuid()).max(30).refine(v=>new Set(v).size===v.length,"Choose each exact collectible once.");
export type SerialTerms={offeredInstances?:string[];requestedInstances?:string[]};
export function canonicalInstances(body:SerialTerms){return {...(body.offeredInstances?.length?{offeredInstances:instanceIds.parse(body.offeredInstances).sort()}:{}),...(body.requestedInstances?.length?{requestedInstances:instanceIds.parse(body.requestedInstances).sort()}: {})};}
export function nonemptyTrade(offered:TradeItems,requested:TradeItems,terms:SerialTerms){if(!offered.length&&!terms.offeredInstances?.length||!requested.length&&!terms.requestedInstances?.length)reject(400,"empty_trade","Both participants must explicitly exchange cards or exact collectible instances.");const ids=[...terms.offeredInstances??[],...terms.requestedInstances??[]];if(new Set(ids).size!==ids.length)reject(400,"duplicate_trade_instance","An exact instance cannot appear on both sides.");}
export async function instanceSnapshot(c:Client,terms:SerialTerms){const output:{offered:any[];requested:any[]}={offered:[],requested:[]};for(const [side,ids]of [["offered",terms.offeredInstances],["requested",terms.requestedInstances]] as const){for(const id of ids??[]){const i=(await c.query("SELECT id,edition_id,serial::text,definition_snapshot FROM kd.limited_instance WHERE id=$1",[id])).rows[0];if(!i)reject(409,"limited_instance_unavailable","A specified collectible is unavailable; review the exact instance with its owner.");output[side].push({id:i.id,editionId:i.edition_id,serial:i.serial,name:i.definition_snapshot.name,contents:i.definition_snapshot.contents});}}return output;}
export const instanceCards=(instances:any[]):TradeItems=>{const totals=new Map<string,number>();for(const i of instances)for(const x of i.contents.filter((x:any)=>x.kind==="card"))totals.set(x.id,(totals.get(x.id)??0)+x.quantity);return [...totals].map(([cardId,quantity])=>({cardId,quantity}));};
export function limitedTradeLimits(cards:TradeItems,instances:any[],rules:TradingRules){const count=cards.reduce((n,x)=>n+x.quantity,0)+instances.reduce((n,i)=>n+Math.max(1,i.contents.reduce((v:number,x:any)=>v+x.quantity,0)),0);if(cards.length+instances.length>rules.maxDistinctPerSide||count>rules.maxCopiesPerSide)reject(400,"trade_size_limit","Cards and exact collectible components together exceed the published per-side limits.");}
export async function holdInstances(c:Client,owner:string,ids:string[],versionId:string,expiresAt:string,rules:TradingRules,requireExisting=false){
 if(!ids.length)return;const snapshots=await instanceSnapshot(c,{offeredInstances:ids});await lockTradingAncestry(c,[{playerId:owner,cardIds:instanceCards(snapshots.offered).map(x=>x.cardId)}]);
 // Serialize restrictions, original financial holds and concurrent exact offers.
 await c.query("SELECT id FROM kd.limited_edition WHERE id IN(SELECT edition_id FROM kd.limited_instance WHERE id=ANY($1::uuid[])) ORDER BY id FOR SHARE",[ids]);
 const instances=(await c.query("SELECT * FROM kd.limited_instance WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[ids])).rows;
 if(instances.length!==ids.length)reject(409,"limited_instance_unavailable","The exact original collectible is unavailable.");
 for(const i of instances){const e=await limitedEdition(c,i.edition_id),p=i.original_provenance,components=(await c.query("SELECT * FROM kd.limited_component WHERE instance_id=$1 ORDER BY kind,identity_id",[i.id])).rows;
 const source={...p,id:i.id,source_lot:null,edition_id:i.edition_id,environment:await assetEnvironment(c),created_at:i.issued_at,restricted:i.restricted||await limitedFinanciallyHeld(c,i.id)};
 if(i.owner_id!==owner||i.state!=="active"||!e.spec.tradeable||components.some(x=>x.kind==="cosmetic")&&!e.spec.cosmeticTrading||originIssues([source],await assetEnvironment(c),rules,new Date()).length)reject(409,"limited_trade_ineligible","This exact collectible is bound, restricted, held, retired or not explicitly enabled for trading.");
 for(const x of components.filter(x=>x.kind==="card")){const chain=await lotAncestry(c,x.current_lot);if(!chain.length||chain[0].remaining!==x.quantity||chain[0].reserved||originIssues(chain,await assetEnvironment(c),rules,new Date()).length)reject(409,"limited_trade_ineligible","The exact collectible's original gameplay components are unavailable or restricted.");}
 const h=(await c.query("SELECT *,expires_at>now() AS fresh FROM kd.limited_hold WHERE instance_id=$1",[i.id])).rows[0];
 if(h&&!h.released_at&&h.fresh&&h.version_id!==versionId)reject(409,"limited_instance_reserved","The exact collectible is already reserved by another offer.");
 if(requireExisting&&(!h||h.released_at||!h.fresh||h.version_id!==versionId||h.owner_id!==owner))reject(409,"limited_reservation_changed","The exact originally consented instance hold is unavailable; another copy cannot be substituted.");
 if(!requireExisting)await c.query("INSERT INTO kd.limited_hold(instance_id,version_id,owner_id,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(instance_id) DO UPDATE SET version_id=$2,owner_id=$3,expires_at=$4,released_at=NULL",[i.id,versionId,owner,expiresAt]);
 }
}
export async function releaseInstanceHolds(c:Client,offerId:string){if(await limitedReady(c))await c.query("UPDATE kd.limited_hold h SET released_at=now() FROM kd.trade_offer_version v WHERE v.id=h.version_id AND v.offer_id=$1 AND h.released_at IS NULL",[offerId]);}
export async function transferInstances(c:Client,from:string,to:string,ids:string[],settlementId:string,actorId:string,configId:string){const newCards:string[]=[];
 for(const id of [...ids].sort()){const i=(await c.query("SELECT * FROM kd.limited_instance WHERE id=$1 FOR UPDATE",[id])).rows[0];if(i.owner_id!==from||i.state!=="active")reject(409,"limited_instance_unavailable","The exact original collectible changed ownership.");const components=(await c.query("SELECT * FROM kd.limited_component WHERE instance_id=$1 ORDER BY kind,identity_id",[id])).rows,cards=components.filter(x=>x.kind==="card"),limitedInstance={id,operation:"transfer" as const,parties:[from,to]};
 const outgoing=cards.length?await inventoryTransaction(c,from,"limited-transfer-out:"+settlementId+":"+id,"trade:"+settlementId,cards.map(x=>({editionId:x.inventory_edition,quantity:-x.quantity})),actorId,{origin:"traded",exactLots:cards.map(x=>({id:x.current_lot,quantity:x.quantity})),limitedInstance}):null;
 for(const x of cards){const chain=await lotAncestry(c,x.current_lot),root=chain.at(-1);if(!(await c.query("SELECT 1 FROM kd.lifetime_card WHERE player_id=$1 AND card_id=$2",[to,x.identity_id])).rowCount)newCards.push(x.identity_id);const incoming=await inventoryTransaction(c,to,"limited-transfer-in:"+settlementId+":"+id+":"+x.identity_id,"trade:"+settlementId,[{editionId:x.inventory_edition,quantity:x.quantity}],actorId,{origin:"traded",tradeable:true,sandbox:false,sourceLot:x.current_lot,sourceReference:chain[0].source_reference??root.source_reference??root.acquisition_id,configVersion:configId,limitedInstance,...(chain[0].hold_until?{holdUntil:new Date(chain[0].hold_until).toISOString()}: {})}),lot=(await c.query("SELECT id FROM kd.ownership_lot WHERE acquisition_id=$1",[incoming.id])).rows[0];
 await c.query("INSERT INTO kd.trade_transfer(id,settlement_id,from_player,to_player,edition_id,quantity,source_lot,destination_lot,root_lot,outgoing_acquisition,incoming_acquisition) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[crypto.randomUUID(),settlementId,from,to,x.inventory_edition,x.quantity,x.current_lot,lot.id,root.id,outgoing!.id,incoming.id]);await c.query("UPDATE kd.limited_component SET current_lot=$3 WHERE instance_id=$1 AND kind='card' AND identity_id=$2",[id,x.identity_id,lot.id]);}
 await c.query("INSERT INTO kd.limited_history(id,instance_id,operation,from_player,to_player,actor_id,reference,reason,details) VALUES($1,$2,'transferred',$3,$4,$5,$6,'Exact collectible trade settled',$7)",[crypto.randomUUID(),id,from,to,actorId,settlementId,{serial:i.serial,editionId:i.edition_id}]);await c.query("UPDATE kd.limited_instance SET owner_id=$2 WHERE id=$1",[id,to]);const cosmetics=components.filter(x=>x.kind==="cosmetic").map(x=>x.identity_id);await syncLimitedCosmetics(c,from,cosmetics);await syncLimitedCosmetics(c,to,cosmetics);
 }
 return newCards;
}

export const combinedCards=(cards:TradeItems,instances:any[]):TradeItems=>{const total=new Map<string,number>();for(const x of [...cards,...instanceCards(instances)])total.set(x.cardId,(total.get(x.cardId)??0)+x.quantity);return [...total].map(([cardId,quantity])=>({cardId,quantity}));};
