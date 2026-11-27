import fs from "node:fs/promises";
import path from "node:path";
import {createReadStream} from "node:fs";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import {reject} from "./errors";
const types:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp",".woff2":"font/woff2"};
export async function controlRoot(directory:string){
  try{const root=await fs.realpath(directory),manifest=JSON.parse(await fs.readFile(path.join(root,"control-manifest.json"),"utf8"));if(manifest.format!=="kindred-protected-control"||manifest.schema!==1)return null;await fs.access(path.join(root,"index.html"));return root;}catch{return null;}
}
export function controlRoutes(app:FastifyInstance,auth:Authentication,root:string|null){
  const serve=async(req:any,reply:any)=>{
    await auth.actor(req,["developer","administrator"]);
    if(!root)reject(503,"control_unavailable","Build and install the protected control application first.");
    const relative=req.params["*"]||"index.html";
    if(!/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(relative)||relative.split("/").some((part:string)=>part==="..")||!types[path.extname(relative)])reject(404,"control_file_missing","Control application resource was not found.");
    let file:string;try{file=await fs.realpath(path.join(root!,relative));if(!file.startsWith(root!+path.sep))throw Error();const info=await fs.stat(file);if(!info.isFile())throw Error();}catch{reject(404,"control_file_missing","Control application resource was not found.");}
    reply.header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    reply.header("Referrer-Policy","no-referrer").type(types[path.extname(file!)]);
    return reply.send(createReadStream(file!));
  };
  app.get("/api/control",async(req,reply)=>{await auth.actor(req,["developer","administrator"]);return reply.redirect("/api/control/");});
  app.get("/api/control/",serve);app.get("/api/control/*",serve);
}
