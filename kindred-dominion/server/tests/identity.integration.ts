import {beforeAll,afterAll,describe,it,expect} from "vitest";
import crypto from "node:crypto";
import {readConfig} from "../config";
import {database} from "../db";
import {applyMigrations,migrationStatus} from "../migrations";
import {seedRepository} from "../catalog";
import {createApi} from "../app";
import {issueLocalRecovery} from "../identity";
import {keyed} from "../security";

const config=readConfig();if(config.environment!=="integration")throw Error("Identity tests require the owned disposable PostgreSQL environment.");
const pool=database(config),run=crypto.randomBytes(5).toString("hex"),password=crypto.randomBytes(26).toString("base64url"),nextPassword=crypto.randomBytes(26).toString("base64url");
let app:Awaited<ReturnType<typeof createApi>>;
class Client{
  cookie="";csrf="";player:any;ip=`127.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`;
  async request(method:string,url:string,payload?:unknown,headers:Record<string,string>={}){const response=await app.inject({method:method as any,url,remoteAddress:this.ip,headers:{origin:config.origin,cookie:this.cookie,"x-csrf-token":this.csrf,...headers},...(payload===undefined?{}:{payload:payload as any})});const set=response.headers["set-cookie"];if(set)this.cookie=(Array.isArray(set)?set[0]:set).split(";")[0];const body=response.json();if(body.csrf)this.csrf=body.csrf;if(body.player)this.player=body.player;return {status:response.statusCode,body,headers:response.headers};}
  async register(suffix:string){await this.request("GET","/api/session");const result=await this.request("POST","/api/accounts",{username:`id_${run}_${suffix}`,email:`id_${run}_${suffix}@example.test`,password,displayName:`Identity ${suffix}`});expect(result.status).toBe(201);return this;}
  async login(username:string,pass=password){await this.request("GET","/api/session");return this.request("POST","/api/login",{username,password:pass});}
}
beforeAll(async()=>{await applyMigrations(pool,config);await seedRepository(pool);app=await createApi(config,pool);});
afterAll(async()=>{await app?.close();await pool.end();});
describe.sequential("persistent player identity completion",()=>{
  it("validates and uniquely reserves normalized usernames/email without assigning privileges",async()=>{
    const first=await new Client().register("normal");expect(first.player.role).toBe("player");expect(first.player.email).toBe(`id_${run}_normal@example.test`);
    const other=new Client();await other.request("GET","/api/session");
    const body={username:`id_${run}_second`,email:first.player.email.toUpperCase(),displayName:"Second",password};
    expect((await other.request("POST","/api/accounts",body)).status).toBe(409);
    expect((await other.request("POST","/api/accounts",{...body,email:"invalid"})).status).toBe(400);
    expect((await other.request("POST","/api/accounts",{...body,email:`unique_${run}@example.test`,role:"administrator"})).status).toBe(400);
    expect((await other.request("POST","/api/accounts",{...body,username:first.player.username.toUpperCase(),email:`unique_${run}@example.test`})).status).toBe(409);
    expect((await migrationStatus(pool,config)).applied).toBe(7);
  });
  it("preserves older accounts with no email and requires the current password to update it",async()=>{
    const client=await new Client().register("legacy");await pool.query("UPDATE kd.player SET email=NULL WHERE id=$1",[client.player.id]);
    expect((await client.request("GET","/api/profile")).body.player.email).toBeNull();
    const body={email:`legacy_${run}@example.test`,currentPassword:password};
    expect((await client.request("POST","/api/profile/email",{...body,currentPassword:"wrong"})).status).toBe(400);
    expect((await client.request("POST","/api/profile/email",body)).body.player.email).toBe(body.email);
    expect((await client.request("POST","/api/profile/email",{...body,email:`id_${run}_normal@example.test`})).status).toBe(409);
    expect((await client.request("POST","/api/profile/email",body,{origin:"https://untrusted.example"})).status).toBe(403);
  });
  it("changes a password atomically, rotates the current session and revokes every other session",async()=>{
    const owner=await new Client().register("change"),second=new Client();expect((await second.login(owner.player.username)).status).toBe(200);
    const stale=second.cookie,prior=owner.cookie;
    expect((await owner.request("POST","/api/password/change",{currentPassword:"wrong",newPassword:nextPassword})).status).toBe(400);
    const changed=await owner.request("POST","/api/password/change",{currentPassword:password,newPassword:nextPassword});expect(changed.status).toBe(200);expect(owner.cookie).not.toBe(prior);
    expect((await owner.request("GET","/api/profile")).status).toBe(200);second.cookie=stale;expect((await second.request("GET","/api/profile")).status).toBe(401);
    const login=new Client();expect((await login.login(owner.player.username)).status).toBe(401);expect((await login.login(owner.player.username,nextPassword)).status).toBe(200);
    const serialized=JSON.stringify(changed.body);expect(serialized).not.toContain(password);expect(serialized).not.toContain(nextPassword);expect(serialized).not.toContain("password_hash");
  });
  it("uses expiring one-time operator-issued recovery codes, rejects reuse and revokes sessions",async()=>{
    const owner=await new Client().register("recover"),stale=owner.cookie,reset=new Client();await reset.request("GET","/api/session");
    const expired=await issueLocalRecovery(pool,config,owner.player.username);await pool.query("UPDATE kd.password_recovery SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[keyed(expired,config)]);
    const body={username:owner.player.username,code:expired,newPassword:nextPassword};expect((await reset.request("POST","/api/password/recover",body)).status).toBe(400);
    const superseded=await issueLocalRecovery(pool,config,owner.player.username),code=await issueLocalRecovery(pool,config,owner.player.username);
    expect((await reset.request("POST","/api/password/recover",{...body,code:superseded})).status).toBe(400);
    const saved=(await pool.query("SELECT token_hash FROM kd.password_recovery WHERE token_hash=$1",[keyed(code,config)])).rows[0];expect(saved.token_hash).not.toBe(code);
    expect((await reset.request("POST","/api/password/recover",{...body,code,username:`missing_${run}`})).status).toBe(400);
    const response=await reset.request("POST","/api/password/recover",{...body,code});expect(response.status).toBe(200);expect(response.body.loginRequired).toBe(true);
    owner.cookie=stale;expect((await owner.request("GET","/api/profile")).status).toBe(401);
    expect((await reset.request("POST","/api/password/recover",{...body,code})).status).toBe(403); // cleared cookie requires a new bound anonymous session
    await reset.request("GET","/api/session");expect((await reset.request("POST","/api/password/recover",{...body,code})).status).toBe(400);
    expect((await reset.login(owner.player.username,nextPassword)).status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS total FROM kd.password_recovery WHERE player_id=$1 AND used_at IS NULL",[owner.player.id])).rows[0].total).toBe(0);
    await expect(issueLocalRecovery(pool,{...config,environment:"prod"},owner.player.username)).rejects.toThrow("restricted");
  });
  it("retains accounts, roles and authenticated sessions after API restart",async()=>{
    const client=await new Client().register("restart"),id=client.player.id,cookie=client.cookie;await app.close();app=await createApi(config,pool);client.cookie=cookie;
    const response=await client.request("GET","/api/profile");expect(response.status).toBe(200);expect(response.body.player).toMatchObject({id,role:"player",username:client.player.username});
    expect((await client.request("GET","/api/developer/workspace")).status).toBe(403);expect((await client.request("GET","/api/collection")).body.inventory).toEqual([]);
  });
});
