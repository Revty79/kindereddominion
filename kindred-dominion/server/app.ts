import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import {ZodError} from "zod";
import type {BackendConfig} from "./config";
import {database,readiness,type DB} from "./db";
import {authentication} from "./auth";
import {playerRoutes} from "./player-routes";
import {matchRoutes} from "./matches";
import {studioRoutes} from "./studio-routes";
import {controlRoot,controlRoutes} from "./control-app";
import {administrationRoutes} from "./administration";
import {identityRoutes} from "./identity";
import {acquisitionRoutes} from "./acquisition";
import {ApiError} from "./errors";
import {keyed,rateLimit} from "./security";
import {configurationRoutes} from "./configuration";
import {economyRoutes} from "./economy-routes";
import {registerShopPublication} from "./shop-publication";
import {registerShopRewards} from "./shop-purchases";
import {cosmeticRoutes} from "./shop-appearance";
import {shopRoutes} from "./shop-routes";
export async function createApi(config:BackendConfig,suppliedPool?:DB){
  registerShopPublication();registerShopRewards();
  const pool=suppliedPool??database(config),app=Fastify({logger:false,bodyLimit:256*1024,trustProxy:false,requestTimeout:30000,connectionTimeout:10000});
  await app.register(cookie);await app.register(cors,{origin:config.origin,credentials:true,methods:["GET","POST","PUT","PATCH","DELETE"],allowedHeaders:["Content-Type","X-CSRF-Token"]});
  app.addHook("onRequest",async(req,reply)=>{
    reply.header("Cache-Control","no-store").header("X-Content-Type-Options","nosniff");
    if(req.url.startsWith("/api/")&&req.method!=="OPTIONS")await rateLimit(pool,"api:"+keyed(req.ip,config),600,60);
  });
  app.addHook("onResponse",async(req,reply)=>{if(config.logLevel==="info")console.log(JSON.stringify({requestId:req.id,method:req.method,route:req.routeOptions.url??"unmatched",status:reply.statusCode}));});
  app.setErrorHandler((error,req,reply)=>{
    if(error instanceof ApiError)return reply.code(error.status).send({error:{code:error.code,message:error.message},requestId:req.id});
    if(error instanceof ZodError)return reply.code(400).send({error:{code:"invalid_input",message:"Request fields are missing, invalid or unsupported."},requestId:req.id});
    const code=(error as any).code;
    if(code==="23505")return reply.code(409).send({error:{code:"conflict",message:"This identity or operation already exists."},requestId:req.id});
    if(code==="23514"||code==="23503"||code==="22P02")return reply.code(400).send({error:{code:"integrity_rejected",message:"The request conflicts with stored data constraints."},requestId:req.id});
    const status=(error as any).statusCode;
    if([400,413,415].includes(status))return reply.code(status).send({error:{code:"request_rejected",message:status===413?"Request exceeds the supported size limit.":"Request format was not accepted."},requestId:req.id});
    console.error(JSON.stringify({event:"request-failed",requestId:req.id}));
    return reply.code(500).send({error:{code:"internal_error",message:"The operation could not complete. No partial change was accepted."},requestId:req.id});
  });
  app.get("/healthz",async()=>({status:"alive"}));
  app.get("/readyz",async(_,reply)=>{try{await readiness(pool,config);return {status:"ready",database:"connected",catalog:"available"};}catch{return reply.code(503).send({status:"not-ready"});}});
  const root=await controlRoot(config.controlDirectory);
  if(["test","prod"].includes(config.environment)&&!root)throw Error("Hosted backend requires the protected control application build.");
  const auth=authentication(app,pool,config,!!root);controlRoutes(app,auth,root);administrationRoutes(app,pool,config,auth);configurationRoutes(app,pool,config,auth);economyRoutes(app,pool,config,auth);shopRoutes(app,pool,config,auth);cosmeticRoutes(app,pool,config,auth);identityRoutes(app,pool,config,auth);acquisitionRoutes(app,pool,config,auth);playerRoutes(app,pool,auth,config);matchRoutes(app,pool,auth,config);studioRoutes(app,pool,auth);
  if(!suppliedPool)app.addHook("onClose",()=>pool.end());return app;
}
