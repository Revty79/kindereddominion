import type {Client,AssetOrigin} from "./economy-assets";
import {reject} from "./errors";
export type RewardEntitlement={entitlementId:string;type:"booster"|"cosmetic"|"title"|"limited";allocationId?:string;definitionId:string;quantity:number};
export type EntitlementContext={economyVersion:string;origin:string;cardOrigin?:AssetOrigin;actorId?:string;referenceId?:string};
type Handler=(c:Client,playerId:string,entitlement:RewardEntitlement,context:EntitlementContext)=>Promise<void|{deferred:boolean}>;
const handlers=new Map<string,Handler>();
export function registerRewardEntitlement(type:string,handler:Handler){handlers.set(type,handler);}
export function requireRewardEntitlements(entitlements:{type:string}[]){if(entitlements.some(e=>!handlers.has(e.type)))reject(400,"entitlement_inactive","This reward entitlement service is not active yet.");}
export async function fulfillRewardEntitlement(c:Client,playerId:string,entitlement:RewardEntitlement,context:EntitlementContext){const handler=handlers.get(entitlement.type);if(!handler)reject(400,"entitlement_inactive","This reward entitlement service is not active yet.");const result=await handler(c,playerId,entitlement,context);if(!result?.deferred)await c.query("UPDATE kd.reward_entitlement SET fulfilled_at=now() WHERE id=$1",[entitlement.entitlementId]);}
