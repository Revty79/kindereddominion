import crypto from "node:crypto";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {BackendConfig} from "./config";
import type {Authentication} from "./auth";
import {uuid,operationKey} from "./auth";
import {type DB,transaction} from "./db";
import {activeContent,contentVersion} from "./catalog";
import {inventoryTransaction} from "./inventory";
import {reject} from "./errors";
const policyId="local-sampler-v1";
const publicPack=(row:any)=>({id:row.id,label:row.label,policy:row.policy_id,testing:true,contentVersion:row.version_id,count:row.cards.length,status:row.opened_at?"opened":"sealed",createdAt:row.created_at,openedAt:row.opened_at});
export function acquisitionRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
  const testingEnabled=config.localTestingAcquisition&&["dev","integration"].includes(config.environment);
  app.get("/api/acquisitions",async req=>{
    const actor=await auth.actor(req),{rows}=await pool.query("SELECT id,source,result,created_at FROM kd.acquisition WHERE player_id=$1 ORDER BY created_at DESC,id LIMIT 200",[actor.id]);
    return {acquisitions:rows.map(row=>({id:row.id,source:row.source,changes:row.result.changes,createdAt:row.created_at,testing:row.source.startsWith("local-testing:")}))};
  });
  app.get("/api/packs",async req=>{
    const actor=await auth.actor(req),{rows}=await pool.query("SELECT * FROM kd.card_pack WHERE player_id=$1 ORDER BY created_at DESC,id",[actor.id]),completed=Number((await pool.query("SELECT count(*) FROM kd.match_completion WHERE player_id=$1",[actor.id])).rows[0].count);
    return {packs:rows.map(publicPack),policy:{enabled:testingEnabled,id:policyId,label:"Local testing sampler",count:config.testingPackCards.length,available:testingEnabled&&completed>0&&!rows.some(row=>row.policy_id===policyId),hasCompletedMatch:completed>0,description:"One configurable sampler after your first verified computer battle. Local testing only; this is not a production reward economy, rarity system or purchase."}};
  });
  app.post("/api/testing/sampler",async req=>{
    const actor=await auth.actor(req);z.object({idempotencyKey:operationKey}).strict().parse(req.body);
    if(!testingEnabled)reject(403,"testing_acquisition_disabled","Local testing acquisition is not enabled on this server.");
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[actor.id]);
      const {rows:[existing]}=await c.query("SELECT * FROM kd.card_pack WHERE player_id=$1 AND policy_id=$2",[actor.id,policyId]);
      if(existing)return {pack:publicPack(existing),replayed:true};
      if(!(await c.query("SELECT 1 FROM kd.match_completion WHERE player_id=$1 LIMIT 1",[actor.id])).rowCount)reject(400,"battle_required","Complete one normal computer battle before claiming the local testing sampler. Sandbox battles do not qualify.");
      const pack=await activeContent(c),cards=config.testingPackCards;
      if(cards.some(id=>!pack.cards.some(card=>card.id===id)))reject(503,"testing_policy_unavailable","The configured testing sampler is not available in this published catalog.");
      const {rows:[created]}=await c.query("INSERT INTO kd.card_pack(id,player_id,policy_id,version_id,label,cards) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[crypto.randomUUID(),actor.id,policyId,pack.id,"Founding sampler · Local testing",JSON.stringify(cards)]);
      await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'local-testing-pack-issued',$2,$3)",[actor.id,created.id,{policy:policyId,contentVersion:pack.id,cards}]);
      return {pack:publicPack(created),replayed:false};
    });
  });
  app.post<{Params:{id:string}}>("/api/packs/:id/open",async req=>{
    const actor=await auth.actor(req),id=uuid.parse(req.params.id);z.object({idempotencyKey:operationKey}).strict().parse(req.body);
    return transaction(pool,async c=>{
      await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[actor.id]);
      const {rows:[row]}=await c.query("SELECT * FROM kd.card_pack WHERE id=$1 AND player_id=$2 FOR UPDATE",[id,actor.id]);
      if(!row)reject(404,"pack_missing","Card pack was not found.");
      const content=await contentVersion(c,row.version_id);
      if(row.opened_at){const {rows:[prior]}=await c.query("SELECT result FROM kd.acquisition WHERE id=$1 AND player_id=$2",[row.acquisition_id,actor.id]);return {pack:publicPack(row),cards:row.cards,content,acquisition:prior.result,replayed:true};}
      if(!testingEnabled)reject(403,"testing_acquisition_disabled","Local testing acquisition is disabled. Previously acquired cards remain owned.");
      const editions=new Map<string,number>();
      for(const id of row.cards as string[]){const card=content.cards.find(card=>card.id===id);if(!card?.collectible)reject(503,"pack_content_unavailable","This pack's historical published content is unavailable.");const edition=`${card.collectible.gameplayId}:${card.collectible.edition}`;editions.set(edition,(editions.get(edition)??0)+1);}
      const acquisition=await inventoryTransaction(c,actor.id,`pack:${row.id}`,"local-testing:sampler-v1",[...editions].map(([editionId,quantity])=>({editionId,quantity})),actor.id);
      const {rows:[opened]}=await c.query("UPDATE kd.card_pack SET opened_at=now(),acquisition_id=$2 WHERE id=$1 RETURNING *",[row.id,acquisition.id]);
      await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'local-testing-pack-opened',$2,$3)",[actor.id,row.id,{acquisition:acquisition.id,policy:policyId}]);
      return {pack:publicPack(opened),cards:row.cards,content,acquisition,replayed:false};
    });
  });
}
