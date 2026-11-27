import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {project} from "./tooling.mjs";
for(const args of [["scripts/validate-assets.mjs"],["node_modules/typescript/bin/tsc","--noEmit"],["node_modules/vite/bin/vite.js","build","--outDir","dist-control"]]){
  const result=spawnSync(process.execPath,args,{cwd:project,env:{...process.env,VITE_STUDIO:"1",VITE_CONTROL:"1"},stdio:"inherit"});if(result.status!==0)process.exit(result.status??1);
}
await fs.rename(path.join(project,"dist-control/control.html"),path.join(project,"dist-control/index.html"));
const files=[];async function walk(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())await walk(file);else files.push(file);}}await walk(path.join(project,"dist-control"));
if(files.some(file=>file.endsWith(".map")||file.includes("artwork-source")))throw Error("Protected build unexpectedly contains source files.");
const manifest={format:"kindred-protected-control",schema:1,version:JSON.parse(await fs.readFile(path.join(project,"package.json"),"utf8")).version,access:["developer","administrator"],files:await Promise.all(files.map(async file=>({path:path.relative(path.join(project,"dist-control"),file).replaceAll("\\","/"),sha256:crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex")})))};
await fs.writeFile(path.join(project,"dist-control/control-manifest.json"),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({protectedControlBuilt:true,files:files.length,servedOnlyThrough:"/api/control/",sourceMastersIncluded:false}));
