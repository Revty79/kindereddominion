import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database} from "../db";
import {applyMigrations} from "../migrations";
import {seedRepository,publishContent} from "../catalog";
import {createApi} from "../app";
import {currentOwnerContent} from "../../src/content/current";
const config=readConfig();if(config.environment!=="integration")throw Error("Acquisition/deck tests require owned disposable PostgreSQL.");
const pool=database(config),run=crypto.randomBytes(5).toString("hex"),password=crypto.randomBytes(26).toString("base64url"),content=currentOwnerContent();
let app:Awaited<ReturnType<typeof createApi>>;
class Client{
  cookie="";csrf="";player:any;ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;
  async request(method:string,url:string,payload?:unknown){const response=await app.inject({method:method as any,url,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf},...(payload===undefined?{}:{payload:payload as any})});const set=response.headers["set-cookie"];if(set)this.cookie=(Array.isArray(set)?set[0]:set).split(";")[0];const body=response.json();if(body.csrf)this.csrf=body.csrf;if(body.player)this.player=body.player;return {status:response.statusCode,body};}
  async register(suffix:string){await this.request("GET","/api/session");expect((await this.request("POST","/api/accounts",{username:`ac_${run}_${suffix}`,email:`ac_${run}_${suffix}@example.test`,password,displayName:"Acquisition test"})).status).toBe(201);return this;}
  async starter(){const response=await this.request("POST","/api/starting-collection",{kindred:"Nature",idempotencyKey:crypto.randomUUID()});expect(response.status).toBe(200);return response.body.deckId as string;}
}
async function complete(client:Client,deckId:string){let response=await client.request("POST","/api/matches",{deckId}),match=response.body;expect(response.status).toBe(200);for(let turn=0;turn<100&&match.status!=="finished";turn++){response=await client.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:match.status==="mulligan"?{type:"mulligan",cards:[]}:match.legalActions[0]??{type:"pass"}});expect(response.status).toBe(200);match=response.body;}expect(match.status).toBe("finished");return match;}
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);await publishContent(pool,content,"official",true);app=await createApi({...config,localTestingAcquisition:true,testingPackCards:["a001","m001","n001"]},pool);});
afterAll(async()=>{await app?.close();await pool.end();});
describe.sequential("owned deck drafts and bounded local acquisition",()=>{
  it("saves repairable drafts while blocking their battle use and unknown identities",async()=>{
    const client=await new Client().register("draft"),starter=await client.starter(),body={name:"Incomplete formation",cards:["n001"],config:{scoring:"classic",mode:"standard",collection:"mixed"},draft:true};
    const response=await client.request("POST","/api/decks",body);expect(response.status).toBe(201);const id=response.body.id;
    expect((await client.request("GET","/api/decks")).body.decks.find((deck:any)=>deck.id===id)).toMatchObject({draft:true,legal:false});
    expect((await client.request("POST",`/api/decks/${id}/default`,{})).status).toBe(400);expect((await client.request("POST","/api/matches",{deckId:id})).status).toBe(400);
    const unowned=await client.request("POST","/api/decks",{...body,cards:["m001"]});expect(unowned.status).toBe(201);expect((await client.request("POST","/api/matches",{deckId:unowned.body.id})).status).toBe(400);expect((await client.request("GET","/api/collection")).body.inventory.some((r:any)=>r.card_id==="m001"&&r.quantity>0)).toBe(false);expect((await client.request("POST","/api/decks",{...body,cards:["unpublished"]})).status).toBe(400);
    expect((await client.request("POST","/api/decks",{...body,testingAccess:true})).status).toBe(403);
    const ready=await client.request("PUT",`/api/decks/${id}`,{...body,cards:content.decks[0].cards,draft:false,revision:1});expect(ready.status).toBe(200);expect((await client.request("POST",`/api/decks/${id}/default`,{})).status).toBe(200);
    expect((await client.request("PUT",`/api/decks/${id}`,{...body,revision:2})).status).toBe(200);expect((await client.request("GET","/api/decks")).body.defaultDeckId).toBeNull();
    expect((await client.request("GET",`/api/decks/${starter}`)).body.cards).toEqual(content.decks[0].cards);
  });
  let owner:Client,foreign:Client,packId:string;
  it("requires a verified normal battle and issues exactly one sampler under concurrent requests",async()=>{
    owner=await new Client().register("owner");foreign=await new Client().register("foreign");const deck=await owner.starter();
    expect((await owner.request("POST","/api/testing/sampler",{idempotencyKey:crypto.randomUUID()})).status).toBe(400);
    await complete(owner,deck);expect((await owner.request("GET","/api/progression")).body.stats.matches).toBe(1);
    const issued=await Promise.all(Array.from({length:5},()=>owner.request("POST","/api/testing/sampler",{idempotencyKey:crypto.randomUUID()})));expect(issued.every(response=>response.status===200)).toBe(true);expect(new Set(issued.map(response=>response.body.pack.id)).size).toBe(1);expect(issued.filter(response=>!response.body.replayed)).toHaveLength(1);packId=issued[0].body.pack.id;
    expect((await owner.request("GET","/api/packs")).body.policy.available).toBe(false);expect((await owner.request("GET","/api/collection")).body.inventory).toHaveLength(30);
  });
  it("opens atomically once, adds duplicates as quantities and retains historical published artwork",async()=>{
    const opened=await Promise.all(Array.from({length:5},()=>owner.request("POST",`/api/packs/${packId}/open`,{idempotencyKey:crypto.randomUUID()})));expect(opened.every(response=>response.status===200)).toBe(true);expect(opened.filter(response=>!response.body.replayed)).toHaveLength(1);
    const result=opened[0].body;expect(result.cards).toEqual(["a001","m001","n001"]);expect(result.content.id).toBe(content.id);expect(result.content.metadata.a001.artworkRef).toEqual(content.metadata.a001.artworkRef);
    const inventory=(await owner.request("GET","/api/collection")).body.inventory;expect(inventory).toHaveLength(32);expect(inventory.find((row:any)=>row.card_id==="n001").quantity).toBe(2);
    const acquisitions=(await owner.request("GET","/api/acquisitions")).body.acquisitions;expect(acquisitions.filter((row:any)=>row.testing)).toHaveLength(1);expect(acquisitions).toHaveLength(2);
    const changed=structuredClone(content);changed.id=`sampler-history-${run}`;
    const latest=(await pool.query("SELECT DISTINCT ON(card_id) card_id,definition_revision,definition FROM kd.card_revision WHERE card_id=ANY($1) ORDER BY card_id,definition_revision DESC",[changed.cards.map(card=>card.id)])).rows;
    changed.cards=changed.cards.map(card=>structuredClone(latest.find(row=>row.card_id===card.id)?.definition??card));changed.cards[0].name+=" renamed";
    try{await publishContent(pool,changed,"official",true);const repeated=await owner.request("POST",`/api/packs/${packId}/open`,{idempotencyKey:crypto.randomUUID()});expect(repeated.body.content.id).toBe(content.id);expect(repeated.body.content.cards[0].name).toBe(content.cards[0].name);expect((await owner.request("GET","/api/collection")).body.inventory).toEqual(inventory);}finally{await publishContent(pool,content,"official",true);}
  });
  it("rejects foreign packs, arbitrary grants and disabled acquisition while preserving received cards",async()=>{
    expect((await foreign.request("POST",`/api/packs/${packId}/open`,{idempotencyKey:crypto.randomUUID()})).status).toBe(404);expect((await foreign.request("GET","/api/acquisitions")).body.acquisitions).toEqual([]);
    expect((await owner.request("POST",`/api/packs/${packId}/open`,{idempotencyKey:crypto.randomUUID(),cards:["n030"]})).status).toBe(400);
    const enabled=app,disabled=await createApi({...config,localTestingAcquisition:false},pool);app=disabled;
    try{expect((await owner.request("POST","/api/testing/sampler",{idempotencyKey:crypto.randomUUID()})).status).toBe(403);expect((await owner.request("POST",`/api/packs/${packId}/open`,{idempotencyKey:crypto.randomUUID()})).body.replayed).toBe(true);expect((await owner.request("GET","/api/collection")).body.inventory.find((row:any)=>row.card_id==="n001").quantity).toBe(2);}finally{app=enabled;await disabled.close();}
  });
  it("does not award sampler eligibility or statistics for unrestricted developer battles",async()=>{
    const developer=await new Client().register("sandbox");await pool.query("UPDATE kd.player SET role='developer' WHERE id=$1",[developer.player.id]);
    const created=await developer.request("POST","/api/decks",{name:"Isolated test",cards:content.decks[0].cards,config:{scoring:"classic",mode:"standard",collection:"mixed"},testingAccess:true});expect(created.status).toBe(201);await complete(developer,created.body.id);
    expect((await developer.request("GET","/api/progression")).body.stats.matches).toBe(0);expect((await developer.request("GET","/api/packs")).body.policy.hasCompletedMatch).toBe(false);expect((await developer.request("POST","/api/testing/sampler",{idempotencyKey:crypto.randomUUID()})).status).toBe(400);expect((await developer.request("GET","/api/collection")).body.inventory).toEqual([]);
  });
});
