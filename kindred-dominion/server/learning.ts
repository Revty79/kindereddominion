import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {DB} from "./db";
import {transaction} from "./db";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import {rateLimit} from "./security";
import {reject} from "./errors";
import {activityEconomy} from "./economy";
import {DEFAULT_LEARNING,LESSON_IDS,LEARNING_DESTINATIONS,type LearningProgress} from "../src/player/learning-model";

export async function readLearning(db:DB|Parameters<Parameters<typeof transaction>[1]>[0],playerId:string){
 const row=(await db.query("SELECT revision,progress FROM kd.player_learning WHERE player_id=$1",[playerId])).rows[0];
 return {revision:row?.revision??0,progress:row?.progress??structuredClone(DEFAULT_LEARNING)} as {revision:number;progress:LearningProgress};
}
export function learningRoutes(app:FastifyInstance,pool:DB,auth:Authentication,config:BackendConfig){
 app.get("/api/learning",async req=>readLearning(pool,(await auth.actor(req)).id));
 const action=z.discriminatedUnion("action",[
  z.object({action:z.enum(["visit","complete"]),lesson:z.enum(LESSON_IDS)}).strict(),
  z.object({action:z.literal("explore"),destination:z.enum(LEARNING_DESTINATIONS)}).strict(),
  z.object({action:z.enum(["skip","resume"])}).strict()
 ]);
 app.put("/api/learning",async req=>{
  const actor=await auth.actor(req),body=z.object({revision:z.number().int().min(0),change:action}).strict().parse(req.body);
  await rateLimit(pool,"learning:"+actor.id,90,60);
  return transaction(pool,async c=>{
   await c.query("SELECT id FROM kd.player WHERE id=$1 FOR UPDATE",[actor.id]);
   const old=await readLearning(c,actor.id);if(old.revision!==body.revision)reject(409,"stale_learning","Your guide changed on another device. Reload it before continuing.");
   const progress=structuredClone(old.progress),change=body.change;
   if(change.action==="visit"||change.action==="complete"){
    progress.lesson=change.lesson;
    if(change.action==="complete"){if(!progress.completed.includes(change.lesson))progress.completed.push(change.lesson);progress.lesson=LESSON_IDS[Math.min(LESSON_IDS.indexOf(change.lesson)+1,LESSON_IDS.length-1)];}
   }else if(change.action==="explore"){
    if(!progress.visited.includes(change.destination))progress.visited.push(change.destination);
   }else progress.dismissed=change.action==="skip";
   if(change.action==="complete"&&change.lesson==="next-steps")await activityEconomy(c,actor.id,"guide_viewed","guide-v1",config);
   if(JSON.stringify(progress)===JSON.stringify(old.progress))return old;
   const revision=old.revision+1;
   await c.query("INSERT INTO kd.player_learning(player_id,revision,progress) VALUES($1,$2,$3) ON CONFLICT(player_id) DO UPDATE SET revision=$2,progress=$3,updated_at=now()",[actor.id,revision,progress]);
   // This acknowledges the existing guide only. Skill, deck and eligible-match
   // evidence remain authoritative; practice cannot submit match/reward events.
   return {revision,progress};
  });
 });
}
