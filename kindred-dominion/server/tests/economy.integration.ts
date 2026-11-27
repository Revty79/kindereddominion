import {afterAll,beforeAll,describe,expect,it} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database,transaction} from "../db";
import {applyMigrations} from "../migrations";
import {seedRepository} from "../catalog";
import {createApi} from "../app";
import {DEFAULT_ECONOMY,economySchema,bundleSchema} from "../economy-rules";
import {selectedConfiguration} from "../configuration";
import {grantReward,currentEconomy,economyEvent,settleMatchReward} from "../economy";
import {moveCurrency,reconcileEconomy} from "../economy-assets";
import {inventoryTransaction} from "../inventory";
import {act,legalPlays} from "../../src/engine/game";
import {appendRecord,validateRecord} from "../../src/replay/record";

const config=readConfig();if(config.environment!=="integration")throw Error("Economy tests require the registered disposable PostgreSQL instance.");
const pool=database(config),run=crypto.randomBytes(5).toString("hex"),password=crypto.randomBytes(26).toString("base64url");
let app:Awaited<ReturnType<typeof createApi>>,admin:Client,player:Client,other:Client,version:string;
class Client{
 cookie="";csrf="";player:any;ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;
 async request(method:string,url:string,payload?:unknown,headers:Record<string,string>={}){const response=await app.inject({method:method as any,url,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf,...headers},...(payload===undefined?{}:{payload:payload as any})});const set=response.headers["set-cookie"];if(set)this.cookie=(Array.isArray(set)?set[0]:set).split(";")[0];const body=response.json();if(body.csrf)this.csrf=body.csrf;if(body.player)this.player=body.player;return {status:response.statusCode,body};}
 async register(suffix:string){await this.request("GET","/api/session");const response=await this.request("POST","/api/accounts",{username:`ec_${run}_${suffix}`,email:`ec_${run}_${suffix}@example.test`,password,displayName:`Economy ${suffix}`});expect(response.status,JSON.stringify(response.body)).toBe(201);return this;}
}
async function publish(document:any){const active=await selectedConfiguration(pool,"economy"),draft=await admin.request("POST","/api/admin/configuration/economy/drafts",{document});expect(draft.status,JSON.stringify(draft.body)).toBe(200);const published=await admin.request("POST",`/api/admin/configuration/economy/drafts/${draft.body.id}/publish`,{revision:1,expectedActiveId:active?.id??null,reason:"Isolated economy validation"});expect(published.status,JSON.stringify(published.body)).toBe(200);version=published.body.id;return version;}
async function active(){return (await currentEconomy(pool,config))!;}
async function gold(client:Client){return (await client.request("GET","/api/economy")).body.currencies.find((c:any)=>c.id==="gold").available;}
async function reward(client:Client,key:string,bundle:any){return transaction(pool,async c=>grantReward(c,client.player.id,"integration",key,bundleSchema.parse(bundle),await active()));}
async function finish(client:Client,deckId:string,options:{age?:boolean;forfeit?:boolean}={}){
 let response=await client.request("POST","/api/matches",{deckId});expect(response.status).toBe(200);let match=response.body;
 // Synthetic test-clock adjustment only, never an owner or hosted match.
 if(options.age)await pool.query("UPDATE kd.match SET created_at=now()-interval '5 minutes' WHERE id=$1 AND player_id=$2",[match.id,client.player.id]);
 for(let i=0;i<120&&match.status!=="finished";i++){
  const action=match.status==="mulligan"?{type:"mulligan",cards:[]}:options.forfeit?{type:"surrender"}:match.legalActions[0]??{type:"pass"};
  response=await client.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action});expect(response.status,JSON.stringify(response.body)).toBe(200);match=response.body;
 }
 expect(match.status).toBe("finished");return match;
}
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);app=await createApi(config,pool);admin=await new Client().register("admin");await pool.query("UPDATE kd.player SET role='administrator' WHERE id=$1",[admin.player.id]);await publish(structuredClone(DEFAULT_ECONOMY));player=await new Client().register("player");other=await new Client().register("other");});
afterAll(async()=>{try{if(admin)await publish({...structuredClone(DEFAULT_ECONOMY),enabled:false});}finally{await app?.close();await pool.end();}});
describe.sequential("PostgreSQL 18 authoritative economy",()=>{
 it("starts only new activated accounts with the audited 100 Gold and zero Aether",async()=>{
  expect(await gold(player)).toBe(100);const overview=(await player.request("GET","/api/economy")).body;expect(overview.progression.xp).toBe(0);expect(overview.currencies.find((c:any)=>c.id==="aether").available).toBe(0);expect(overview.competitive.enabled).toBe(false);
  expect((await pool.query("SELECT count(*)::int AS n FROM kd.reward_grant WHERE player_id=$1 AND source='objective'",[player.player.id])).rows[0].n).toBe(1);
  const historical=(await pool.query("SELECT b.player_id FROM kd.legacy_inventory_baseline b LIMIT 1")).rows[0];if(historical)expect((await pool.query("SELECT count(*)::int AS n FROM kd.reward_grant WHERE player_id=$1",[historical.player_id])).rows[0].n).toBe(0);
 });
 it("rejects unauthenticated, cross-account, unprivileged, forged, and cross-origin operations",async()=>{
  expect((await new Client().request("GET","/api/economy")).status).toBe(401);
  for(const path of ["/api/admin/configuration/economy","/api/admin/economy/reconciliation",`/api/admin/economy/players/${other.player.id}`])expect((await player.request("GET",path)).status).toBe(403);
  expect((await player.request("POST","/api/admin/economy/grants",{})).status).toBe(403);
  expect((await player.request("POST","/api/economy/activity",{type:"match_won",idempotencyKey:crypto.randomUUID()})).status).toBe(400);
  expect((await player.request("POST","/api/economy/activity",{type:"guide_viewed",idempotencyKey:crypto.randomUUID()},{origin:"https://forged.example"})).status).toBe(403);
  const obj=(await pool.query("SELECT id FROM kd.objective_progress WHERE player_id=$1 LIMIT 1",[other.player.id])).rows[0];expect((await player.request("POST",`/api/economy/objectives/${obj.id}/claim`,{idempotencyKey:crypto.randomUUID()})).status).toBe(404);
 });
 it("serializes concurrent debits and retries without negative balances or partial records",async()=>{
  const rules=await active(),key=crypto.randomUUID(),meta={type:"integration-purchase",reason:"Concurrent synthetic spend",origin:"earned" as const,configVersion:rules.id};
  const results=await Promise.allSettled(Array.from({length:8},(_,i)=>transaction(pool,c=>moveCurrency(c,player.player.id,"spend:"+i+":"+run,{gold:-30},meta,rules.rules))));expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(3);expect(await gold(player)).toBe(10);
  await reward(player,"top-up",{currencies:{gold:100}});const retries=await Promise.all(Array.from({length:6},()=>transaction(pool,c=>moveCurrency(c,player.player.id,key,{gold:-10},meta,rules.rules))));expect(retries.filter(r=>!r.replayed)).toHaveLength(1);expect(new Set(retries.map(r=>r.id)).size).toBe(1);expect(await gold(player)).toBe(100);
  await expect(transaction(pool,c=>moveCurrency(c,player.player.id,key,{gold:-11},meta,rules.rules))).rejects.toMatchObject({code:"idempotency_conflict"});expect(await gold(player)).toBe(100);
  expect((await transaction(pool,c=>reconcileEconomy(c,player.player.id))).ok).toBe(true);
 });
 it("rolls back an entire composite reward after a late failure and retries safely",async()=>{
  const before=await gold(player),rules=await active();await expect(transaction(pool,async c=>{await grantReward(c,player.player.id,"integration","rollback",bundleSchema.parse({currencies:{gold:123},xp:15}),rules);throw Error("Simulated connection interruption before commit");})).rejects.toThrow("interruption");expect(await gold(player)).toBe(before);
  expect((await pool.query("SELECT count(*)::int AS n FROM kd.reward_grant WHERE player_id=$1 AND source_id='rollback'",[player.player.id])).rows[0].n).toBe(0);
  const results=await Promise.all(Array.from({length:5},()=>reward(player,"rollback",{currencies:{gold:123},xp:15})));expect(results.filter(r=>!r.replayed)).toHaveLength(1);expect(await gold(player)).toBe(before+123);
  await expect(reward(player,"unavailable-card",{currencies:{gold:800},xp:100,cards:[{cardId:"absent-card",quantity:1,mode:"first_copy"}]})).rejects.toMatchObject({code:"reward_card_unavailable"});expect(await gold(player)).toBe(before+123);
 });
 it("detects provenance corruption even when a wallet aggregate still balances",async()=>{
  await expect(transaction(pool,async c=>{const empty=(await c.query("SELECT id FROM kd.currency_lot WHERE player_id=$1 AND origin='earned' AND remaining<initial_quantity LIMIT 1",[player.player.id])).rows[0],full=(await c.query("SELECT id FROM kd.currency_lot WHERE player_id=$1 AND origin='earned' AND remaining>0 AND id<>$2 LIMIT 1",[player.player.id,empty.id])).rows[0];await c.query("UPDATE kd.currency_lot SET remaining=remaining+1 WHERE id=$1",[empty.id]);await c.query("UPDATE kd.currency_lot SET remaining=remaining-1 WHERE id=$1",[full.id]);expect((await reconcileEconomy(c,player.player.id)).ok).toBe(false);throw Error("Rollback deliberate isolated corruption fixture");})).rejects.toThrow("Rollback deliberate isolated corruption fixture");expect((await transaction(pool,c=>reconcileEconomy(c,player.player.id))).ok).toBe(true);
 });
 it("keeps sandbox accounts and currency isolated and rejects permanent scope reversal",async()=>{
  const sandbox=await new Client().register("sandbox"),id=sandbox.player.id;
  const grant={playerId:id,currency:"gold",amount:100,origin:"sandbox",idempotencyKey:crypto.randomUUID(),reason:"Isolated sandbox units"};expect((await admin.request("POST","/api/admin/economy/grants",grant)).status).toBe(403);
  expect((await admin.request("POST",`/api/admin/economy/players/${id}/restrictions`,{sandbox:true,rewardsRestricted:false,reason:"Provider simulation account"})).status).toBe(200);
  expect((await admin.request("POST","/api/admin/economy/grants",{...grant,origin:"administrator"})).status).toBe(403);
  expect((await admin.request("POST","/api/admin/economy/grants",grant)).status).toBe(200);expect(await gold(sandbox)).toBe(100);
  expect((await admin.request("POST",`/api/admin/economy/players/${id}/restrictions`,{sandbox:false,rewardsRestricted:false,reason:"Attempt unsafe conversion"})).status).toBe(409);
  await sandbox.request("POST","/api/economy/activity",{type:"guide_viewed",idempotencyKey:crypto.randomUUID()});expect((await pool.query("SELECT count(*)::int AS n FROM kd.economy_event WHERE player_id=$1 AND type='guide_viewed'",[id])).rows[0].n).toBe(0);
 });
 it("requires auditable original credits for compensation and protects spent unrelated assets",async()=>{
  const body={playerId:other.player.id,currency:"gold",amount:40,origin:"administrator",idempotencyKey:crypto.randomUUID(),reason:"Synthetic audited correction"};const grant=await admin.request("POST","/api/admin/economy/grants",body);expect(grant.status).toBe(200);expect((await admin.request("POST","/api/admin/economy/grants",body)).body.replayed).toBe(true);
  const compensation={transactionId:grant.body.id,currency:"gold",amount:30,idempotencyKey:crypto.randomUUID(),reason:"Correct original tester credit"};expect((await admin.request("POST","/api/admin/economy/compensations",compensation)).status).toBe(200);expect(await gold(other)).toBe(110);
  expect((await admin.request("POST","/api/admin/economy/compensations",{...compensation,idempotencyKey:crypto.randomUUID(),amount:11})).status).toBe(409);expect(await gold(other)).toBe(110);
  const tx=(await pool.query("SELECT id FROM kd.currency_entry WHERE player_id=$1 LIMIT 1",[other.player.id])).rows[0];await expect(pool.query("UPDATE kd.currency_entry SET delta=999 WHERE id=$1",[tx.id])).rejects.toThrow();
 });
 it("preserves starter binding, first-copy lifetime identity and inventory reconciliation",async()=>{
  const starter=await player.request("POST","/api/starting-collection",{kindred:"Nature",idempotencyKey:crypto.randomUUID()});expect(starter.status).toBe(200);
  const lots=(await player.request("GET","/api/economy/lots")).body.lots;expect(lots.filter((l:any)=>l.origin==="starter")).toHaveLength(30);expect(lots.every((l:any)=>!l.tradeable)).toBe(true);
  await reward(player,"first-mythical",{cards:[{cardId:"m001",quantity:1,mode:"first_copy"}]});await transaction(pool,c=>inventoryTransaction(c,player.player.id,"remove-first:"+run,"integration adjustment",[{editionId:"m001:development",quantity:-1}],admin.player.id));
  await reward(player,"first-mythical-again",{cards:[{cardId:"m001",quantity:1,mode:"first_copy"}]});expect(Number((await pool.query("SELECT quantity FROM kd.inventory WHERE player_id=$1 AND edition_id='m001:development'",[player.player.id])).rows[0].quantity)).toBe(0);
  expect((await transaction(pool,c=>reconcileEconomy(c,player.player.id))).ok).toBe(true);
 });
 it("records guide acknowledgement once without client-generated reward farming",async()=>{
  await Promise.all(Array.from({length:5},()=>player.request("POST","/api/economy/activity",{type:"guide_viewed",idempotencyKey:crypto.randomUUID()})));expect((await pool.query("SELECT count(*)::int AS n FROM kd.economy_event WHERE player_id=$1 AND type='guide_viewed'",[player.player.id])).rows[0].n).toBe(1);
  await player.request("POST","/api/economy/activity",{type:"collection_viewed",idempotencyKey:crypto.randomUUID()});const deck=(await player.request("GET","/api/decks")).body.decks[0];expect((await player.request("PUT",`/api/decks/${deck.id}`,{name:deck.name,cards:deck.cards,config:{scoring:deck.config.scoring,mode:deck.config.mode,collection:deck.config.collection},revision:deck.revision})).status).toBe(200);
  expect((await pool.query("SELECT count(*)::int AS n FROM kd.reward_grant WHERE player_id=$1 AND source_id='intro-tutorial:lifetime'",[player.player.id])).rows[0].n).toBe(0);
 });
 it("uses authoritative replay participation, rejects fast surrender and settles a legitimate battle once",async()=>{
  const deckId=(await player.request("GET","/api/decks")).body.decks[0].id,forfeit=await finish(player,deckId,{forfeit:true});expect(forfeit.rewardSummary).toMatchObject({status:"denied",reason:"insufficient_participation"});
  const before=await gold(player),match=await finish(player,deckId,{age:true});expect(match.rewardSummary.status,JSON.stringify(match.rewardSummary)).toBe("granted");expect(match.rewardSummary.evidence.humanPlacements).toBeGreaterThanOrEqual(3);expect(await gold(player)).toBeGreaterThan(before);
  const priorGold=await gold(player),priorXP=(await player.request("GET","/api/economy")).body.progression.xp;const results=await Promise.all(Array.from({length:5},()=>transaction(pool,c=>settleMatchReward(c,match.id,config))));expect(results.every(r=>r.status==="granted")).toBe(true);expect(await gold(player)).toBe(priorGold);expect((await player.request("GET","/api/economy")).body.progression.xp).toBe(priorXP);
  const rewards=(await pool.query("SELECT bundle FROM kd.reward_grant WHERE player_id=$1 AND source='match' AND source_id=$2",[player.player.id,match.id])).rows;expect(rewards).toHaveLength(1);const mastery=(await pool.query("SELECT sum(amount)::int AS n FROM kd.xp_entry WHERE transaction_id=(SELECT transaction_id FROM kd.reward_grant WHERE player_id=$1 AND source='match' AND source_id=$2) AND axis LIKE 'kindred:%'",[player.player.id,match.id])).rows[0].n;expect(mastery).toBe(DEFAULT_ECONOMY.match.mastery);
  expect((await pool.query("SELECT count(*)::int AS n FROM kd.reward_grant WHERE player_id=$1 AND source_id='intro-tutorial:lifetime'",[player.player.id])).rows[0].n).toBe(1);
 });
 it("pins in-flight match rewards when administrators publish new settings",async()=>{
  const deckId=(await player.request("GET","/api/decks")).body.decks[0].id,created=await player.request("POST","/api/matches",{deckId}),matchId=created.body.id,old=(await pool.query("SELECT config_version FROM kd.economy_match_context WHERE match_id=$1",[matchId])).rows[0].config_version;
  const changed=structuredClone(DEFAULT_ECONOMY);changed.match.normal.win=999;changed.match.normal.loss=999;changed.match.cooldownSeconds=0;await publish(changed);expect(version).not.toBe(old);expect((await pool.query("SELECT config_version FROM kd.economy_match_context WHERE match_id=$1",[matchId])).rows[0].config_version).toBe(old);
  await publish(structuredClone(DEFAULT_ECONOMY));
 });
 it("accounts win, draw and loss with verified engine replays, diminishing rewards and the daily cap",async()=>{
  const rules=structuredClone(DEFAULT_ECONOMY);rules.objectives=[];Object.assign(rules.match,{minSeconds:0,minPlacements:0,cooldownSeconds:0,dailyLimit:3,diminishAfter:1,diminishBasisPoints:5000});await publish(rules);
  try{
   const client=await new Client().register("outcomes"),starter=await client.request("POST","/api/starting-collection",{kindred:"Nature",idempotencyKey:crypto.randomUUID()});
   for(const outcome of ["win","draw","loss","capped"]){
    const created=await client.request("POST","/api/matches",{deckId:starter.body.deckId}),row=(await pool.query("SELECT * FROM kd.match WHERE id=$1",[created.body.id])).rows[0];let state=row.state,record=row.record;
    // Branch fixtures are genuine legal engine actions, persisted only in this
    // disposable account. Full HTTP/GUI matches are tested separately.
    if(!state.players[0].mulliganDone){const action={type:"mulligan" as const,player:0 as const,cards:[]};state=act(state,action,record.library);record=appendRecord(record,action,state);}
    for(let n=0;n<180&&state.phase!=="finished";n++){const shouldPlay=outcome==="win"?state.active===0:outcome==="loss"?state.active===1:false;const action=shouldPlay?(legalPlays(state,record.library)[0]??{type:"pass" as const,player:state.active}):{type:"pass" as const,player:state.active};state=act(state,action,record.library);record=appendRecord(record,action,state);}
    expect(state.phase).toBe("finished");expect(()=>validateRecord(record)).not.toThrow();if(outcome!=="capped")expect(state.result.winner).toBe(outcome==="win"?0:outcome==="loss"?1:null);
    await pool.query("UPDATE kd.match SET state=$2,record=$3,status='finished',result=$4,created_at=now()-interval '5 minutes',completed_at=now() WHERE id=$1",[row.id,state,record,state.result]);const result=await transaction(pool,c=>settleMatchReward(c,row.id,config));expect(result.status).toBe(outcome==="capped"?"denied":"granted");if(outcome==="capped")expect(result.reason).toBe("daily_reward_limit");
   }
   expect(await gold(client)).toBe(35);expect((await client.request("GET","/api/economy")).body.progression.xp).toBe(95);
  }finally{await publish(structuredClone(DEFAULT_ECONOMY));}
 });
 it("consumes backlog event units oldest-first and rejects expired claims",async()=>{
  const rules=await active(),definition=rules.rules.objectives.find(o=>o.id==="daily-evolve")!,ids=[crypto.randomUUID(),crypto.randomUUID()];
  for(let n=0;n<2;n++)await pool.query("INSERT INTO kd.objective_progress(id,player_id,objective_id,period_key,config_version,definition,claim_until) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 day')",[ids[n],other.player.id,definition.id,`2000-01-0${n+1}`,rules.id,definition]);
  await transaction(pool,c=>economyEvent(c,other.player.id,"evolution","backlog:"+run,4,{kindreds:["Nature"]},rules));const rows=(await pool.query("SELECT progress FROM kd.objective_progress WHERE id=ANY($1) ORDER BY period_key",[ids])).rows;expect(rows.map(r=>Number(r.progress))).toEqual([3,1]);
  await pool.query("UPDATE kd.objective_progress SET claim_until=now()-interval '1 second' WHERE id=$1",[ids[0]]);expect((await other.request("POST",`/api/economy/objectives/${ids[0]}/claim`,{idempotencyKey:crypto.randomUUID()})).body.error.code).toBe("claim_expired");
 });
 it("grants free additional achievement copies while binding starter and ordinary first copies",async()=>{
  await reward(player,"achievement-copy",{cards:[{cardId:"n001",quantity:1,mode:"additional",tradeable:true}]});const lot=(await pool.query("SELECT origin,tradeable FROM kd.ownership_lot WHERE player_id=$1 AND edition_id='n001:development' ORDER BY created_at DESC LIMIT 1",[player.player.id])).rows[0];expect(lot).toEqual({origin:"achievement",tradeable:true});
 });
 it("prevents local sampler artwork/card copies from contaminating ordinary match rewards",async()=>{
  const client=await new Client().register("sampler"),starter=await client.request("POST","/api/starting-collection",{kindred:"Nature",idempotencyKey:crypto.randomUUID()});
  await transaction(pool,c=>inventoryTransaction(c,client.player.id,"sandbox-card:"+run,"local-testing:fixture",[{editionId:"a001:development",quantity:1}],admin.player.id,{origin:"sandbox",sandbox:true,tradeable:false}));
  const deck=(await client.request("GET",`/api/decks/${starter.body.deckId}`)).body;deck.cards[0]="a001";const saved=await client.request("POST","/api/decks",{name:"Sandbox-backed card fixture",cards:deck.cards,config:{scoring:"classic",mode:"standard",collection:"mixed"}});expect(saved.status,JSON.stringify(saved.body)).toBe(201);
  const match=await finish(client,saved.body.id,{forfeit:true});expect(match.testingAccess).toBe(true);expect(match.rewardSummary).toMatchObject({status:"denied",reason:"sandbox_or_restricted"});expect((await client.request("GET","/api/progression")).body.stats.matches).toBe(0);expect(await gold(client)).toBe(100);
 });
 it("settles account and mastery milestones once and keeps administrative XP tests in sandbox",async()=>{
  const rules=structuredClone(DEFAULT_ECONOMY);rules.bundles["xp-rehearsal"]=bundleSchema.parse({xp:20});rules.bundles["promo-gold"]=bundleSchema.parse({currencies:{gold:7}});rules.promotions=[{id:"isolated-promotion",label:"Isolated promotion",bundleId:"promo-gold",startsAt:new Date(Date.now()-3600000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),enabled:true}];await publish(rules);
  const before=await gold(other),activeRules=await active(),bundle=bundleSchema.parse({xp:250,mastery:100});const results=await Promise.all(Array.from({length:5},()=>transaction(pool,c=>grantReward(c,other.player.id,"integration","level-milestones",bundle,activeRules,{mastery:{Nature:100}}))));expect(results.filter(r=>!r.replayed)).toHaveLength(1);expect(await gold(other)).toBe(before+115);
  const overview=(await other.request("GET","/api/economy")).body;expect(overview.progression.achievedLevel).toBe(3);expect(overview.mastery.find((k:any)=>k.kindred==="Nature").achievedLevel).toBe(2);expect((await pool.query("SELECT count(*)::int AS n FROM kd.level_reward WHERE player_id=$1",[other.player.id])).rows[0].n).toBe(3);
  const request={playerId:other.player.id,bundleId:"xp-rehearsal",reason:"Sandbox-only XP rehearsal",idempotencyKey:crypto.randomUUID()};expect((await admin.request("POST","/api/admin/economy/bundles",request)).body.error.code).toBe("sandbox_progression_required");
  const sandbox=await new Client().register("xp_sandbox");await admin.request("POST",`/api/admin/economy/players/${sandbox.player.id}/restrictions`,{sandbox:true,rewardsRestricted:false,reason:"Isolated XP progression tests"});expect((await admin.request("POST","/api/admin/economy/bundles",{...request,playerId:sandbox.player.id})).status).toBe(200);expect((await sandbox.request("GET","/api/economy")).body.progression.xp).toBe(20);expect(await gold(sandbox)).toBe(0);const beforePromo=await gold(other),claims=await Promise.all(Array.from({length:5},()=>other.request("POST","/api/economy/promotions/isolated-promotion/claim",{idempotencyKey:crypto.randomUUID()})));expect(claims.every(r=>r.status===200)).toBe(true);expect(claims.filter(r=>!r.body.replayed)).toHaveLength(1);expect(await gold(other)).toBe(beforePromo+7);expect((await other.request("GET","/api/economy")).body.promotions[0].claimed).toBe(true);expect((await sandbox.request("POST","/api/economy/promotions/isolated-promotion/claim",{idempotencyKey:crypto.randomUUID()})).status).toBe(403);await publish(structuredClone(DEFAULT_ECONOMY));
 });
 it("rejects a corrupt authoritative record without awarding a partial reward",async()=>{
  const deckId=(await player.request("GET","/api/decks")).body.decks[0].id,created=await player.request("POST","/api/matches",{deckId}),row=(await pool.query("SELECT * FROM kd.match WHERE id=$1",[created.body.id])).rows[0];row.record.actions[0].signature="0".repeat(64);row.state.phase="finished";row.state.result={winner:0,reason:"passes"};
  await pool.query("UPDATE kd.match SET state=$2,record=$3,status='finished',completed_at=now(),created_at=now()-interval '5 minutes' WHERE id=$1",[row.id,row.state,row.record]);const before=await gold(player),result=await transaction(pool,c=>settleMatchReward(c,row.id,config));expect(result).toMatchObject({status:"denied",reason:"invalid_authoritative_replay"});expect(await gold(player)).toBe(before);
  // The deliberately corrupt fixture is repaired before backup/restore tests.
  const original=(await pool.query("SELECT record,state FROM kd.match WHERE player_id=$1 AND status='finished' AND id<>$2 AND state->>'phase'='finished' ORDER BY completed_at LIMIT 1",[player.player.id,row.id])).rows[0];await pool.query("UPDATE kd.match SET record=$2,state=$3 WHERE id=$1",[row.id,original.record,original.state]);
 });
 it("publishes and rolls back configuration atomically without rewriting historical reward receipts",async()=>{
  const old=await selectedConfiguration(pool,"economy"),before=(await pool.query("SELECT result FROM kd.reward_grant WHERE player_id=$1 ORDER BY id",[player.player.id])).rows,changed=structuredClone(DEFAULT_ECONOMY);changed.label="Temporary DEV configuration";await publish(changed);
  expect((await admin.request("POST","/api/admin/configuration/economy/rollback",{versionId:old.id,expectedActiveId:old.id,reason:"Reject stale rollback request"})).status).toBe(409);
  expect((await admin.request("POST","/api/admin/configuration/economy/rollback",{versionId:old.id,expectedActiveId:version,reason:"Restore reviewed DEV settings"})).status).toBe(200);expect((await selectedConfiguration(pool,"economy")).id).toBe(old.id);expect((await pool.query("SELECT result FROM kd.reward_grant WHERE player_id=$1 ORDER BY id",[player.player.id])).rows).toEqual(before);
 });
 it("claims completed objectives concurrently once, with stored terms and UTC expiry",async()=>{
  const rules=await active();await transaction(pool,c=>economyEvent(c,other.player.id,"match_completed","synthetic-evidence:"+run,3,{kindreds:["Nature"],difficulty:"normal"},rules));
  const row=(await pool.query("SELECT * FROM kd.objective_progress WHERE player_id=$1 AND objective_id='daily-complete' AND completed_at IS NOT NULL",[other.player.id])).rows[0];expect(row).toBeDefined();const before=await gold(other),results=await Promise.all(Array.from({length:6},()=>other.request("POST",`/api/economy/objectives/${row.id}/claim`,{idempotencyKey:crypto.randomUUID()})));expect(results.every(r=>r.status===200),JSON.stringify(results)).toBe(true);expect(results.filter(r=>!r.body.replayed)).toHaveLength(1);expect(await gold(other)).toBe(before+50);
  expect((await other.request("GET","/api/economy/objectives")).body.timeZone).toBe("UTC");
 });
 it("keeps private publication atomic, validates all reward bundles and rejects stale selection",async()=>{
  const document=structuredClone(DEFAULT_ECONOMY);document.bundles["bad-asset"]={...bundleSchema.parse({}),cards:[{cardId:"absent-card",quantity:1,mode:"first_copy",tradeable:false}]};
  const draft=await admin.request("POST","/api/admin/configuration/economy/drafts",{document}),before=await selectedConfiguration(pool,"economy");expect(draft.status).toBe(200);const result=await admin.request("POST",`/api/admin/configuration/economy/drafts/${draft.body.id}/publish`,{revision:1,expectedActiveId:before.id,reason:"Invalid reference validation"});expect(result.status).toBe(400);expect((await selectedConfiguration(pool,"economy")).id).toBe(before.id);
  const invalidMastery=structuredClone(DEFAULT_ECONOMY);invalidMastery.objectives[0].kindred="Unpublished Kindred";invalidMastery.objectives[0].reward.mastery=1;const masteryDraft=await admin.request("POST","/api/admin/configuration/economy/drafts",{document:invalidMastery});expect(masteryDraft.status).toBe(200);expect((await admin.request("POST",`/api/admin/configuration/economy/drafts/${masteryDraft.body.id}/publish`,{revision:1,expectedActiveId:before.id,reason:"Reject unknown mastery Kindred"})).body.error.code).toBe("mastery_kindred_unavailable");
  const valid=await admin.request("POST","/api/admin/configuration/economy/drafts",{document:DEFAULT_ECONOMY});const payload={revision:1,expectedActiveId:before.id,reason:"Concurrent publication check"};const results=await Promise.all([admin.request("PUT",`/api/admin/configuration/economy/drafts/${valid.body.id}`,{revision:1,document:DEFAULT_ECONOMY}),admin.request("PUT",`/api/admin/configuration/economy/drafts/${valid.body.id}`,{revision:1,document:DEFAULT_ECONOMY})]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect((await admin.request("POST",`/api/admin/configuration/economy/drafts/${valid.body.id}/publish`,payload)).status).toBe(409);
 });
 it("preserves account, wallet, history and session across an application restart and reconciles every ledger",async()=>{
  const balance=await gold(player),history=(await player.request("GET","/api/economy/history")).body;await app.close();app=await createApi(config,pool);expect(await gold(player)).toBe(balance);expect((await player.request("GET","/api/economy/history")).body).toEqual(history);
  const reconciliation=await transaction(pool,c=>reconcileEconomy(c));expect(reconciliation).toEqual({ok:true,wallets:[],inventory:[],xp:[]});expect(JSON.stringify(history)).not.toContain(password);expect(JSON.stringify(history)).not.toContain(config.password);
 });
});
