import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {DB} from "./db";
import {transaction} from "./db";
import type {BackendConfig} from "./config";
import type {Authentication} from "./auth";
import {uuid,operationKey} from "./auth";
import {portable} from "./economy-rules";
import {tradeItems} from "./trading-rules";
import {rateLimit} from "./security";
import {tradingPolicy} from "./trading-inventory";
import {createTrade} from "./trades";
import {sweepTrades} from "./trade-support";
import {listingInput,wishInput,hallQuery,saveListing,closeListing,saveWish,browseListings,browseWishes,matchingSuggestions,availableCard} from "./trading-hall";
import {reject} from "./errors";
export function tradingHallRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 const writing=async(req:any)=>{const actor=await auth.actor(req);await rateLimit(pool,"trading-write:"+actor.id,60,60);return actor;};
 app.get("/api/trading/listings",async req=>browseListings(pool,(await auth.actor(req)).id,hallQuery.parse(req.query),config));
 app.get("/api/trading/listings/mine",async req=>browseListings(pool,(await auth.actor(req)).id,hallQuery.parse(req.query),config,true));
 app.post("/api/trading/listings",async req=>{const actor=await writing(req),body=listingInput.extend({idempotencyKey:operationKey}).strict().parse(req.body);return transaction(pool,c=>saveListing(c,actor.id,body.idempotencyKey,body,config));});
 app.put<{Params:{id:string}}>("/api/trading/listings/:id",async req=>{const actor=await writing(req),id=uuid.parse(req.params.id),body=listingInput.extend({revision:z.number().int().positive(),idempotencyKey:operationKey}).strict().parse(req.body);return transaction(pool,c=>saveListing(c,actor.id,body.idempotencyKey,body,config,{id,revision:body.revision}));});
 app.post<{Params:{id:string}}>("/api/trading/listings/:id/close",async req=>{const actor=await writing(req),id=uuid.parse(req.params.id),body=z.object({revision:z.number().int().positive(),idempotencyKey:operationKey}).strict().parse(req.body);return transaction(pool,c=>closeListing(c,actor.id,id,body.revision,body.idempotencyKey,config));});
 app.post<{Params:{id:string}}>("/api/trading/listings/:id/offers",async req=>{const actor=await writing(req),id=uuid.parse(req.params.id),body=z.object({listingRevision:z.number().int().positive(),offered:tradeItems,requestedQuantity:z.number().int().min(1).max(1000),expiryHours:z.number().int().min(1).max(720).optional(),draft:z.boolean().default(false),idempotencyKey:operationKey}).strict().parse(req.body),listing=(await pool.query("SELECT player_id,card_id FROM kd.trading_listing WHERE id=$1",[id])).rows[0];if(!listing)reject(404,"listing_missing","This listing was not found.");await sweepTrades(pool,actor.id,20);return transaction(pool,c=>createTrade(c,actor.id,{recipientId:listing.player_id,offered:body.offered,requested:[{cardId:listing.card_id,quantity:body.requestedQuantity}],expiryHours:body.expiryHours,draft:body.draft},body.idempotencyKey,config,{listingId:id,listingRevision:body.listingRevision,validate:async current=>{const row=(await current.query("SELECT * FROM kd.trading_listing WHERE id=$1 FOR SHARE",[id])).rows[0];if(row.status!=="active")reject(409,"listing_closed","This public interest listing is closed. Review other current listings.");if(row.revision!==body.listingRevision)reject(409,"stale_listing","This listing changed. Review its current details before submitting an offer.");const policy=await tradingPolicy(current,config);if(body.requestedQuantity>row.quantity||await availableCard(current,row.player_id,row.card_id,policy.rules)<body.requestedQuantity)reject(409,"listing_inventory_unavailable","The requested listed copies are no longer currently available. No offered copies were reserved.");return {id,revision:row.revision,ownerId:row.player_id,cardId:row.card_id,listedQuantity:row.quantity,wanted:row.wanted,nonbinding:true};}}));});
 app.get("/api/trading/wishes",async req=>browseWishes(pool,(await auth.actor(req)).id,hallQuery.parse(req.query),config,true));
 app.get("/api/trading/wishes/public",async req=>browseWishes(pool,(await auth.actor(req)).id,hallQuery.parse(req.query),config));
 app.put<{Params:{cardId:string}}>("/api/trading/wishes/:cardId",async req=>{const actor=await writing(req),id=portable.parse(req.params.cardId),body=wishInput.extend({idempotencyKey:operationKey}).strict().parse(req.body);return transaction(pool,c=>saveWish(c,actor.id,id,body.idempotencyKey,body,config));});
 app.get("/api/trading/suggestions",async req=>matchingSuggestions(pool,(await auth.actor(req)).id,config));
 app.get("/api/trading/players",async req=>{const actor=await auth.actor(req),query=z.object({q:z.string().trim().min(2).max(80),page:z.coerce.number().int().min(0).max(10000).default(0)}).strict().parse(req.query);await rateLimit(pool,"trading-player-search:"+actor.id,30,60);const rows=(await pool.query("SELECT p.id,p.username,p.display_name AS \"displayName\" FROM kd.player p LEFT JOIN kd.economy_account e ON e.player_id=p.id WHERE p.id<>$1 AND p.status='active' AND NOT coalesce(e.sandbox,false) AND strpos(lower(p.username||' '||p.display_name),lower($2))>0 AND NOT EXISTS(SELECT 1 FROM kd.trading_block b WHERE(b.blocker_id=$1 AND b.blocked_id=p.id) OR(b.blocker_id=p.id AND b.blocked_id=$1)) ORDER BY p.username,p.id LIMIT 21 OFFSET $3",[actor.id,query.q,query.page*20])).rows;return {players:rows.slice(0,20),hasMore:rows.length>20,page:query.page};});
}
