import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {BackendConfig} from "./config";
import type {DB} from "./db";
import {transaction} from "./db";
import {type Authentication,password,email,profile} from "./auth";
import {keyed,passwordHash,verifyPassword,rateLimit,token} from "./security";
import {reject} from "./errors";

export async function issueLocalRecovery(pool:DB,config:BackendConfig,username:string){
  if(!["dev","integration"].includes(config.environment))throw Error("Local recovery codes are restricted to development environments. Use the documented operator recovery procedure for hosted accounts.");
  const code=token();
  await transaction(pool,async c=>{
    const {rows:[player]}=await c.query("SELECT id FROM kd.player WHERE username=$1 AND status='active' FOR UPDATE",[username.toLowerCase()]);
    if(!player)throw Error("Active account was not found.");
    await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE player_id=$1 AND used_at IS NULL",[player.id]);
    await c.query("INSERT INTO kd.password_recovery(token_hash,player_id,expires_at) VALUES($1,$2,now()+interval '15 minutes')",[keyed(code,config),player.id]);
    await c.query("INSERT INTO kd.audit_event(operation,target_id) VALUES('operator-local-recovery-issued',$1)",[player.id]);
  });
  return code;
}

export function identityRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
  app.post("/api/password/change",async(req,reply)=>{
    const actor=await auth.actor(req),body=z.object({currentPassword:z.string().min(1).max(128),newPassword:password}).strict().parse(req.body);
    await rateLimit(pool,"password-change:"+keyed(actor.id,config),6,900);
    const {rows:[player]}=await pool.query("SELECT password_hash FROM kd.player WHERE id=$1 AND status='active'",[actor.id]);
    if(!player||!await verifyPassword(body.currentPassword,player.password_hash))reject(400,"password_rejected","The current password was not accepted.");
    const hash=await passwordHash(body.newPassword);
    return transaction(pool,async c=>{
      const {rows:[locked]}=await c.query("SELECT * FROM kd.player WHERE id=$1 AND status='active' FOR UPDATE",[actor.id]);
      if(!locked||locked.password_hash!==player.password_hash)reject(409,"identity_changed","Your account changed. Log in again before retrying.");
      await c.query("UPDATE kd.player SET password_hash=$2 WHERE id=$1",[actor.id,hash]);
      await c.query("DELETE FROM kd.session WHERE player_id=$1",[actor.id]);
      await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE player_id=$1 AND used_at IS NULL",[actor.id]);
      const csrf=await auth.issue(reply,actor.id,undefined,c);
      await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id) VALUES($1,'password-changed',$2)",[actor.id,actor.id]);
      return {player:profile(locked),csrf,changed:true};
    });
  });
  app.post("/api/profile/email",async req=>{
    const actor=await auth.actor(req),body=z.object({email,currentPassword:z.string().min(1).max(128)}).strict().parse(req.body);
    await rateLimit(pool,"email-change:"+keyed(actor.id,config),6,900);
    const {rows:[player]}=await pool.query("SELECT password_hash FROM kd.player WHERE id=$1 AND status='active'",[actor.id]);
    if(!player||!await verifyPassword(body.currentPassword,player.password_hash))reject(400,"password_rejected","The current password was not accepted.");
    return transaction(pool,async c=>{
      const {rows:[updated]}=await c.query("UPDATE kd.player SET email=$2 WHERE id=$1 AND password_hash=$3 AND status='active' RETURNING *",[actor.id,body.email,player.password_hash]);
      if(!updated)reject(409,"identity_changed","Your account changed. Log in again before retrying.");
      await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE player_id=$1 AND used_at IS NULL",[actor.id]);
      await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id) VALUES($1,'email-changed',$2)",[actor.id,actor.id]);
      return {player:profile(updated),emailVerified:false,emailDelivery:false};
    });
  });
  app.post("/api/password/recover",async(req,reply)=>{
    if(!["dev","integration"].includes(config.environment))reject(404,"unavailable","This recovery method is not available in this environment.");
    const body=z.object({username:z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/).transform(x=>x.toLowerCase()),code:z.string().regex(/^[a-zA-Z0-9_-]{43}$/),newPassword:password}).strict().parse(req.body);
    await rateLimit(pool,"recovery-ip:"+keyed(req.ip,config),10,900);await rateLimit(pool,"recovery-user:"+keyed(body.username,config),6,900);
    // Hash only after validating a real code. Invalid codes never change or lock an account.
    const {rows:[candidate]}=await pool.query("SELECT r.player_id FROM kd.password_recovery r JOIN kd.player p ON p.id=r.player_id WHERE r.token_hash=$1 AND p.username=$2 AND p.status='active' AND r.used_at IS NULL AND r.expires_at>now()",[keyed(body.code,config),body.username]);
    if(!candidate)reject(400,"recovery_rejected","The recovery code is invalid, expired or already used.");
    const hash=await passwordHash(body.newPassword);
    await transaction(pool,async c=>{
      const {rows:[player]}=await c.query("SELECT id FROM kd.player WHERE id=$1 AND status='active' FOR UPDATE",[candidate.player_id]);
      const {rows:[recovery]}=await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE token_hash=$1 AND player_id=$2 AND used_at IS NULL AND expires_at>now() RETURNING player_id",[keyed(body.code,config),candidate.player_id]);
      if(!player||!recovery)reject(400,"recovery_rejected","The recovery code is invalid, expired or already used.");
      await c.query("UPDATE kd.player SET password_hash=$2 WHERE id=$1",[player.id,hash]);
      await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE player_id=$1 AND used_at IS NULL",[player.id]);
      await c.query("DELETE FROM kd.session WHERE player_id=$1",[player.id]);
      await c.query("INSERT INTO kd.audit_event(operation,target_id) VALUES('local-password-recovered',$1)",[player.id]);
    });
    reply.clearCookie("kindred_session",{path:"/api"});return {recovered:true,loginRequired:true};
  });
}
