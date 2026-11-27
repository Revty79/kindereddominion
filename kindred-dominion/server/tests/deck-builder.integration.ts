import {beforeAll,beforeEach,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database,transaction} from "../db";
import {applyMigrations} from "../migrations";
import {seedRepository} from "../catalog";
import {createApi} from "../app";
import {currentOwnerContent} from "../../src/content/current";
import {DEFAULT_SHOP} from "../shop-rules";
import {DEFAULT_TRADING} from "../trading-rules";
import {DEFAULT_ECONOMY,bundleSchema} from "../economy-rules";
import {DEFAULT_STARTERS} from "../starter-rules";
import {currentEconomy,grantReward} from "../economy";
import {selectedConfiguration} from "../configuration";
import {documentOf} from "../deck-schema";
const config=readConfig();if(config.environment!=="integration")throw Error("Deck builder tests require registered isolated PostgreSQL.");
const pool=database(config),run=crypto.randomBytes(5).toString("hex"),password=crypto.randomBytes(26).toString("base64url"),content=currentOwnerContent();
const custom=["n001","n002","n002","n003","n004","n005","n006","n007","n008","n009","n010","n011","n012","n013","m001"];
let app:Awaited<ReturnType<typeof createApi>>,admin:Client,serial=0;
class Client {
  cookie="";csrf="";player:any;ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;
  async request(method:string,path:string,payload?:unknown){const r=await app.inject({method:method as any,url:"/api"+path,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf},...(payload===undefined?{}:{payload:payload as any})});const cookie=r.headers["set-cookie"];if(cookie)this.cookie=(Array.isArray(cookie)?cookie[0]:cookie).split(";")[0];const body=r.json();if(body.csrf)this.csrf=body.csrf;if(body.player)this.player=body.player;return {status:r.statusCode,body};}
  async register(kindred?:string){await this.request("GET","/session");const username=`db_${run}_${serial++}`;expect((await this.request("POST","/accounts",{username,email:username+"@example.test",password,displayName:"Deck builder fixture"})).status).toBe(201);if(kindred)expect((await this.request("POST","/starting-collection",{kindred,idempotencyKey:crypto.randomUUID()})).status).toBe(200);return this;}
}
async function publish(domain:string,document:any){const current=await selectedConfiguration(pool,domain as any),draft=await admin.request("POST",`/admin/configuration/${domain}/drafts`,{document});expect(draft.status,JSON.stringify(draft.body)).toBe(200);const result=await admin.request("POST",`/admin/configuration/${domain}/drafts/${draft.body.id}/publish`,{revision:1,expectedActiveId:current?.id??null,reason:"Isolated V1.6B configuration and eligibility validation"});expect(result.status,JSON.stringify(result.body)).toBe(200);return result.body.id;}
async function reward(c:Client,cardId:string,quantity=1){const economy=(await currentEconomy(pool,config))!;await transaction(pool,t=>grantReward(t,c.player.id,"declared-deck-builder-fixture",crypto.randomUUID(),bundleSchema.parse({cards:[{cardId,quantity,mode:"additional",tradeable:true}]}),economy,{origin:"mastery",reason:"Declared isolated earned copies, not fabricated historical ownership"}));}
async function equipped(){const c=await new Client().register("Nature");await reward(c,"n002",2);await reward(c,"m001");return c;}
async function create(c:Client,cards=custom,draft=false){const r=await c.request("POST","/decks",{name:"Custom mixed formation",cards,config:{mode:"standard",scoring:"classic",collection:"mixed"},draft});expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body;}
const workspace=(c:Client,id:string)=>c.request("GET",`/decks/${id}/workspace`);
const edit=(c:Client,d:any,document:any,revision=0)=>c.request("PUT",`/decks/${d.id}/workspace`,{revision,baseRevision:d.revision,document});
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);app=await createApi(config,pool);});
beforeEach(async()=>{admin=await new Client().register();await pool.query("UPDATE kd.player SET role='administrator' WHERE id=$1",[admin.player.id]);await publish("shop",DEFAULT_SHOP);await publish("economy",DEFAULT_ECONOMY);await publish("starters",{...structuredClone(DEFAULT_STARTERS),recipeVersion:"deck-builder-inactive-"+run});});
afterAll(async()=>{await app?.close();await pool.end();});

describe.sequential("Persistent player battle deck builder",()=>{
  it("creates an empty draft and keeps incomplete/unowned intentions without granting or permitting battle",async()=>{
    const c=await new Client().register("Nature"),before=(await c.request("GET","/collection")).body.inventory,d=await create(c,[],true);
    const saved=await c.request("PUT",`/decks/${d.id}`,{...documentOf(d),cards:["m001"],draft:true,revision:d.revision});expect(saved.status).toBe(200);
    expect((await c.request("GET","/decks")).body.decks.find((r:any)=>r.id===d.id)).toMatchObject({draft:true,legal:false,cards:["m001"]});
    expect((await c.request("POST","/matches",{deckId:d.id})).status).toBe(400);expect((await c.request("POST",`/decks/${d.id}/default`,{})).status).toBe(400);
    expect((await c.request("GET","/collection")).body.inventory).toEqual(before);
  });
  it("builds duplicate and cross-Kindred decks using shared owned copies without reservations",async()=>{
    const c=await equipped(),before=(await c.request("GET","/collection")).body.inventory,d=await create(c),duplicate=await c.request("POST",`/decks/${d.id}/duplicate`,{revision:d.revision});
    expect(duplicate.status).toBe(200);expect(duplicate.body.cards).toEqual(custom);expect(duplicate.body.name).toBe(d.name+" copy");
    expect((await c.request("GET","/decks")).body.decks.filter((x:any)=>[d.id,duplicate.body.id].includes(x.id)).every((x:any)=>x.legal)).toBe(true);
    expect((await c.request("GET","/collection")).body.inventory).toEqual(before);expect(Number((await pool.query("SELECT count(*) AS n FROM kd.inventory_reservation WHERE player_id=$1",[c.player.id])).rows[0].n)).toBe(0);
  });
  it("stores working edits separately and resumes them without changing a ready deck or its battle selection",async()=>{
    const c=await equipped(),d=await create(c);await c.request("POST",`/decks/${d.id}/default`,{});
    const document={...documentOf(d),name:"Renamed working formation",cards:["n002","n002"]},r=await edit(c,d,document);expect(r.status).toBe(200);
    expect((await workspace(c,d.id)).body).toMatchObject({revision:1,baseRevision:d.revision,document,stale:false});
    expect((await c.request("GET",`/decks/${d.id}`)).body).toEqual(d);
    const list=(await c.request("GET","/decks")).body;expect(list.defaultDeckId).toBe(d.id);expect(list.decks.find((x:any)=>x.id===d.id)).toMatchObject({legal:true,workspace:{revision:1,name:document.name,count:2}});
    const match=await c.request("POST","/matches",{deckId:d.id,deckRevision:d.revision});expect(match.status).toBe(200);expect((await pool.query("SELECT decks FROM kd.match WHERE id=$1",[match.body.id])).rows[0].decks[0]).toEqual(custom);
  });
  it("serializes conflicting browser edits and permits an exact retry after an interrupted response",async()=>{
    const c=await equipped(),d=await create(c),a={...documentOf(d),name:"First tab"},b={...a,name:"Second tab"};
    const results=await Promise.all([edit(c,d,a),edit(c,d,b)]);expect(results.map(r=>r.status).sort()).toEqual([200,409]);
    const stored=(await workspace(c,d.id)).body;const replay=await edit(c,d,stored.document);expect(replay.status).toBe(200);expect(replay.body).toMatchObject({revision:1,replayed:true});
    expect((await c.request("GET",`/decks/${d.id}`)).body).toEqual(d);
  });
  it("commits the reviewed working revision atomically and rejects stale/legacy overwrites",async()=>{
    const c=await equipped(),d=await create(c),document={...documentOf(d),name:"Reviewed renamed deck"};await edit(c,d,document);
    expect((await c.request("PUT",`/decks/${d.id}`,{...document,draft:false,revision:d.revision})).status).toBe(409);
    const body={...document,draft:false,revision:d.revision,workspaceRevision:1},r=await Promise.all([c.request("PUT",`/decks/${d.id}`,body),c.request("PUT",`/decks/${d.id}`,body)]);expect(r.map(r=>r.status).sort()).toEqual([200,409]);
    expect((await workspace(c,d.id)).body).toMatchObject({revision:0,baseRevision:2,document});expect(Number((await pool.query("SELECT count(*) AS n FROM kd.deck_history WHERE deck_id=$1",[d.id])).rows[0].n)).toBe(2);
  });
  it("discards only the reviewed working revision, preserving the saved deck",async()=>{
    const c=await equipped(),d=await create(c);await edit(c,d,{...documentOf(d),cards:[]});
    expect((await c.request("DELETE",`/decks/${d.id}/workspace`,{revision:0})).status).toBe(409);
    expect((await c.request("DELETE",`/decks/${d.id}/workspace`,{revision:1})).status).toBe(200);
    expect((await workspace(c,d.id)).body).toMatchObject({revision:2,document:documentOf(d)});expect((await c.request("GET",`/decks/${d.id}`)).body).toEqual(d);
  });
  it("prevents stale edits after another session discards and recreates a working copy",async()=>{
    const c=await equipped(),d=await create(c),original={...documentOf(d),name:"Old tab"};await edit(c,d,original);
    expect((await c.request("DELETE",`/decks/${d.id}/workspace`,{revision:1})).status).toBe(200);
    const fresh=(await workspace(c,d.id)).body;
    expect((await edit(c,d,{...documentOf(d),name:"Newer session"},fresh.revision)).status).toBe(200);
    expect((await edit(c,d,{...original,name:"Stale tab overwrite"},1)).status).toBe(409);
    expect((await workspace(c,d.id)).body.document.name).toBe("Newer session");
    expect((await c.request("GET",`/decks/${d.id}`)).body).toEqual(d);
  });
  it("checks delete/source revisions and prevents cross-account workspace, copy and selection access",async()=>{
    const c=await equipped(),foreign=await new Client().register("Mythical"),d=await create(c);await edit(c,d,{...documentOf(d),name:"Keep this device work"});
    for(const [method,path,body]of [["GET",`/decks/${d.id}/workspace`,undefined],["PUT",`/decks/${d.id}/workspace`,{revision:0,baseRevision:1,document:documentOf(d)}],["DELETE",`/decks/${d.id}/workspace`,{revision:1}],["POST",`/decks/${d.id}/duplicate`,{}],["POST",`/decks/${d.id}/default`,{}],["DELETE",`/decks/${d.id}`,{}]] as const)expect((await foreign.request(method,path,body)).status).toBe(404);
    expect((await c.request("DELETE",`/decks/${d.id}`,{revision:1,workspaceRevision:0})).status).toBe(409);
    expect((await c.request("POST",`/decks/${d.id}/duplicate`,{revision:2})).status).toBe(409);
    expect((await c.request("DELETE",`/decks/${d.id}`,{revision:1,workspaceRevision:1})).status).toBe(200);expect((await workspace(c,d.id)).status).toBe(404);
  });
  it("enforces actual engine copy limits, ownership, exact size and explicit collection restrictions",async()=>{
    const c=await equipped();for(const [cards,collection]of [[custom.map((id,i)=>i===3?"n002":id),"mixed"],[custom,"Nature"],[custom.slice(1),"mixed"],[custom.map(id=>id==="m001"?"a001":id),"mixed"]] as [string[],string][]){expect((await c.request("POST","/decks",{name:"Rejected deck",cards,config:{scoring:"classic",mode:"standard",collection},draft:false})).status).toBe(400);}
    const d=await create(c);expect((await c.request("POST",`/decks/${d.id}/default`,{})).status).toBe(200);
  });
  it("uses published competitive rules without erasing an ineligible saved deck",async()=>{
    const c=await equipped(),d=await create(c),rules=structuredClone(DEFAULT_SHOP);rules.formats[0].cardLimits.n002=1;await publish("shop",rules);
    const list=(await c.request("GET","/decks")).body.decks.find((r:any)=>r.id===d.id);expect(list.legal).toBe(false);expect(list.legality.some((s:string)=>s.includes("at most 1"))).toBe(true);expect(list.cards).toEqual(custom);
    expect((await c.request("POST","/matches",{deckId:d.id})).status).toBe(400);expect((await c.request("POST",`/decks/${d.id}/default`,{})).status).toBe(400);
    const copied=await c.request("POST",`/decks/${d.id}/duplicate`,{});expect(copied.status).toBe(200);expect(copied.body).toMatchObject({draft:true,cards:custom});
  });
  it("preserves an explicit format when an older client omits formatId during a rename",async()=>{
    const c=await equipped(),created=await c.request("POST","/decks",{name:"Bound format",cards:custom,config:{mode:"standard",scoring:"classic",collection:"mixed"},draft:false,formatId:"standard"});expect(created.status).toBe(201);
    const {formatId,...body}=documentOf(created.body),updated=await c.request("PUT",`/decks/${created.body.id}`,{...body,name:"Still bound format",revision:1});
    expect(updated.status).toBe(200);expect(updated.body.formatId).toBe(formatId);expect(updated.body.cards).toEqual(custom);
  });
  it("revalidates previewed deck revision and freezes match cards across later edits and purchases",async()=>{
    const c=await equipped(),d=await create(c),options=await c.request("GET",`/match-options?deckId=${d.id}`);expect(options.body.deckRevision).toBe(1);
    const saved=await c.request("PUT",`/decks/${d.id}`,{...documentOf(d),name:"Changed since preview",revision:1,draft:false});expect(saved.status).toBe(200);
    expect((await c.request("POST","/matches",{deckId:d.id,deckRevision:1})).status).toBe(409);
    const match=await c.request("POST","/matches",{deckId:d.id,deckRevision:2});expect(match.status).toBe(200);const before=(await c.request("GET",`/matches/${match.body.id}`)).body;
    const cards=custom.map(id=>id==="m001"?"n014":id);expect((await c.request("PUT",`/decks/${d.id}`,{...documentOf(saved.body),cards,revision:2,draft:false})).status).toBe(200);await reward(c,"m001");
    expect((await c.request("GET",`/matches/${match.body.id}`)).body).toEqual(before);expect((await c.request("GET","/decks")).body.defaultDeckId).toBe(d.id);
  });
  it("refreshes deficits after actual trade settlement while preserving saved contents and active match snapshots",async()=>{
    const a=await equipped(),b=await new Client().register("Mythical"),d=await create(a);await reward(b,"m002");await publish("trading",{...DEFAULT_TRADING,enabled:true,minimumAgeHours:0,minimumLevel:1,minimumMatches:0});
    const match=await a.request("POST","/matches",{deckId:d.id}),snapshot=(await a.request("GET",`/matches/${match.body.id}`)).body;
    const offer=await a.request("POST","/trading/offers",{recipientId:b.player.id,offered:[{cardId:"n002",quantity:2}],requested:[{cardId:"m002",quantity:1}],expiryHours:1,idempotencyKey:crypto.randomUUID()});expect(offer.status,JSON.stringify(offer.body)).toBe(200);
    const accepted=await b.request("POST",`/trading/offers/${offer.body.offerId}/accept`,{versionId:offer.body.versionId,idempotencyKey:crypto.randomUUID()});expect(accepted.status,JSON.stringify(accepted.body)).toBe(200);
    const affected=(await a.request("GET","/decks")).body.decks.find((r:any)=>r.id===d.id);expect(affected.cards).toEqual(custom);expect(affected.legal).toBe(false);expect(affected.legality.some((s:string)=>s.includes("requires 2, owned 1"))).toBe(true);expect((await a.request("GET",`/matches/${match.body.id}`)).body).toEqual(snapshot);
    expect((await a.request("POST","/matches",{deckId:d.id})).status).toBe(400);
    const draft=await a.request("PUT",`/decks/${d.id}`,{...documentOf(d),draft:true,revision:1});expect(draft.status).toBe(200);expect(draft.body.cards).toEqual(custom);
    const repaired=[...custom];repaired[2]="n014";expect((await a.request("PUT",`/decks/${d.id}`,{...documentOf(d),cards:repaired,draft:false,revision:2})).status).toBe(200);
  });
  it("shows approved active starter recipes without automatically selecting an inactive proposal or granting cards",async()=>{
    const c=await new Client().register("Nature"),before=(await c.request("GET","/collection")).body.inventory;
    const inactive=(await c.request("GET","/deck-builder")).body;expect(inactive.recommendations.find((r:any)=>r.collection==="Nature").cards).toEqual(content.decks.find(d=>d.collection==="Nature")!.cards);
    const version=await publish("starters",{...structuredClone(DEFAULT_STARTERS),recipeVersion:"deck-builder-active-"+run,newPlayersEnabled:true});
    const active=(await c.request("GET","/deck-builder")).body;expect(active.recommendations.find((r:any)=>r.collection==="Nature")).toMatchObject({cards:DEFAULT_STARTERS.definitions[0].recommended.cards,configVersion:version});expect((await c.request("GET","/collection")).body.inventory).toEqual(before);
  });
  it("keeps private draft collection metadata out of public builder eligibility and rejects testing escalation",async()=>{
    const c=await equipped(),d=await create(c),rules=structuredClone(DEFAULT_SHOP);rules.collections.push({...rules.collections[0],id:"private-builder-fixture",name:"Private unannounced collection",status:"draft"});await publish("shop",rules);
    expect(JSON.stringify((await c.request("GET","/deck-builder")).body)).not.toContain("Private unannounced");expect((await edit(c,d,{...documentOf(d),testingAccess:true})).status).toBe(403);
  });
});
