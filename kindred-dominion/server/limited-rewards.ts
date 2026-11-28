import crypto from "node:crypto";
import type {Client} from "./economy-assets";
import {registerRewardEntitlement,fulfillRewardEntitlement} from "./reward-entitlements";
import {limitedEdition} from "./limited-supply";
import {issueLimited} from "./limited-assets";
import {economyDigest} from "./economy-hash";
import {ApiError,reject} from "./errors";
export function registerLimitedRewards(){registerRewardEntitlement("limited",async(c,playerId,e,context)=>{
 const pinned=(await c.query("SELECT snapshot FROM kd.reward_product_snapshot WHERE economy_version=$1 AND type='limited' AND definition_id=$2",[context.economyVersion,e.definitionId])).rows[0];
 const edition=await limitedEdition(c,e.definitionId),allocation=edition.spec.allocations.find(a=>a.id===e.allocationId);
 if(!pinned||!allocation||economyDigest(pinned.snapshot.core)!==economyDigest(edition.core))reject(409,"limited_reward_snapshot_missing","The original limited reward promise requires investigation.");
 let deferred=false;
 for(let index=0;index<e.quantity;index++){
 if((await c.query("SELECT 1 FROM kd.limited_reward_outcome WHERE entitlement_id=$1 AND unit_index=$2 AND status IN('issued','exhausted')",[e.entitlementId,index])).rowCount)continue;
 await c.query("SAVEPOINT limited_reward_unit");
 try{const bound=context.origin==="administrator"||context.origin==="sandbox",result=await issueLimited(c,{editionId:e.definitionId,playerId,method:allocation.method,allocationId:allocation.id,reference:"reward:"+e.entitlementId+":"+index,reason:"Published reserved reward",actorId:context.actorId,provenance:{origin:bound?context.origin as "administrator"|"sandbox":context.cardOrigin??"achievement",tradeable:!bound&&edition.spec.tradeable,sandbox:context.origin==="sandbox",configVersion:context.economyVersion,sourceReference:e.entitlementId}});await c.query("INSERT INTO kd.limited_reward_outcome(id,entitlement_id,unit_index,status,instance_id,reason) VALUES($1,$2,$3,'issued',$4,'Original reserved reward fulfilled')",[crypto.randomUUID(),e.entitlementId,index,result.limitedInstances[0].id]);await c.query("RELEASE SAVEPOINT limited_reward_unit");}
 catch(error){await c.query("ROLLBACK TO SAVEPOINT limited_reward_unit");await c.query("RELEASE SAVEPOINT limited_reward_unit");if(!(error instanceof ApiError)||!["limited_sold_out","limited_allocation_exhausted","limited_unavailable","limited_environment_boundary"].includes(error.code))throw error;const exhausted=["limited_sold_out","limited_allocation_exhausted"].includes(error.code);deferred||=!exhausted;await c.query("INSERT INTO kd.limited_reward_outcome(id,entitlement_id,unit_index,status,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(entitlement_id,unit_index,status) DO NOTHING",[crypto.randomUUID(),e.entitlementId,index,exhausted?"exhausted":"pending",error.code]);}
 }
 return {deferred};
 });}
// Exact retained entitlement only; no new reward receipt or source can be invented.
export async function retryLimitedReward(c:Client,id:string,playerId:string){
 const row=(await c.query("SELECT e.*,g.config_version,g.result FROM kd.reward_entitlement e JOIN kd.reward_grant g ON g.id=e.reward_id WHERE e.id=$1 AND e.player_id=$2 AND e.type='limited' FOR UPDATE OF e",[id,playerId])).rows[0];if(!row)reject(404,"reward_missing","This account's retained limited reward was not found.");if(row.fulfilled_at)return {fulfilled:true,replayed:true};if(!row.fulfillment_context)reject(409,"reward_context_investigation","This legacy entitlement lacks its original fulfillment context; investigate without inventing provenance.");
 await fulfillRewardEntitlement(c,playerId,{entitlementId:id,type:"limited",definitionId:row.definition_id,quantity:row.quantity,allocationId:row.allocation_id},row.fulfillment_context);return {fulfilled:!!(await c.query("SELECT fulfilled_at FROM kd.reward_entitlement WHERE id=$1",[id])).rows[0].fulfilled_at};
}
