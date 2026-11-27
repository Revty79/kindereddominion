import {spawn,type ChildProcess} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
// These processes are created and stopped only by this explicitly enabled test.
export function releaseServices(apiPort:number,frontendPort:number){
  const root=path.resolve(process.env.KINDRED_RELEASE_APP??"."),children:ChildProcess[]=[];
  async function free(port:number){await new Promise<void>((resolve,reject)=>{const server=net.createServer();server.once("error",()=>reject(Error(`Acceptance port ${port} is already occupied; no process was stopped.`)));server.listen(port,"127.0.0.1",()=>server.close(()=>resolve()));});}
  async function ready(url:string){for(let n=0;n<150;n++){if(children.some(child=>child.exitCode!==null))throw Error("Owned release process exited; inspect private release log.");try{if((await fetch(url)).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error("Compiled release did not become ready.");}
  function launch(args:string[],extra:Record<string,string>={}){const log=fs.openSync(`.local/v1.4/release-${children.length}.log`,"a"),child=spawn(process.execPath,args,{cwd:process.cwd(),env:{...process.env,...extra},windowsHide:true,stdio:["ignore",log,log]});fs.closeSync(log);children.push(child);}
  async function stop(){for(const child of children.splice(0)){if(child.exitCode!==null)continue;await new Promise<void>(resolve=>{child.once("exit",()=>resolve());child.kill();});}}
  async function start(){await free(apiPort);await free(frontendPort);launch([path.join(root,"server-dist/index.mjs")]);await ready(`http://127.0.0.1:${apiPort}/readyz`);launch([path.join(root,"node_modules/vite/bin/vite.js"),"preview","--config",path.join(root,"vite.config.ts"),"--outDir",path.join(root,"dist-player"),"--host","127.0.0.1","--port",String(frontendPort),"--strictPort"],{KINDRED_API_TARGET:`http://127.0.0.1:${apiPort}`});await ready(`http://127.0.0.1:${frontendPort}`);}
  return {start,stop,restart:async()=>{await stop();await start();}};
}
