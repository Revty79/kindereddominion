import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database,transaction} from "../db";
import {applyMigrations} from "../migrations";
import {seedRepository,publishContent} from "../catalog";
import {createApi} from "../app";
import {selectedConfiguration} from "../configuration";
import {DEFAULT_STARTERS} from "../starter-rules";
import {DEFAULT_ECONOMY} from "../economy-rules";
import {DEFAULT_SHOP,productSchema} from "../shop-rules";
import {DEFAULT_TRADING} from "../trading-rules";
import {reconcileEconomy} from "../economy-assets";
import {currentOwnerContent} from "../../src/content/current";
import {DEFAULT_PRESENTATION} from "../../src/player/presentation-preferences";
import {expandRecentMove} from "../../src/ui/recent-moves";
import {validateRecord} from "../../src/replay/record";
const config=readConfig();if(config.environment!=="integration")throw Error("Gameplay integration requires registered disposable PostgreSQL.");
const pool=database(config),run=crypto.randomBytes(6).toString("hex"),password=crypto.randomBytes(26).toString("base64url"),content=currentOwnerContent();let app:Awaited<ReturnType<typeof createApi>>,admin:Client,serial=0;
const proposal=(active=true)=>({...structuredClone(DEFAULT_STARTERS),recipeVersion:"gameplay-acceptance-"+run,newPlayersEnabled:active,backfillEnabled:active});
class Client{
 cookie="";csrf="";player:any;ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;
 async request(method:string,path:string,payload?:unknown){const r=await app.inject({method:method as any,url:"/api"+path,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf},...(payload===undefined?{}:{payload:payload as any})}),cookie=r.headers["set-cookie"];if(cookie)this.cookie=(Array.isArray(cookie)?cookie[0]:cookie).split(";")[0];const body=r.json();if(body.csrf)this.csrf=body.csrf;if(body.player&&!path.startsWith("/admin"))this.player=body.player;return{status:r.statusCode,body};}
 async register(kindred?:string){await this.request("GET","/session");const username=`gx_${run}_${serial++}`;expect((await this.request("POST","/accounts",{username,email:username+"@example.test",displayName:"Gameplay acceptance",password})).status).toBe(201);if(kindred)expect((await this.request("POST","/starting-collection",{kindred,idempotencyKey:crypto.randomUUID()})).status).toBe(200);return this;}
}
async function publish(domain:Parameters<typeof selectedConfiguration>[1],document:any){const active=await selectedConfiguration(pool,domain),draft=await admin.request("POST",`/admin/configuration/${domain}/drafts`,{document});expect(draft.status,JSON.stringify(draft.body)).toBe(200);const result=await admin.request("POST",`/admin/configuration/${domain}/drafts/${draft.body.id}/publish`,{revision:1,expectedActiveId:active?.id??null,reason:"Declared isolated V1.6G integration; no hosted approval"});expect(result.status,JSON.stringify(result.body)).toBe(200);}
async function inventory(c:Client){return(await c.request("GET","/collection")).body.inventory;}
async function matchHash(id:string){return(await pool.query("SELECT md5(state::text) state,md5(record::text) record,md5(decks::text) decks,md5(config::text) config,revision,version_id FROM kd.match WHERE id=$1",[id])).rows[0];}
async function buy(c:Client,id:string){const q=await c.request("POST","/shop/quotes",{productId:id});expect(q.status,JSON.stringify(q.body)).toBe(200);const r=await c.request("POST","/shop/purchases",{quoteId:q.body.id,idempotencyKey:crypto.randomUUID()});expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body;}
async function fund(c:Client){expect((await admin.request("POST","/admin/economy/grants",{playerId:c.player.id,currency:"aether",amount:2000,origin:"promotional",idempotencyKey:crypto.randomUUID(),reason:"Declared isolated promotional virtual purchase funding, not a real payment"})).status).toBe(200);}
const action=(value:any)=>value.status==="mulligan"?{type:"mulligan",cards:[]}:value.legalActions[0]??{type:"pass"};
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);await publishContent(pool,content,"official",true);app=await createApi(config,pool);admin=await new Client().register();await pool.query("UPDATE kd.player SET role='administrator' WHERE id=$1",[admin.player.id]);await publish("economy",DEFAULT_ECONOMY);await publish("shop",DEFAULT_SHOP);await publish("starters",proposal());});
afterAll(async()=>{try{await publish("starters",proposal(false));await publish("shop",DEFAULT_SHOP);await publish("economy",DEFAULT_ECONOMY);await publish("trading",DEFAULT_TRADING);}finally{await app?.close();await pool.end();}});
describe.sequential("Integrated V1.6 gameplay and economy acceptance",()=>{
 it.each(DEFAULT_STARTERS.definitions)("completes $kindred expanded ownership, custom duplicate deck, preview, history and exactly-once settlement",async definition=>{
  const c=await new Client().register(definition.kindred),owned=await inventory(c);expect(new Set(owned.map((r:any)=>r.card_id)).size).toBe(30);expect(owned.reduce((n:number,r:any)=>n+r.quantity,0)).toBe(40);
  for(const type of["guide_viewed","collection_viewed"])expect((await c.request("POST","/economy/activity",{type,idempotencyKey:crypto.randomUUID()})).status).toBe(200);
  const created=await c.request("POST","/decks",{name:"Custom "+definition.kindred,cards:definition.recommended.cards,config:{mode:"standard",scoring:"classic",collection:definition.kindred},draft:false});expect(created.status).toBe(201);expect((await c.request("GET","/decks")).body.decks.find((d:any)=>d.id===created.body.id).legal).toBe(true);expect(new Set(created.body.cards).size).toBeLessThan(15);expect((await c.request("POST",`/decks/${created.body.id}/default`,{})).status).toBe(200);
  let value=(await c.request("POST","/matches",{deckId:created.body.id})).body;
  // Declared elapsed-time fixture; default reward rules remain unchanged. The
  // compiled browser journeys separately wait the real minimum duration.
  await pool.query("UPDATE kd.match SET created_at=now()-interval '5 minutes' WHERE id=$1",[value.id]);
  let lastRequest:any;for(let turn=0;turn<100&&value.status!=="finished";turn++){
   const next=action(value),before=await matchHash(value.id);
   if(next.type==="play"){const body={revision:value.revision,action:next},p=await c.request("POST",`/matches/${value.id}/preview`,body);expect(p.status).toBe(200);expect((await c.request("POST",`/matches/${value.id}/preview`,body)).body).toEqual(p.body);expect(await matchHash(value.id)).toEqual(before);}
   lastRequest={revision:value.revision,requestId:crypto.randomUUID(),action:next};const result=await c.request("POST",`/matches/${value.id}/actions`,lastRequest);expect(result.status,JSON.stringify(result.body)).toBe(200);value=result.body;
   const hash=await matchHash(value.id),h=await c.request("GET",`/matches/${value.id}/recent-presentation?revision=${value.revision}`);expect(h.body).toEqual(value.recentPresentation);for(const move of h.body.moves)expandRecentMove(move);expect(await matchHash(value.id)).toEqual(hash);
  }
  expect(value.status).toBe("finished");expect(value.rewardSummary.status).toBe("granted");expect(value.rewardSummary.evidence.humanPlacements).toBeGreaterThanOrEqual(3);
  const before=(await c.request("GET","/economy")).body,hash=await matchHash(value.id);expect(before.progression.xp).toBeGreaterThan(0);expect(before.mastery.some((m:any)=>m.kindred===definition.kindred&&Number(m.xp)>0)).toBe(true);
  expect((await c.request("POST",`/matches/${value.id}/actions`,lastRequest)).status).toBe(409);for(let n=0;n<3;n++){const h=await c.request("GET",`/matches/${value.id}/recent-presentation`);for(const m of h.body.moves)expandRecentMove(m);}
  expect((await c.request("GET","/economy")).body).toEqual(before);expect(await matchHash(value.id)).toEqual(hash);expect((await transaction(pool,t=>reconcileEconomy(t,c.player.id))).ok).toBe(true);expect((await c.request("GET","/decks")).body.decks.find((d:any)=>d.id===created.body.id).cards).toEqual(definition.recommended.cards);
 });
 it("freezes an active legacy match across edits, purchases, concurrent starter upgrades, trade settlement, rewards and preferences",async()=>{
  const shop=structuredClone(DEFAULT_SHOP);shop.purchasedHoldHours=0;shop.cosmetics.push({id:"v16g-alt-n001",name:"Disposable appearance fixture",description:"Existing approved illustration reused only in this isolated integration example",type:"alternate_art",cardId:"n001",asset:content.metadata.n003.artworkRef!,status:"published",enabled:true,testOnly:false});shop.products.push(productSchema.parse({id:"v16g-art",name:"Disposable appearance product",description:"Isolated integration only",category:"artwork",type:"cosmetic",mode:"cosmetic",status:"published",enabled:true,currency:"aether",price:1,cosmetics:["v16g-alt-n001"]}));await publish("shop",shop);
  const rewards=structuredClone(DEFAULT_ECONOMY);rewards.objectives.push({...rewards.objectives[0],id:"v16g-snapshot-achievement",event:"collection_viewed",period:"permanent",target:1,claimAutomatically:true,reward:{currencies:{gold:5},xp:0,mastery:0,cards:[],entitlements:[]}});await publish("economy",rewards);
  await publish("starters",proposal(false));const a=await new Client().register("Nature"),b=await new Client().register("Mythical");await fund(a);await fund(b);await buy(a,"card-additional-n014");await buy(b,"card-additional-m001");
  const cards=Array.from({length:14},(_,i)=>"n"+String(i+1).padStart(3,"0")).concat("n014"),created=await a.request("POST","/decks",{name:"Preserved legacy duplicates",cards,config:{mode:"standard",scoring:"classic",collection:"Nature"},draft:false});expect(created.status).toBe(201);const d=created.body;
  expect((await a.request("GET","/decks")).body.decks.find((x:any)=>x.id===d.id).legal).toBe(true);const m=(await a.request("POST","/matches",{deckId:d.id})).body,original=await matchHash(m.id);
  const edited=await a.request("PUT",`/decks/${d.id}`,{name:"Edited while playing",cards,config:{mode:"standard",scoring:"classic",collection:"Nature"},revision:d.revision,draft:false});expect(edited.status,JSON.stringify(edited.body)).toBe(200);await buy(a,"card-additional-n001");
  await publish("starters",proposal());const preview=(await admin.request("POST","/admin/starters/preview",{playerId:a.player.id})).body;
  const grants=await Promise.all(Array.from({length:4},()=>admin.request("POST","/admin/starters/apply",{playerId:a.player.id,configVersion:preview.configVersion,previewDigest:preview.previewDigest,reason:"Declared isolated backfill preservation acceptance"})));expect(grants.every(g=>g.status===200)).toBe(true);expect((await pool.query("SELECT count(*)::int n FROM kd.starter_upgrade_grant WHERE player_id=$1",[a.player.id])).rows[0].n).toBe(1);
  await publish("trading",{...DEFAULT_TRADING,enabled:true,minimumAgeHours:0,minimumLevel:1,minimumMatches:0,holdHours:{...DEFAULT_TRADING.holdHours,purchased:0}});
  const offer=await a.request("POST","/trading/offers",{recipientId:b.player.id,offered:[{cardId:"n014",quantity:1}],requested:[{cardId:"m001",quantity:1}],expiryHours:1,idempotencyKey:crypto.randomUUID()});expect(offer.status,JSON.stringify(offer.body)).toBe(200);
  const accepted=await b.request("POST",`/trading/offers/${offer.body.offerId}/accept`,{versionId:offer.body.versionId,idempotencyKey:crypto.randomUUID()});expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
  const saved=(await a.request("GET","/decks")).body.decks.find((x:any)=>x.id===d.id);expect(saved.cards).toEqual(cards);expect(saved.legal).toBe(false);expect(saved.legality.join(" ")).toContain("requires 2, owned 1");expect((await a.request("POST","/matches",{deckId:d.id})).status).toBe(400);
  expect((await a.request("POST","/economy/activity",{type:"collection_viewed",idempotencyKey:crypto.randomUUID()})).status).toBe(200);expect((await pool.query("SELECT count(*)::int n FROM kd.reward_grant WHERE player_id=$1 AND source_id='v16g-snapshot-achievement:lifetime'",[a.player.id])).rows[0].n).toBe(1);await buy(a,"v16g-art");expect((await a.request("POST","/cosmetics/equipment/n001",{cosmeticId:"v16g-alt-n001"})).status).toBe(200);expect((await a.request("PUT","/preferences/presentation",{revision:0,preferences:{...DEFAULT_PRESENTATION,mode:"instant"}})).status).toBe(200);
  expect(await matchHash(m.id)).toEqual(original);expect((await transaction(pool,t=>reconcileEconomy(t,a.player.id))).ok).toBe(true);expect((await transaction(pool,t=>reconcileEconomy(t,b.player.id))).ok).toBe(true);
 });
 it("produces identical authoritative outcomes for all four modes from a declared common match snapshot",async()=>{
  const c=await new Client().register("Nature"),deck=(await c.request("GET","/decks")).body.decks[0],initial=(await c.request("POST","/matches",{deckId:deck.id})).body,row=(await pool.query("SELECT * FROM kd.match WHERE id=$1",[initial.id])).rows[0];let expected:any,revision=0;
  for(const mode of["normal","fast","reduced","instant"]){
   const id=crypto.randomUUID();await pool.query("INSERT INTO kd.match(id,player_id,opponent_type,version_id,engine_version,config,decks,seed,starting_player,state,record,status,testing_access) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)",[id,row.player_id,row.opponent_type,row.version_id,row.engine_version,row.config,JSON.stringify(row.decks),row.seed,row.starting_player,row.state,row.record,row.status]);
   expect((await c.request("PUT","/preferences/presentation",{revision:revision++,preferences:{...DEFAULT_PRESENTATION,mode}})).status).toBe(200);let value=(await c.request("GET",`/matches/${id}`)).body;
   for(let n=0;n<100&&value.status!=="finished";n++){const result=await c.request("POST",`/matches/${id}/actions`,{revision:value.revision,requestId:crypto.randomUUID(),action:action(value)});expect(result.status).toBe(200);value=result.body;}
   expect(value.status).toBe("finished");const final=(await pool.query("SELECT state,record FROM kd.match WHERE id=$1",[id])).rows[0];validateRecord(final.record);const actual={state:final.state,actions:final.record.actions,result:value.result,score:value.score};if(expected)expect(actual).toEqual(expected);else expected=actual;
  }
 });
});
