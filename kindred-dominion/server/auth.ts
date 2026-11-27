import crypto from "node:crypto";
import type {} from "@fastify/cookie";
import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {z} from "zod";
import {transaction,type DB} from "./db";
import type {BackendConfig} from "./config";
import {keyed,token,equal,passwordHash,verifyPassword,rateLimit} from "./security";
import {reject} from "./errors";
import {onboardingEconomy} from "./economy";
export type Actor={id:string;username:string;displayName:string;email:string|null;role:"player"|"developer"|"administrator";startingKindred:string|null;defaultDeckId:string|null;createdAt:string};
type Session={token_hash:string;csrf:string;expires_at:string;player_id:string|null;actor:Actor|null};
const username=z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/).transform(x=>x.toLowerCase());
export const password=z.string().min(15).max(128).refine(x=>Buffer.byteLength(x)<=256);
export const email=z.string().trim().max(254).email().transform(x=>x.toLowerCase());
export const uuid=z.string().uuid();
export const operationKey=z.string().min(8).max(100).regex(/^[a-zA-Z0-9:_-]+$/);
export const profile=(r:any):Actor=>({id:r.id,username:r.username,displayName:r.display_name,email:r.email??null,role:r.role,startingKindred:r.starting_kindred,defaultDeckId:r.default_deck_id,createdAt:r.created_at});
export function authentication(app:FastifyInstance,pool:DB,config:BackendConfig,controlAvailable=false){
  const cache=new WeakMap<FastifyRequest,Session|null>();
  const cookie="kindred_session",options={httpOnly:true,secure:config.secure,sameSite:"lax" as const,path:"/api",maxAge:config.sessionHours*3600};
  async function session(req:FastifyRequest){
    if(cache.has(req))return cache.get(req)!;
    const bearer=req.cookies[cookie];let value:Session|null=null;
    if(bearer&&/^[a-zA-Z0-9_-]{43}$/.test(bearer)){
      const {rows:[row]}=await pool.query(`SELECT s.*,p.id,p.username,p.display_name,p.email,p.role,p.status,p.starting_kindred,p.default_deck_id,p.created_at AS player_created_at
        FROM kd.session s LEFT JOIN kd.player p ON p.id=s.player_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[keyed(bearer,config)]);
      if(row&&(!row.player_id||row.status==="active"))value={...row,actor:row.player_id?profile({...row,created_at:row.player_created_at}):null};
    }
    cache.set(req,value);return value;
  }
  async function issue(reply:FastifyReply,playerId:string|null,oldHash?:string,client:any=pool){
    const bearer=token(),csrf=token();if(oldHash)await client.query("DELETE FROM kd.session WHERE token_hash=$1",[oldHash]);
    await client.query("INSERT INTO kd.session(token_hash,player_id,csrf,expires_at) VALUES($1,$2,$3,now()+make_interval(hours=>$4))",[keyed(bearer,config),playerId,csrf,config.sessionHours]);
    reply.setCookie(cookie,bearer,options);return csrf;
  }
  async function actor(req:FastifyRequest,roles?:Actor["role"][]){
    const a=(await session(req))?.actor;if(!a)reject(401,"login_required","Log in to access permanent player data.");
    if(roles&&!roles.includes(a.role))reject(403,"forbidden","This operation requires an authorized developer or administrator.");return a;
  }
  app.addHook("preHandler",async req=>{
    if(!req.url.startsWith("/api/")||["GET","HEAD","OPTIONS"].includes(req.method))return;
    // This single route verifies the raw-body Stripe signature instead of a browser session.
    if(req.method==="POST"&&req.routeOptions.url==="/api/commerce/stripe/webhook")return;
    if(req.headers.origin!==config.origin)reject(403,"origin_rejected","Request origin is not permitted.");
    const s=await session(req),csrf=req.headers["x-csrf-token"];
    if(!s||typeof csrf!=="string"||!equal(s.csrf,csrf))reject(403,"csrf_rejected","Refresh the account page before retrying this request.");
  });
  app.get("/api/session",async(req,reply)=>{
    let s=await session(req);
    const capabilities={recovery:["dev","integration"].includes(config.environment)?"local-operator":"operator-assisted",emailDelivery:false,localTestingAcquisition:config.localTestingAcquisition,controlApp:controlAvailable&&s?.actor&&s.actor.role!=="player"?"/api/control/":null};
    if(!s){await rateLimit(pool,"session:"+keyed(req.ip,config),60,3600);const csrf=await issue(reply,null);return {player:null,csrf,registration:config.registration,capabilities};}
    return {player:s.actor,csrf:s.csrf,registration:config.registration,capabilities};
  });
  const signup=z.object({username,email,password,displayName:z.string().trim().min(1).max(60),invite:z.string().max(100).optional()}).strict();
  app.post("/api/accounts",async(req,reply)=>{
    const b=signup.parse(req.body);await rateLimit(pool,"register:"+keyed(req.ip,config),config.registrationLimit,3600);
    if(config.registration==="closed")reject(403,"registration_closed","Account registration is closed.");
    const hash=await passwordHash(b.password),old=await session(req);
    return transaction(pool,async c=>{
      if(config.registration==="invite"){
        const {rows:[invite]}=await c.query("SELECT * FROM kd.invite WHERE token_hash=$1 FOR UPDATE",[keyed(b.invite??"",config)]);
        if(!invite||invite.revoked_at||invite.uses>=invite.max_uses||new Date(invite.expires_at).getTime()<=Date.now())reject(403,"invalid_invite","A valid unused invitation is required.");
        await c.query("UPDATE kd.invite SET uses=uses+1 WHERE token_hash=$1",[invite.token_hash]);
      }
      const id=crypto.randomUUID();const {rows:[p]}=await c.query("INSERT INTO kd.player(id,username,display_name,password_hash,email) VALUES($1,$2,$3,$4,$5) RETURNING *",[id,b.username,b.displayName,hash,b.email]);
      await c.query("INSERT INTO kd.progression_extension(player_id) VALUES($1)",[id]);
      await onboardingEconomy(c,id,config);
      const csrf=await issue(reply,id,old?.token_hash,c);reply.code(201);return {player:profile(p),csrf};
    });
  });
  app.post("/api/login",async(req,reply)=>{
    const b=z.object({username,password:z.string().min(1).max(128)}).strict().parse(req.body);
    await rateLimit(pool,"login-ip:"+keyed(req.ip,config),30,900);await rateLimit(pool,"login-user:"+keyed(b.username,config),12,900);
    const {rows:[p]}=await pool.query("SELECT * FROM kd.player WHERE username=$1",[b.username]);
    if(!p){await passwordHash(b.password,"kindred-unknown-user");reject(401,"invalid_login","Username or password was not accepted.");}
    if(!await verifyPassword(b.password,p.password_hash)||p.status!=="active")reject(401,"invalid_login","Username or password was not accepted.");
    const csrf=await transaction(pool,c=>issue(reply,p.id,cache.get(req)?.token_hash,c));return {player:profile(p),csrf};
  });
  app.post("/api/logout",async(req,reply)=>{const s=await session(req);if(s)await pool.query("DELETE FROM kd.session WHERE token_hash=$1",[s.token_hash]);reply.clearCookie(cookie,{path:"/api"});return {ok:true};});
  app.get("/api/profile",async req=>({player:await actor(req)}));
  app.patch("/api/profile",async req=>{const a=await actor(req),b=z.object({displayName:z.string().trim().min(1).max(60)}).strict().parse(req.body);const {rows:[p]}=await pool.query("UPDATE kd.player SET display_name=$2 WHERE id=$1 RETURNING *",[a.id,b.displayName]);return {player:profile(p)};});
  return {actor,session,issue};
}
export type Authentication=ReturnType<typeof authentication>;
