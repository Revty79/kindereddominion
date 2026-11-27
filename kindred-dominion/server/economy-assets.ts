import crypto from "node:crypto";
import type {PoolClient} from "pg";
import {reject} from "./errors";
import {economyDigest} from "./economy-hash";
import type {EconomyRules} from "./economy-rules";
export type Client=PoolClient;
export type AssetOrigin="legacy_unknown"|"starter"|"first_copy"|"mastery"|"achievement"|"administrator"|"promotional"|"purchased"|"sandbox"|"traded";
export type Provenance={origin:AssetOrigin;tradeable?:boolean;sandbox?:boolean;configVersion?:string;sourceReference?:string;sourceLot?:string;holdUntil?:string;onlyLots?:string[];exactLots?:{id:string;quantity:number}[];returnOriginalHeldLots?:boolean};
export async function lockPlayer(c:Client,id:string){if(!(await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[id])).rowCount)reject(404,"player_missing","Player was not found.");await c.query("INSERT INTO kd.economy_account(player_id) VALUES($1) ON CONFLICT DO NOTHING",[id]);}
export async function assetEnvironment(c:Client){const row=(await c.query("SELECT environment FROM kd.environment_guard WHERE singleton")).rows[0];if(!row)reject(503,"environment_unavailable","Database environment is unavailable.");return row.environment as string;}
export async function applyOwnershipLots(c:Client,playerId:string,acquisitionId:string,changes:{editionId:string;quantity:number}[],provenance:Provenance={origin:"administrator",tradeable:false}){
  const environment=await assetEnvironment(c);
  for(const change of [...changes].sort((a,b)=>a.editionId.localeCompare(b.editionId))){
    if(change.quantity>0){
      await c.query("INSERT INTO kd.ownership_lot(id,player_id,edition_id,acquisition_id,origin,environment,initial_quantity,remaining,tradeable,sandbox,config_version,source_reference,source_lot,hold_until) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13)",[crypto.randomUUID(),playerId,change.editionId,acquisitionId,provenance.origin,environment,change.quantity,provenance.tradeable??false,provenance.sandbox??false,provenance.configVersion??null,provenance.sourceReference??null,provenance.sourceLot??null,provenance.holdUntil??null]);
      await c.query("INSERT INTO kd.lifetime_card(player_id,card_id,first_acquisition) SELECT $1,card_id,$3 FROM kd.edition WHERE id=$2 ON CONFLICT DO NOTHING",[playerId,change.editionId,acquisitionId]);
    }else{
      const rows=(await c.query("SELECT id,remaining-reserved AS available FROM kd.ownership_lot WHERE player_id=$1 AND edition_id=$2 AND remaining>reserved AND NOT restricted AND ($3::uuid[] IS NULL OR id=ANY($3)) AND (hold_until IS NULL OR hold_until<=now() OR ($4 AND $3::uuid[] IS NOT NULL)) ORDER BY created_at,id FOR UPDATE",[playerId,change.editionId,provenance.exactLots?.map(l=>l.id)??provenance.onlyLots??null,provenance.returnOriginalHeldLots??false])).rows;
      const exact=provenance.exactLots?.filter(l=>rows.some(row=>row.id===l.id));if(exact&&(new Set(provenance.exactLots!.map(l=>l.id)).size!==provenance.exactLots!.length||exact.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<=0||l.quantity>rows.find(row=>row.id===l.id)!.available)||exact.reduce((n,l)=>n+l.quantity,0)!==-change.quantity))reject(409,"reserved_lot_plan_changed","The exact reserved acquisition lots no longer cover this transfer.");
      if(rows.reduce((n,r)=>n+r.available,0)<-change.quantity)reject(409,"inventory_reserved","Available acquisition lots do not cover this adjustment; reserved copies are protected.");
      let remaining=-change.quantity;for(const row of rows){if(!remaining)break;const amount=exact?exact.find(l=>l.id===row.id)!.quantity:Math.min(remaining,row.available);await c.query("UPDATE kd.ownership_lot SET remaining=remaining-$2 WHERE id=$1",[row.id,amount]);await c.query("INSERT INTO kd.ownership_consumption(acquisition_id,lot_id,quantity) VALUES($1,$2,$3)",[acquisitionId,row.id,amount]);remaining-=amount;}
    }
  }
  if(provenance.exactLots){const consumed=(await c.query("SELECT lot_id,quantity FROM kd.ownership_consumption WHERE acquisition_id=$1",[acquisitionId])).rows;if(consumed.length!==provenance.exactLots.length||provenance.exactLots.some(l=>consumed.find(r=>r.lot_id===l.id)?.quantity!==l.quantity))reject(409,"reserved_lot_plan_changed","The transfer did not consume exactly its reserved acquisition lots.");}
}
export type MoneyMeta={type:string;reason:string;origin:"earned"|"promotional"|"administrator"|"sandbox"|"purchased";configVersion:string;referenceId?:string;actorId?:string|null;onlyLots?:string[]};
export async function moveCurrency(c:Client,playerId:string,key:string,deltas:Record<string,number>,meta:MoneyMeta,rules:EconomyRules){
  await lockPlayer(c,playerId);
  const environment=await assetEnvironment(c);if(!["dev","integration","test"].includes(environment))reject(403,"development_economy_only","Production economy mutations are disabled.");
  const fingerprint=economyDigest({deltas,meta}),previous=(await c.query("SELECT * FROM kd.economy_transaction WHERE player_id=$1 AND idempotency_key=$2",[playerId,key])).rows[0];
  if(previous){if(previous.fingerprint!==fingerprint)reject(409,"idempotency_conflict","This transaction identifier was used for different terms.");return {...previous.result,replayed:true};}
  const account=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[playerId])).rows[0];
  if(meta.origin==="sandbox"&&!account.sandbox)reject(403,"sandbox_account_required","Sandbox currency requires an explicitly designated sandbox account.");
  if(account.sandbox&&meta.origin!=="sandbox"&&Object.values(deltas).some(n=>n>0))reject(403,"sandbox_origin_required","Sandbox accounts only accept sandbox currency credits.");
  const id=crypto.randomUUID(),result={id,deltas,origin:meta.origin,referenceId:meta.referenceId??null};
  await c.query("INSERT INTO kd.economy_transaction(id,player_id,idempotency_key,fingerprint,type,reason,origin,environment,config_version,reference_id,actor_id,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[id,playerId,key,fingerprint,meta.type,meta.reason,meta.origin,environment,meta.configVersion,meta.referenceId??null,meta.actorId??null,result]);
  for(const [currency,delta]of Object.entries(deltas).sort(([a],[b])=>a.localeCompare(b))){
    if(!Number.isSafeInteger(delta)||Math.abs(delta)>1_000_000_000_000)reject(400,"invalid_currency_amount","Currency changes require bounded integer units.");if(!delta)continue;
    if(!rules.currencies.some(x=>x.id===currency&&x.active))reject(400,"currency_inactive","The requested currency is unavailable in this rule version.");
    if(delta>0){const total=(await c.query("SELECT coalesce(sum(balance),0)::text AS balance FROM kd.wallet_balance WHERE player_id=$1 AND currency_id=$2",[playerId,currency])).rows[0].balance;if(BigInt(total)+BigInt(delta)>BigInt(Number.MAX_SAFE_INTEGER))reject(400,"currency_limit","Currency totals exceed the supported integer accounting range.");}
    const entry=async(origin:string,amount:number)=>{const row=(await c.query(amount>0?"INSERT INTO kd.wallet_balance(player_id,currency_id,origin,balance) VALUES($1,$2,$3,$4) ON CONFLICT(player_id,currency_id,origin) DO UPDATE SET balance=kd.wallet_balance.balance+$4::bigint RETURNING balance":"UPDATE kd.wallet_balance SET balance=balance+$4::bigint WHERE player_id=$1 AND currency_id=$2 AND origin=$3 AND balance-held>=-$4::bigint RETURNING balance",[playerId,currency,origin,amount])).rows[0];if(!row)reject(409,"insufficient_balance","Wallet balance and available lots require reconciliation.");await c.query("INSERT INTO kd.currency_entry(transaction_id,player_id,currency_id,origin,delta,resulting_balance) VALUES($1,$2,$3,$4,$5,$6)",[id,playerId,currency,origin,amount,row.balance]);};
    if(delta>0){await entry(meta.origin,delta);await c.query("INSERT INTO kd.currency_lot(id,player_id,currency_id,origin,transaction_id,initial_quantity,remaining,source_reference) VALUES($1,$2,$3,$4,$5,$6,$6,$7)",[crypto.randomUUID(),playerId,currency,meta.origin,id,delta,meta.referenceId??null]);}
    else{
      const allowed=account.sandbox?["sandbox"]:["earned","promotional","administrator","purchased"];
      const lots=(await c.query("SELECT * FROM kd.currency_lot WHERE player_id=$1 AND currency_id=$2 AND origin=ANY($3) AND remaining>held AND ($4::uuid[] IS NULL OR id=ANY($4)) ORDER BY array_position($3::text[],origin),created_at,id FOR UPDATE",[playerId,currency,allowed,meta.onlyLots??null])).rows;
      if(lots.reduce((n,r)=>n+Number(r.remaining)-Number(r.held),0)<-delta)reject(409,"insufficient_balance","Available currency cannot cover this transaction; no partial purchase was accepted.");
      let remaining=-delta;const totals=new Map<string,number>();for(const lot of lots){if(!remaining)break;const amount=Math.min(remaining,Number(lot.remaining)-Number(lot.held));await c.query("UPDATE kd.currency_lot SET remaining=remaining-$2::bigint WHERE id=$1",[lot.id,amount]);await c.query("INSERT INTO kd.currency_consumption(transaction_id,lot_id,quantity) VALUES($1,$2,$3)",[id,lot.id,amount]);totals.set(lot.origin,(totals.get(lot.origin)??0)+amount);remaining-=amount;}
      for(const [origin,amount]of totals)await entry(origin,-amount);
    }
  }
  return {...result,replayed:false};
}
export async function reconcileEconomy(c:Client,playerId?:string){
  const filter=playerId??null;
  const wallets=(await c.query(`WITH sums AS(SELECT player_id,currency_id,origin,sum(delta) AS balance FROM kd.currency_entry WHERE ($1::uuid IS NULL OR player_id=$1) GROUP BY 1,2,3),lots AS(SELECT player_id,currency_id,origin,sum(remaining) AS balance,sum(held) AS held FROM kd.currency_lot WHERE ($1::uuid IS NULL OR player_id=$1) GROUP BY 1,2,3)
SELECT b.player_id,b.currency_id,b.origin FROM kd.wallet_balance b FULL JOIN sums s USING(player_id,currency_id,origin) FULL JOIN lots l USING(player_id,currency_id,origin) WHERE ($1::uuid IS NULL OR coalesce(b.player_id,s.player_id,l.player_id)=$1) AND (coalesce(b.balance,0)<>coalesce(s.balance,0) OR coalesce(b.balance,0)<>coalesce(l.balance,0) OR coalesce(b.held,0)<>coalesce(l.held,0))`,[filter])).rows;
  wallets.push(...(await c.query("SELECT l.player_id,l.currency_id,l.origin,l.id AS lot_id FROM kd.currency_lot l LEFT JOIN (SELECT lot_id,sum(quantity) AS spent FROM kd.currency_consumption GROUP BY lot_id) s ON s.lot_id=l.id WHERE ($1::uuid IS NULL OR l.player_id=$1) AND l.initial_quantity-l.remaining<>coalesce(s.spent,0)",[filter])).rows);
  const inventory=(await c.query(`WITH lots AS(SELECT player_id,edition_id,sum(remaining) AS quantity FROM kd.ownership_lot WHERE ($1::uuid IS NULL OR player_id=$1) GROUP BY 1,2),ledger AS(SELECT a.player_id,e.edition_id,sum(e.delta) AS quantity FROM kd.inventory_entry e JOIN kd.acquisition a ON a.id=e.acquisition_id LEFT JOIN kd.legacy_inventory_baseline b ON b.player_id=a.player_id AND b.edition_id=e.edition_id WHERE ($1::uuid IS NULL OR a.player_id=$1) AND e.id>coalesce(b.inventory_entry_cutoff,0) GROUP BY 1,2)
SELECT coalesce(i.player_id,l.player_id,b.player_id,x.player_id) AS player_id,coalesce(i.edition_id,l.edition_id,b.edition_id,x.edition_id) AS edition_id FROM kd.inventory i FULL JOIN lots l USING(player_id,edition_id) FULL JOIN kd.legacy_inventory_baseline b USING(player_id,edition_id) FULL JOIN ledger x USING(player_id,edition_id) WHERE ($1::uuid IS NULL OR coalesce(i.player_id,l.player_id,b.player_id,x.player_id)=$1) AND (coalesce(i.quantity,0)<>coalesce(l.quantity,0) OR coalesce(i.quantity,0)<>coalesce(b.quantity,0)+coalesce(x.quantity,0))`,[filter])).rows;
  inventory.push(...(await c.query("SELECT l.player_id,l.edition_id,l.id AS lot_id FROM kd.ownership_lot l LEFT JOIN (SELECT lot_id,sum(quantity) AS spent FROM kd.ownership_consumption GROUP BY lot_id) s ON s.lot_id=l.id WHERE ($1::uuid IS NULL OR l.player_id=$1) AND l.initial_quantity-l.remaining<>coalesce(s.spent,0)",[filter])).rows);
  const xp=(await c.query(`WITH totals AS(SELECT player_id,axis,sum(amount) AS xp FROM kd.xp_entry WHERE ($1::uuid IS NULL OR player_id=$1) GROUP BY 1,2) SELECT b.player_id,b.axis FROM kd.xp_balance b FULL JOIN totals t USING(player_id,axis) WHERE ($1::uuid IS NULL OR coalesce(b.player_id,t.player_id)=$1) AND coalesce(b.xp,0)<>coalesce(t.xp,0)`,[filter])).rows;
  return {ok:!wallets.length&&!inventory.length&&!xp.length,wallets,inventory,xp};
}
