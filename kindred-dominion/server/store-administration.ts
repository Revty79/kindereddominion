import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import type {DB} from "./db";
import {transaction} from "./db";
import type {BackendConfig} from "./config";
import {selectedConfiguration,requireEconomy} from "./configuration";
import {shopSchema,DEFAULT_SHOP} from "./shop-rules";
import {commerceSchema,DEFAULT_COMMERCE} from "./commerce-rules";
import {economySchema,DEFAULT_ECONOMY} from "./economy-rules";
import {starterSchema,DEFAULT_STARTERS} from "./starter-rules";
import {financialModelSchema} from "./commercial-model";
import {DEFAULT_STORE_MODEL,storeModelSchema} from "./store-model-settings";
import {completeStoreModel} from "./store-model";
import {shopDiagnostics} from "./shop-diagnostics";
import {storeReport} from "./store-report";
import {activeContent} from "./catalog";
import {rateLimit} from "./security";
export function storeAdministration(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 const admin=async(req:any)=>{const actor=await auth.actor(req,["administrator"]);if(req.method!=="GET")await rateLimit(pool,"store-analysis:"+actor.id,20,60);return actor;};
 app.post("/api/admin/shop/analysis",async req=>{await admin(req);requireEconomy(config);const body=z.object({document:z.unknown(),productId:z.string().min(1).max(180).optional(),playerId:z.string().uuid().optional(),seed:z.number().int().min(0).max(4294967295).default(16878),samples:z.number().int().min(1).max(200).default(20)}).strict().parse(req.body);return transaction(pool,async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return shopDiagnostics(c,body.document,config,body);});});
 app.post("/api/admin/store/model",async req=>{await admin(req);requireEconomy(config);const body=z.object({shop:z.unknown().optional(),settings:storeModelSchema.optional(),finance:financialModelSchema.optional()}).strict().parse(req.body);return transaction(pool,async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");const shop=await selectedConfiguration(c,"shop"),economy=await selectedConfiguration(c,"economy"),commerce=await selectedConfiguration(c,"commerce"),starters=await selectedConfiguration(c,"starters"),pack=await activeContent(c),commerceRules=commerceSchema.parse(commerce?.document??DEFAULT_COMMERCE);return {versions:{shop:shop?.id??null,economy:economy?.id??null,commerce:commerce?.id??null,starters:starters?.id??null},...completeStoreModel({pack,shop:shopSchema.parse(body.shop??shop?.document??DEFAULT_SHOP),economy:economySchema.parse(economy?.document??DEFAULT_ECONOMY),commerce:commerceRules,starters:starterSchema.parse(starters?.document??DEFAULT_STARTERS),settings:body.settings??commerceRules.storeModel??DEFAULT_STORE_MODEL,finance:body.finance??commerceRules.financialModel})};});});
 app.get("/api/admin/store/report",async req=>{await admin(req);return transaction(pool,async c=>{await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");return storeReport(c,req.query);});});
}
