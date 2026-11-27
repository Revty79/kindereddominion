import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {DB} from "./db";
import {transaction} from "./db";
import type {BackendConfig} from "./config";
import type {Authentication} from "./auth";
import {uuid,operationKey} from "./auth";
import {portable} from "./economy-rules";
import {commerceSchema} from "./commerce-rules";
import {selectedConfiguration} from "./configuration";
import {createCommerceQuote,createCommerceOrder,publicCommerceSnapshot} from "./commerce-orders";
import {rateLimit} from "./security";
import {reject} from "./errors";
export function commerceRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 app.get("/api/commerce",async req=>{const a=await auth.actor(req),selected=await selectedConfiguration(pool,"commerce"),rules=selected?commerceSchema.parse(selected.document):null,account=(await pool.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[a.id])).rows[0];return {testMode:true,realMoneyEnabled:false,mode:config.commerceMode,available:config.economyEnabled&&config.commerceMode==="simulation"&&!!rules?.enabled&&!!account?.sandbox,requiresSandboxAccount:!account?.sandbox,configVersion:selected?.id??null,products:rules?.products.filter(p=>p.enabled&&p.status==="published")??[],notice:"All displayed commercial amounts are provisional sandbox USD amounts. No real money is accepted; simulation totals are not revenue."};});
 app.post("/api/commerce/quotes",async req=>{const a=await auth.actor(req),b=z.object({productId:portable}).strict().parse(req.body);await rateLimit(pool,"commerce-write:"+a.id,30,60);return transaction(pool,c=>createCommerceQuote(c,a.id,b.productId,config));});
 app.post("/api/commerce/orders",async req=>{const a=await auth.actor(req),b=z.object({quoteId:uuid,idempotencyKey:operationKey}).strict().parse(req.body);await rateLimit(pool,"commerce-write:"+a.id,30,60);return transaction(pool,c=>createCommerceOrder(c,a.id,b.quoteId,b.idempotencyKey,config));});
 app.get("/api/commerce/orders",async req=>{const a=await auth.actor(req),q=z.object({page:z.coerce.number().int().min(0).max(10000).default(0)}).strict().parse(req.query),rows=(await pool.query("SELECT id,product_id,amount_minor,currency,provider,sandbox,checkout_state,payment_state,fulfillment_state,refunded_minor,dispute_state,created_at,updated_at FROM kd.commerce_order WHERE player_id=$1 ORDER BY created_at DESC,id LIMIT 31 OFFSET $2",[a.id,q.page*30])).rows;return {orders:rows.slice(0,30),hasMore:rows.length>30,page:q.page,testMode:true,realRevenue:false};});
 app.get<{Params:{id:string}}>("/api/commerce/orders/:id",async req=>{const a=await auth.actor(req),id=uuid.parse(req.params.id),row=(await pool.query("SELECT id,product_id,config_version,amount_minor,currency,provider,sandbox,snapshot,checkout_state,payment_state,fulfillment_state,checkout_url,checkout_session_id,payment_id,receipt_url,refunded_minor,dispute_state,error_code,created_at,updated_at FROM kd.commerce_order WHERE id=$1 AND player_id=$2",[id,a.id])).rows[0];if(!row)reject(404,"commercial_order_missing","This account's order was not found.");row.snapshot=publicCommerceSnapshot(row.snapshot);return {order:row,testMode:true,realRevenue:false};});
}
