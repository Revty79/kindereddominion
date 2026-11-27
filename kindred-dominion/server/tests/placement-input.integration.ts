import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database} from "../db";
import {applyMigrations} from "../migrations";
import {seedRepository,publishContent} from "../catalog";
import {createApi} from "../app";
import {currentOwnerContent} from "../../src/content/current";
import {legalPlays} from "../../src/engine/game";
import {libraryOf} from "../../src/content/validation";
import {validateRecord} from "../../src/replay/record";
import {placementRequest} from "../../src/player/placement-input";

const config=readConfig();if(config.environment!=="integration")throw Error("Placement validation requires registered disposable PostgreSQL.");
const pool=database(config),content=currentOwnerContent(),run=crypto.randomBytes(6).toString("hex"),password=crypto.randomBytes(26).toString("base64url");let app:Awaited<ReturnType<typeof createApi>>,owner:Client,foreign:Client,match:any,committed:any;
class Client{
  cookie="";csrf="";ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;
  async request(method:string,url:string,payload?:unknown){const response=await app.inject({method:method as any,url,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf},...(payload===undefined?{}:{payload:payload as any})});const set=response.headers["set-cookie"];if(set)this.cookie=(Array.isArray(set)?set[0]:set).split(";")[0];const body=response.json();if(body.csrf)this.csrf=body.csrf;return {status:response.statusCode,body};}
  async register(suffix:string){await this.request("GET","/api/session");expect((await this.request("POST","/api/accounts",{username:`input_${run}_${suffix}`,email:`input_${run}_${suffix}@example.test`,password,displayName:"Placement validation"})).status).toBe(201);return this;}
}
async function saved(){return (await pool.query("SELECT state,record,revision FROM kd.match WHERE id=$1",[match.id])).rows[0];}
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);await publishContent(pool,content,"official",true);app=await createApi(config,pool);owner=await new Client().register("owner");foreign=await new Client().register("foreign");const deck=(await owner.request("POST","/api/starting-collection",{kindred:"Nature",idempotencyKey:crypto.randomUUID()})).body.deckId;match=(await owner.request("POST","/api/matches",{deckId:deck,scoring:"domination"})).body;match=(await owner.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:{type:"mulligan",cards:match.hand.some((c:any)=>c.placementType==="standard"&&c.rank===1)?[]:match.hand.map((c:any)=>c.id)}})).body;});
afterAll(async()=>{await app?.close();await pool.end();});
describe.sequential("pointer and keyboard placement use the original persistent authority",()=>{
  it("returns the exact engine legal tuples without opponent hands or private state",async()=>{
    const stored=await saved(),engine=legalPlays(stored.state,libraryOf(content),0).map(({type,player,...action})=>({type,...action}));expect(match.legalActions).toEqual(engine);expect(match.hand.length).toBeGreaterThan(0);expect(match.players[1]).not.toHaveProperty("hand");expect(match).not.toHaveProperty("seed");expect(match).not.toHaveProperty("record");const move=match.legalActions[0];expect(placementRequest(match,move.card,move.row,move.col)?.action).toEqual(move);
  });
  it("preview, rejected destinations and foreign requests cannot consume or mutate the saved position",async()=>{
    const before=await saved(),move=match.legalActions[0];expect((await owner.request("POST",`/api/matches/${match.id}/preview`,{revision:match.revision,action:move})).status).toBe(200);expect((await owner.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:{...move,row:19,col:19}})).status).toBe(400);expect((await foreign.request("POST",`/api/matches/${match.id}/preview`,{revision:match.revision,action:move})).status).toBe(404);expect(await saved()).toEqual(before);
  });
  it("overlapping commits with one operation key accept exactly once and cannot advance twice",async()=>{
    const before=await saved(),body={revision:match.revision,requestId:crypto.randomUUID(),action:match.legalActions[0]};const replies=await Promise.all([owner.request("POST",`/api/matches/${match.id}/actions`,body),owner.request("POST",`/api/matches/${match.id}/actions`,body)]);expect(replies.map(r=>r.status).sort()).toEqual([200,409]);committed=replies.find(r=>r.status===200)!.body;expect(committed.revision).toBe(before.revision+1);expect((await pool.query("SELECT count(*) FROM kd.match_request WHERE match_id=$1 AND request_id=$2",[match.id,body.requestId])).rows[0].count).toBe("1");const after=await saved();expect((await owner.request("POST",`/api/matches/${match.id}/actions`,body)).status).toBe(409);expect(await saved()).toEqual(after);expect(()=>validateRecord(after.record)).not.toThrow();
  });
  it("rejects a second operation with stale authority and resumes the accepted state after API restart",async()=>{
    const before=await saved();expect((await owner.request("POST",`/api/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:match.legalActions[0]})).status).toBe(409);expect(await saved()).toEqual(before);await app.close();app=await createApi(config,pool);const reloaded=(await owner.request("GET",`/api/matches/${match.id}`)).body;expect(reloaded.revision).toBe(committed.revision);expect(reloaded.board).toEqual(committed.board);expect(reloaded.hand).toEqual(committed.hand);expect(reloaded.score).toEqual(committed.score);const stored=await saved();expect(()=>validateRecord(stored.record)).not.toThrow();
  });
});
