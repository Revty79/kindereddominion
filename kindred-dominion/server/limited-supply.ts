import crypto from "node:crypto";
import type {DB} from "./db";
import type {Client} from "./economy-assets";
import {limitedEditionSchema,type LimitedEdition,type LimitedMethod} from "./limited-rules";
import {economyDigest} from "./economy-hash";
import {reject} from "./errors";
export async function limitedReady(c:DB|Client){return !!(await c.query("SELECT to_regclass('kd.limited_edition') AS relation")).rows[0].relation;}
export async function limitedEdition(c:DB|Client,id:string,lock=false):Promise<{id:string;spec:LimitedEdition;issued:number;max_supply:number;core:unknown;shop_version:string;config_version:string;content_version:string}>{const row=(await c.query("SELECT * FROM kd.limited_edition WHERE id=$1"+(lock?" FOR UPDATE":""),[id])).rows[0];if(!row)reject(404,"limited_edition_missing","This published edition was not found.");return {...row,spec:limitedEditionSchema.parse(row.definition),issued:Number(row.issued),max_supply:Number(row.max_supply)};}
// An ambiguous provider request continues to reserve stock until verified terminal.
const releasable = `state='held' AND expires_at<=now() AND (
 reference NOT LIKE 'commercial:%' OR EXISTS (
 SELECT 1 FROM kd.commerce_order o
 WHERE o.id=substring(reference from '^commercial:([0-9a-f-]{36}):')::uuid
 AND o.payment_state<>'paid' AND (
 o.checkout_state='expired' OR o.payment_state IN ('expired','cancelled') OR (
 o.checkout_session_id IS NULL AND NOT EXISTS (
 SELECT 1 FROM kd.commerce_checkout_attempt a WHERE a.order_id=o.id))))
 )`;
export async function expireLimitedReservations(c:Client,id?:string){
 const ids=(await c.query("SELECT DISTINCT edition_id FROM kd.limited_reservation WHERE "+releasable+" AND ($1::text IS NULL OR edition_id=$1) ORDER BY edition_id",[id??null])).rows;
 let expired=0;for(const row of ids){await c.query("SELECT id FROM kd.limited_edition WHERE id=$1 FOR UPDATE",[row.edition_id]);expired+=(await c.query("UPDATE kd.limited_reservation SET state='expired' WHERE edition_id=$1 AND "+releasable,[row.edition_id])).rowCount??0;}return expired;
}
export async function limitedAvailability(c:DB|Client,id:string,playerId?:string){
 const row=(await c.query(`SELECT e.*,statement_timestamp() observed,
 COALESCE((SELECT jsonb_agg(h) FROM(SELECT allocation_id,count(*)::text n FROM kd.limited_reservation WHERE edition_id=e.id AND state='held' AND(expires_at>now() OR reference LIKE 'commercial:%') GROUP BY allocation_id)h),'[]'::jsonb) held,
 COALESCE((SELECT jsonb_agg(i) FROM(SELECT allocation_id,count(*)::text n FROM kd.limited_instance WHERE edition_id=e.id GROUP BY allocation_id)i),'[]'::jsonb) issued_groups,
 (SELECT count(*)::text FROM kd.limited_instance WHERE edition_id=e.id AND state='active') active_count,
 (SELECT count(*)::text FROM kd.limited_reservation WHERE edition_id=e.id AND player_id=$2 AND method='shop' AND(state='fulfilled' OR state='held' AND(expires_at>now() OR reference LIKE 'commercial:%'))) own
 FROM kd.limited_edition e WHERE id=$1`,[id,playerId??null])).rows[0];if(!row)reject(404,"limited_edition_missing","This published edition was not found.");
 const spec=limitedEditionSchema.parse(row.definition),held=row.held as {allocation_id:string|null;n:string}[],issued=row.issued_groups as {allocation_id:string|null;n:string}[],maximum=Number(row.max_supply),count=Number(row.issued),allocated=spec.allocations.reduce((n,a)=>n+a.quantity,0),publicIssued=Number(issued.find(r=>r.allocation_id===null)?.n??0),pending=held.reduce((n,r)=>n+Number(r.n),0),publicHeld=Number(held.find(r=>r.allocation_id===null)?.n??0),allocations=spec.allocations.map(a=>({...a,issued:Number(issued.find(r=>r.allocation_id===a.id)?.n??0),pending:Number(held.find(r=>r.allocation_id===a.id)?.n??0)}));
 return {id,methods:spec.methods,name:spec.name,description:spec.description,type:spec.type,maximum,issued:count,active:Number(row.active_count),pending,available:Math.max(0,maximum-allocated-publicIssued-publicHeld),unissued:Math.max(0,maximum-count),rewardReserved:allocated,allocations,soldOut:count===maximum,status:spec.status,enabled:spec.enabled,serialized:spec.serialized,serialPolicy:spec.serialized?"Sequentially assigned atomically at fulfillment; no chosen or recycled serials.":"Unique collectible instance; individual serial numbering is not advertised.",purchaseLimit:spec.purchaseLimit??null,accountPurchases:Number(row.own),tradeable:spec.tradeable,cosmeticTrading:spec.cosmeticTrading,testOnly:spec.testOnly,contents:spec.contents,allowedFormats:spec.allowedFormats,exclusiveGameplay:spec.exclusiveGameplay,releaseAt:spec.releaseAt??null,startsAt:spec.startsAt??null,endsAt:spec.endsAt??null,artwork:spec.artwork??null,asOf:new Date(row.observed).toISOString(),retirementPolicy:"Retirement permanently consumes lifetime issuance. Serial numbers are never recycled."};
}
export type LimitedReservationInput={editionId:string;playerId:string;method:LimitedMethod;allocationId?:string;reference:string;expiresAt?:string};
export async function reserveLimited(c:Client,input:LimitedReservationInput){const {editionId,playerId,method,allocationId,reference}=input,e=await limitedEdition(c,editionId,true);await expireLimitedReservations(c,editionId);const fingerprint=economyDigest({editionId,playerId,method,allocationId:allocationId??null,reference}),prior=(await c.query("SELECT * FROM kd.limited_reservation WHERE reference=$1",[reference])).rows[0];if(prior){if(prior.fingerprint!==fingerprint)reject(409,"idempotency_conflict","The limited collectible request has different original terms.");return prior;}
 const account=(await c.query("SELECT a.sandbox,p.status FROM kd.economy_account a JOIN kd.player p ON p.id=a.player_id WHERE a.player_id=$1",[playerId])).rows[0];if(!account||account.status!=="active"||account.sandbox!==e.spec.testOnly)reject(403,"limited_environment_boundary","Edition and account must belong to the same ordinary or permanent sandbox cohort.");
 const now=new Date((await c.query("SELECT now() n")).rows[0].n),spec:LimitedEdition=e.spec;if(spec.status!=="published"||!spec.enabled||!spec.methods.includes(method)||[spec.releaseAt,spec.startsAt].some(t=>t&&Date.parse(t)>now.getTime())||spec.endsAt&&Date.parse(spec.endsAt)<=now.getTime())reject(409,"limited_unavailable","This edition is not available through this acquisition method or release window.");
 const supply=await limitedAvailability(c,editionId,playerId);if(method==="shop"&&spec.purchaseLimit&&supply.accountPurchases>=spec.purchaseLimit)reject(409,"limited_account_limit","The edition's lifetime per-account purchase limit is reached, including pending purchases.");
 if(allocationId){const allocation=supply.allocations.find(a=>a.id===allocationId&&a.method===method);if(!allocation||allocation.quantity-allocation.issued-allocation.pending<1)reject(409,"limited_allocation_exhausted","The named reward allocation is unavailable or exhausted.");}else if(supply.available<1)reject(409,"limited_sold_out","No unreserved purchase/general issuance remains. Reserved reward allocations are protected.");
 const expiry=input.expiresAt?new Date(input.expiresAt):new Date(now.getTime()+24*3600000);if(!Number.isFinite(expiry.getTime())||expiry<=now||expiry.getTime()-now.getTime()>24*3600000+1000)reject(400,"limited_reservation_window","Supply reservations need a future deadline of at most twenty-four hours.");
 return (await c.query("INSERT INTO kd.limited_reservation(id,edition_id,player_id,method,allocation_id,reference,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[crypto.randomUUID(),editionId,playerId,method,allocationId??null,reference,fingerprint,expiry])).rows[0];
}
export async function releaseLimitedOrder(c:Client,orderId:string){if(!await limitedReady(c))return;const rows=(await c.query("SELECT DISTINCT edition_id FROM kd.limited_reservation WHERE reference LIKE $1 AND state='held' ORDER BY edition_id",['commercial:'+orderId+':%'])).rows;for(const row of rows){await c.query("SELECT id FROM kd.limited_edition WHERE id=$1 FOR UPDATE",[row.edition_id]);await c.query("UPDATE kd.limited_reservation SET state='cancelled' WHERE edition_id=$1 AND reference LIKE $2 AND state='held'",[row.edition_id,'commercial:'+orderId+':%']);}}
