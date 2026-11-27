import {lockPlayer} from "./economy-assets";
import crypto from "node:crypto";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {DB} from "./db";
import {transaction} from "./db";
import type {Authentication} from "./auth";
import {uuid} from "./auth";
import {reject} from "./errors";
import {projectCommerceNotifications} from "./commerce-fulfillment";
// trade_event is the durable outbox. Projection never participates in asset settlement.
export async function projectNotifications(pool:DB,playerId:string){return transaction(pool,async c=>{
 await c.query("SET LOCAL lock_timeout='500ms'");await lockPlayer(c,playerId);
 const events=(await c.query(`SELECT e.*,v.sequence FROM kd.trade_event e JOIN kd.trade_offer_version v ON v.id=e.version_id
 WHERE (v.author_id=$1 OR v.recipient_id=$1) AND(v.consented_at IS NOT NULL OR v.author_id=$1)
 AND ((e.type IN('submitted','countered','cancelled') AND v.recipient_id=$1 AND v.consented_at IS NOT NULL)
 OR(e.type IN('accepted','declined') AND v.author_id=$1)
 OR(e.type IN('expired','invalidated','settled') AND(v.consented_at IS NOT NULL OR v.author_id=$1)))
 AND NOT EXISTS(SELECT 1 FROM kd.player_notification n WHERE n.player_id=$1 AND n.trade_event_id=e.id)
 ORDER BY e.created_at,v.sequence,e.id LIMIT 100`,[playerId])).rows;
 for(const event of events){const title:Record<string,string>={submitted:"New trade offer",countered:"Trade counteroffer",accepted:"Trade accepted",declined:"Trade declined",cancelled:"Trade cancelled",expired:"Trade expired",invalidated:"Trade unavailable",settled:"Trade completed"};
  await c.query("INSERT INTO kd.player_notification(id,player_id,trade_event_id,offer_id,version_id,kind,title,body,version_sequence,event_rank,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(player_id,trade_event_id) DO NOTHING",[crypto.randomUUID(),playerId,event.id,event.offer_id,event.version_id,event.type,title[event.type],event.type==="settled"?"The exact agreed cards were exchanged. View the permanent trade receipt.":"Open the trade to review its exact version and current status.",event.sequence,event.type==="accepted"?2:event.type==="settled"?3:["submitted","countered"].includes(event.type)?1:4,event.created_at]);
 }return events.length;
});}
export async function deliverTradeNotifications(pool:DB,offerId:string){try{const head=(await pool.query("SELECT player_a,player_b FROM kd.trade_offer WHERE id=$1",[offerId])).rows[0];if(head)await Promise.allSettled([head.player_a,head.player_b].map(id=>projectNotifications(pool,id)));}catch{/* The durable event outbox is retried by each private inbox read. */}}
export function notificationRoutes(app:FastifyInstance,pool:DB,auth:Authentication){
 app.get("/api/notifications",async req=>{const actor=await auth.actor(req),query=z.object({page:z.coerce.number().int().min(0).max(10000).default(0)}).strict().parse(req.query);let deliveryPending=false;try{deliveryPending=await projectNotifications(pool,actor.id)===100;}catch{deliveryPending=true;}
 try{await projectCommerceNotifications(pool,actor.id);}catch{deliveryPending=true;}
 const rows=(await pool.query(`SELECT * FROM(SELECT id,kind,title,body,offer_id AS "offerId",version_id AS "versionId",NULL::uuid AS "orderId",created_at AS "createdAt",read_at AS "readAt",version_sequence,event_rank FROM kd.player_notification WHERE player_id=$1
 UNION ALL SELECT id,kind,title,body,NULL::uuid,NULL::uuid,order_id,created_at,read_at,0,0 FROM kd.commerce_notification WHERE player_id=$1) n ORDER BY "createdAt" DESC,version_sequence DESC,event_rank DESC,id LIMIT 31 OFFSET $2`,[actor.id,query.page*30])).rows;
 return {notifications:rows.slice(0,30),page:query.page,hasMore:rows.length>30,unreadCount:Number((await pool.query("SELECT(SELECT count(*) FROM kd.player_notification WHERE player_id=$1 AND read_at IS NULL)+(SELECT count(*) FROM kd.commerce_notification WHERE player_id=$1 AND read_at IS NULL) AS count",[actor.id])).rows[0].count),deliveryPending};});
 app.post<{Params:{id:string}}>("/api/notifications/:id/read",async req=>{const actor=await auth.actor(req),id=uuid.parse(req.params.id);z.object({}).strict().parse(req.body);const result=await pool.query("UPDATE kd.player_notification SET read_at=coalesce(read_at,now()) WHERE id=$1 AND player_id=$2 RETURNING id,read_at",[id,actor.id]);const commerce=result.rowCount?null:await pool.query("UPDATE kd.commerce_notification SET read_at=coalesce(read_at,now()) WHERE id=$1 AND player_id=$2 RETURNING id,read_at",[id,actor.id]);if(!result.rowCount&&!commerce?.rowCount)reject(404,"notification_missing","This account's notification was not found.");return {id,readAt:(result.rows[0]??commerce!.rows[0]).read_at};});
 app.post("/api/notifications/read-all",async req=>{const actor=await auth.actor(req);z.object({}).strict().parse(req.body);await pool.query("UPDATE kd.player_notification SET read_at=now() WHERE player_id=$1 AND read_at IS NULL",[actor.id]);await pool.query("UPDATE kd.commerce_notification SET read_at=now() WHERE player_id=$1 AND read_at IS NULL",[actor.id]);return {saved:true};});
}
