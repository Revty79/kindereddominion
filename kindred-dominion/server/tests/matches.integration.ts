import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database} from "../db";
import {applyMigrations} from "../migrations";
import {seedRepository,publishContent} from "../catalog";
import {createApi} from "../app";
import {currentOwnerContent} from "../../src/content/current";
import {validateRecord} from "../../src/replay/record";
const config=readConfig();if(config.environment!=="integration")throw Error("Normal-match tests require owned disposable PostgreSQL.");
const pool=database(config),run=crypto.randomBytes(5).toString("hex"),password=crypto.randomBytes(26).toString("base64url"),content=currentOwnerContent();let app:Awaited<ReturnType<typeof createApi>>;
class Client{cookie="";csrf="";player:any;ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;async request(method:string,url:string,payload?:unknown){const response=await app.inject({method:method as any,url,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf},...(payload===undefined?{}:{payload:payload as any})});const set=response.headers["set-cookie"];if(set)this.cookie=(Array.isArray(set)?set[0]:set).split(";")[0];const body=response.json();if(body.csrf)this.csrf=body.csrf;if(body.player)this.player=body.player;return {status:response.statusCode,body};}async register(suffix:string){await this.request("GET","/api/session");expect((await this.request("POST","/api/accounts",{username:`ma_${run}_${suffix}`,email:`ma_${run}_${suffix}@example.test`,password,displayName:"Match validation"})).status).toBe(201);return this;}}
let player:Client,foreign:Client,deckId:string,match:any;
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);await publishContent(pool,content,"official",true);app=await createApi(config,pool);player=await new Client().register("player");foreign=await new Client().register("foreign");deckId=(await player.request("POST","/api/starting-collection",{kindred:"Nature",idempotencyKey:crypto.randomUUID()})).body.deckId;});afterAll(async()=>{await app?.close();await pool.end();});
describe.sequential("normal player battle selection and stored outcomes",()=>{
  it("offers only published legal computer formations for the owned deck and rejects foreign/private choices",async()=>{
    const options=await player.request("GET",`/api/match-options?deckId=${deckId}`);expect(options.status).toBe(200);expect(options.body.opponents).toHaveLength(content.decks.length);expect(options.body.opponents.every((opponent:any)=>content.decks.some(deck=>deck.id===opponent.id))).toBe(true);
    expect((await foreign.request("GET",`/api/match-options?deckId=${deckId}`)).status).toBe(404);expect((await player.request("POST","/api/matches",{deckId,opponentDeckId:"private-draft"})).status).toBe(400);
    const selected=content.decks.find(deck=>deck.collection==="Mythical")!,response=await player.request("POST","/api/matches",{deckId,scoring:"domination",opponentDeckId:selected.id});expect(response.status).toBe(200);match=response.body;expect(match.configuration.scoring).toBe("domination");expect(match.opponent.name).toBe(selected.name);expect(match.hand.every((card:any)=>card.owner===0)).toBe(true);expect(match.players[1]).not.toHaveProperty("hand");expect(match).not.toHaveProperty("seed");
    const stored=(await pool.query("SELECT decks FROM kd.match WHERE id=$1",[match.id])).rows[0];expect(stored.decks[1]).toEqual(selected.cards);
  });
  it("applies the saved Kindred restrictions to computer formation selection",async()=>{
    const response=await player.request("POST","/api/decks",{name:"Nature only",cards:content.decks[0].cards,config:{scoring:"classic",mode:"standard",collection:"Nature"}});expect(response.status).toBe(201);const id=response.body.id;
    const options=await player.request("GET",`/api/match-options?deckId=${id}`);expect(options.body.opponents.map((opponent:any)=>opponent.kindred)).toEqual(["Nature"]);
    expect((await player.request("POST","/api/matches",{deckId:id,opponentDeckId:content.decks.find(deck=>deck.collection==="Mythical")!.id})).status).toBe(400);
  });
  it("resumes, completes and replays a selected Domination match with exactly one persistent result after API restart",async()=>{
    expect((await foreign.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:{type:"pass"}})).status).toBe(404);
    for(let turn=0;turn<100&&match.status!=="finished";turn++){const response=await player.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:match.status==="mulligan"?{type:"mulligan",cards:[]}:match.legalActions[0]??{type:"pass"}});expect(response.status).toBe(200);match=response.body;}
    expect(match.status).toBe("finished");expect(match.result.reason).not.toBe("surrender");await app.close();app=await createApi(config,pool);
    const saved=await player.request("GET",`/api/matches/${match.id}`);expect(saved.body.result).toEqual(match.result);expect(saved.body.opponent).toEqual(match.opponent);expect(saved.body.score).toEqual(match.score);
    expect((await player.request("GET","/api/progression")).body.stats.matches).toBe(1);expect((await player.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:{type:"pass"}})).status).toBe(409);expect((await player.request("GET","/api/progression")).body.stats.matches).toBe(1);
    const record=(await pool.query("SELECT record FROM kd.match WHERE id=$1",[match.id])).rows[0].record;expect(()=>validateRecord(record)).not.toThrow();const replay=await player.request("GET",`/api/matches/${match.id}/replay`);expect(replay.body.frames.at(-1).view.result).toEqual(match.result);
  });
});
