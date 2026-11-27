import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import {transaction,type DB} from "./db";
import {rateLimit,keyed} from "./security";
import {reject} from "./errors";
import {normalizePresentation,PRESENTATION_MODES} from "../src/player/presentation-preferences";
import {retainRecentMoves,type RecentMoves} from "../src/ui/recent-moves";
import type {AcceptedResolution,ResolutionBatch} from "../src/ui/resolution-presentation";
export async function readPresentation(db:any,playerId:string){const row=(await db.query("SELECT revision,preferences FROM kd.player_presentation WHERE player_id=$1",[playerId])).rows[0];return {revision:row?.revision??0,preferences:normalizePresentation(row?.preferences)};}
export async function readRecent(db:any,matchId:string,playerId:string,expectedRevision?:number):Promise<RecentMoves>{
 // One statement observes ownership, current revision and its public history
 // from the same MVCC snapshot while another action may be committing.
 const row=(await db.query("SELECT m.revision,h.history FROM kd.match m LEFT JOIN kd.match_recent_presentation h ON h.match_id=m.id AND h.revision=m.revision WHERE m.id=$1 AND m.player_id=$2",[matchId,playerId])).rows[0];
 if(!row)reject(404,"match_missing","Match was not found.");const revision=row.revision,value=row.history;
 if(expectedRevision!==undefined&&expectedRevision!==revision)reject(409,"stale_match","The match changed. Return to the current battlefield before inspecting the latest move.");
 return value?.schema===1&&value.matchId===matchId&&value.revision===revision&&Array.isArray(value.moves)?value:{schema:1,matchId,revision,moves:[]};
}
export async function saveRecent(db:any,matchId:string,revision:number,batch:ResolutionBatch,resolutions:AcceptedResolution[]){
 const previous=(await db.query("SELECT history FROM kd.match_recent_presentation WHERE match_id=$1",[matchId])).rows[0]?.history;
 const actions=resolutions.map(r=>({id:matchId+":"+r.sequence,actor:r.action.player,sequence:r.sequence,type:r.action.type}));
 let history:RecentMoves;try{history=retainRecentMoves(previous,batch,actions);}catch{history=retainRecentMoves(undefined,{...batch,truncated:true,events:[]},actions);}
 await db.query("INSERT INTO kd.match_recent_presentation(match_id,revision,history) VALUES($1,$2,$3) ON CONFLICT(match_id) DO UPDATE SET revision=$2,history=$3,updated_at=now()",[matchId,revision,history]);return history;
}
export function presentationRoutes(app:FastifyInstance,pool:DB,auth:Authentication,config:BackendConfig){
 app.get("/api/preferences/presentation",async req=>readPresentation(pool,(await auth.actor(req)).id));
 const preferences=z.object({schema:z.literal(1),mode:z.enum(PRESENTATION_MODES),cardMovement:z.boolean(),abilityAnimations:z.boolean(),scoreAnimations:z.boolean(),highlighting:z.boolean(),descriptions:z.boolean()}).strict();
 app.put("/api/preferences/presentation",async req=>{
  const actor=await auth.actor(req),body=z.object({revision:z.number().int().min(0),preferences}).strict().parse(req.body);
  await rateLimit(pool,"presentation-settings:"+keyed(actor.id,config),30,60);
  return transaction(pool,async c=>{
   await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[actor.id]);const previous=await readPresentation(c,actor.id);
   if(previous.revision!==body.revision)reject(409,"stale_preferences","Presentation settings changed on another device. Reload before saving.");
   const revision=previous.revision+1;await c.query("INSERT INTO kd.player_presentation(player_id,revision,preferences) VALUES($1,$2,$3) ON CONFLICT(player_id) DO UPDATE SET revision=$2,preferences=$3,updated_at=now()",[actor.id,revision,body.preferences]);return {revision,preferences:body.preferences};
  });
 });
}
