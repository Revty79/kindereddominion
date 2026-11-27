import crypto from "node:crypto";
import type {PoolClient} from "pg";
import type {ContentPack} from "../src/content/types";
import type {GameConfig} from "../src/engine/types";
import {validateDeck} from "../src/engine/game";
import {libraryOf,validateRules} from "../src/content/validation";
import {DEFAULT_CONFIG} from "../src/engine/config";
import {transaction,type DB} from "./db";
import {activeContent} from "./catalog";
import {digest} from "./security";
import {reject} from "./errors";
import type {Actor} from "./auth";
import {applyOwnershipLots,lockPlayer,type Provenance} from "./economy-assets";
import {ownerContent} from "../src/content/owner";
import type {BackendConfig} from "./config";
import {selectedStarters,grantStarterUpgrade} from "./starters";
import {deckFormat} from "./shop-formats";
export async function owned(db:DB|PoolClient,playerId:string){
  const {rows}=await db.query("SELECT e.card_id, e.id AS edition_id,e.edition,i.quantity,i.acquired_at FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE player_id=$1 ORDER BY e.card_id,e.edition",[playerId]);return rows;
}
export async function deckUsesSandbox(c:PoolClient,playerId:string,cards:string[],pack:ContentPack){
  const required=new Map<string,number>();for(const id of cards){const identity=pack.cards.find(card=>card.id===id)?.collectible?.gameplayId??id;required.set(identity,(required.get(identity)??0)+1);}
  const rows=(await c.query("SELECT e.card_id,sum(l.remaining)::int AS quantity FROM kd.ownership_lot l JOIN kd.edition e ON e.id=l.edition_id WHERE l.player_id=$1 AND NOT l.sandbox GROUP BY e.card_id",[playerId])).rows;
  return [...required].some(([id,quantity])=>quantity>Number(rows.find(r=>r.card_id===id)?.quantity??0));
}
export async function inventoryTransaction(c:PoolClient,playerId:string,key:string,source:string,changes:{editionId:string;quantity:number}[],actorId:string|null,provenance:Provenance={origin:"administrator",tradeable:false}){
  await lockPlayer(c,playerId);
  const fingerprint=digest({source,changes}),{rows:[previous]}=await c.query("SELECT fingerprint,result FROM kd.acquisition WHERE player_id=$1 AND idempotency_key=$2",[playerId,key]);
  if(previous){if(previous.fingerprint!==fingerprint)reject(409,"idempotency_conflict","This operation identifier was used for a different grant.");return {...previous.result,replayed:true};}
  if(new Set(changes.map(x=>x.editionId)).size!==changes.length)reject(400,"duplicate_edition","Combine edition quantities before submitting a grant.");
  const id=crypto.randomUUID(),result={id,source,changes};
  await c.query("INSERT INTO kd.acquisition(id,player_id,idempotency_key,fingerprint,source,initiated_by,result) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,playerId,key,fingerprint,source,actorId,result]);
  for(const change of [...changes].sort((a,b)=>a.editionId.localeCompare(b.editionId))){
    if(!Number.isInteger(change.quantity)||change.quantity===0||Math.abs(change.quantity)>1000)reject(400,"invalid_quantity","Inventory changes must be nonzero bounded integers.");
    const {rows:[edition]}=await c.query("SELECT id FROM kd.edition WHERE id=$1",[change.editionId]);if(!edition)reject(400,"unknown_edition","Card edition was not found.");
    const {rows:[balance]}=change.quantity>0?await c.query(`INSERT INTO kd.inventory(player_id,edition_id,quantity) VALUES($1,$2,$3)
      ON CONFLICT(player_id,edition_id) DO UPDATE SET quantity=kd.inventory.quantity+EXCLUDED.quantity,updated_at=now() RETURNING quantity`,[playerId,change.editionId,change.quantity]):await c.query("UPDATE kd.inventory SET quantity=quantity+$3::integer,updated_at=now() WHERE player_id=$1 AND edition_id=$2 AND quantity+$3::integer>=0 RETURNING quantity",[playerId,change.editionId,change.quantity]);
    if(!balance)reject(400,"insufficient_inventory","An inventory adjustment cannot make ownership negative.");
    await c.query("INSERT INTO kd.inventory_entry(acquisition_id,edition_id,delta,resulting_quantity) VALUES($1,$2,$3,$4)",[id,change.editionId,change.quantity,balance.quantity]);
  }
  await applyOwnershipLots(c,playerId,id,changes,provenance);
  return {...result,replayed:false};
}
export async function grant(pool:DB,targetId:string,key:string,source:string,changes:{editionId:string;quantity:number}[],actor:Actor){
  if(actor.role!=="administrator")reject(403,"grant_forbidden","Permanent inventory grants require an administrator.");
  return transaction(pool,async c=>{
    const {rowCount}=await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[targetId]);if(!rowCount)reject(404,"player_missing","Player was not found.");
    const result=await inventoryTransaction(c,targetId,key,source,changes,actor.id,{origin:"administrator",tradeable:false});
    if(!result.replayed)await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'inventory-grant',$2,$3)",[actor.id,targetId,{acquisition:result.id,source}]);return result;
  });
}
export async function ownedDeckLegality(c:DB|PoolClient,actor:Actor,cards:string[],pack:ContentPack,config:GameConfig,testing=false){
  const blocking=[...validateRules(config).filter(x=>x.severity==="error").map(x=>x.message)];
  if(config.deckSize!==15)blocking.push("Permanent playing decks must contain exactly 15 cards.");
  if(testing&&actor.role==="player")blocking.push("Unrestricted testing requires an authorized developer role.");
  for(const id of new Set(cards))if(!pack.cards.some(card=>card.id===id))blocking.push(`${id}: card is not in the active published catalog.`);
  if(!testing){
    const quantities=new Map<string,number>();for(const row of await owned(c,actor.id))quantities.set(row.card_id,(quantities.get(row.card_id)??0)+row.quantity);
    const requested=new Map<string,number>();for(const id of cards){const identity=pack.cards.find(x=>x.id===id)?.collectible?.gameplayId??id;requested.set(identity,(requested.get(identity)??0)+1);}
    for(const [id,n]of requested)if(n>(quantities.get(id)??0))blocking.push(`${id.toUpperCase()}: deck requires ${n}, owned ${quantities.get(id)??0}.`);
  }
  const identities=cards.map(id=>pack.cards.find(x=>x.id===id)?.collectible?.gameplayId??id);
  if((await c.query("SELECT id FROM kd.card_identity WHERE retired AND id=ANY($1)",[identities])).rowCount)blocking.push("Retired cards are unavailable for new playing decks or matches; historical records remain preserved.");
  return {errors:[...blocking,...validateDeck(cards,libraryOf(pack),config)],blockingDraftErrors:blocking};
}
export async function validateOwnedDeck(c:DB|PoolClient,actor:Actor,cards:string[],pack:ContentPack,config:GameConfig,testing=false,draft=false){
  if(testing&&actor.role==="player")reject(403,"testing_forbidden","Unrestricted testing requires an authorized developer role.");
  if(draft){
    const rules=validateRules(config).filter(x=>x.severity==="error").map(x=>x.message);
    const known=new Set((await c.query("SELECT id FROM kd.card_identity WHERE id=ANY($1)",[[...new Set(cards)]])).rows.map(r=>r.id));
    for(const id of new Set(cards))if(!known.has(id))rules.push(`${id}: unknown permanent card identity.`);
    if(rules.length)reject(400,"illegal_deck",rules.join(" "));
    return; // A draft records intentions, never ownership or permission to play.
  }
  const report=await ownedDeckLegality(c,actor,cards,pack,config,testing),errors=report.errors;
  if(errors.length)reject(400,"illegal_deck",errors.join(" "));
}
export async function startingCollection(pool:DB,actor:Actor,kindred:string,key:string,onAcquired?:(c:PoolClient,cards:string[])=>Promise<void>,serverConfig?:BackendConfig){
  return transaction(pool,async c=>{
    // Match configuration publication lock order before locking its player FK.
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["kindred-configuration:starters"]);
    const {rows:[player]}=await c.query("SELECT * FROM kd.player WHERE id=$1 FOR UPDATE",[actor.id]);
    if(player.starting_kindred){
      const {rows:[prior]}=await c.query("SELECT result FROM kd.acquisition WHERE player_id=$1 AND idempotency_key=$2 AND source=$3",[actor.id,key,`starting:${kindred}`]);
      if(prior&&player.starting_kindred===kindred)return {...prior.result,replayed:true};
      reject(409,"starting_collection_chosen","A permanent starting collection has already been selected.");
    }
    const founding=new Set(ownerContent().cards.filter(x=>x.kindred===kindred).map(x=>x.collectible!.gameplayId));
    const pack=await activeContent(c),cards=pack.cards.filter(x=>founding.has(x.collectible?.gameplayId??x.id));const originalStarter=pack.decks.find(x=>x.collection===kindred);
    if(cards.length!==30||!originalStarter)reject(400,"invalid_starting_kindred","Choose one of the five Founding Kindreds.");
    let starter=originalStarter!;
    const result=await inventoryTransaction(c,actor.id,key,`starting:${kindred}`,cards.map(x=>({editionId:`${x.collectible!.gameplayId}:${x.collectible!.edition}`,quantity:1})),actor.id,{origin:"starter",tradeable:false});
    const policy=await selectedStarters(c,serverConfig);let upgrade:unknown=null;
    if(policy?.rules.newPlayersEnabled){upgrade=await grantStarterUpgrade(c,{...player,starting_kindred:kindred},policy,pack,"new_player",actor.id,inventoryTransaction);const recommended=policy.rules.definitions.find(d=>d.kindred===kindred)!.recommended;starter={...starter,...recommended};}
    const config=structuredClone(DEFAULT_CONFIG);
    await validateOwnedDeck(c,actor,starter.cards,pack,config);
    const format=await deckFormat(c,starter.cards,pack,config);if(format.errors.length)reject(400,"starter_format_changed",format.errors.join(" "));
    const deckId=crypto.randomUUID();await c.query("INSERT INTO kd.deck(id,player_id,name,version_id,config) VALUES($1,$2,$3,$4,$5)",[deckId,actor.id,starter.name,pack.id,config]);
    for(let i=0;i<starter.cards.length;i++)await c.query("INSERT INTO kd.deck_card(deck_id,slot,card_id) VALUES($1,$2,$3)",[deckId,i,starter.cards[i]]);
    await c.query("INSERT INTO kd.deck_history(deck_id,revision,snapshot) VALUES($1,1,$2)",[deckId,{name:starter.name,cards:starter.cards,config,version:pack.id}]);
    await c.query("UPDATE kd.player SET starting_kindred=$2,default_deck_id=$3 WHERE id=$1",[actor.id,kindred,deckId]);
    if(onAcquired)await onAcquired(c,cards.map(card=>card.id));
    return {...result,deckId,kindred,upgrade};
  });
}
