// Existing compiled schema-seven API only, on a registered disposable database.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import {parseEnv} from "node:util";
import {spawn,execFileSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,".."),input=process.argv[2],local=path.join(root,".local");
if(!input||!path.resolve(input).startsWith(local+path.sep))throw Error("Use a private disposable environment file in .local");
const settings=parseEnv(fs.readFileSync(input,"utf8")),instance=JSON.parse(fs.readFileSync(path.join(local,"v1.3d/postgres/instance.json"),"utf8"));
if(settings.APP_ENV!=="integration"||settings.PGHOST!=="127.0.0.1"||Number(settings.PGPORT)===5432||Number(settings.PGPORT)!==instance.port||!instance.testDatabases.includes(settings.PGDATABASE)||settings.ISOLATION_TOKEN!==instance.instanceId)throw Error("Refusing a target outside the owned disposable cluster");
const folder=path.join(local,"v1.5c/baseline"),tag=crypto.randomBytes(4).toString("hex"),password=crypto.randomBytes(30).toString("base64url");fs.mkdirSync(folder,{recursive:true});
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const n=s.address().port;s.close(()=>resolve(n));});});
const envFile=path.join(folder,"api.env"),env={...settings,API_PORT:String(port),LOG_LEVEL:"silent"};fs.writeFileSync(envFile,Object.entries(env).map(([k,v])=>k+"="+JSON.stringify(v)).join("\n")+"\n",{mode:0o600});
const childEnv={...process.env,KINDRED_ENV_FILE:envFile},status=JSON.parse(execFileSync(process.execPath,["server-dist/cli.mjs","status"],{cwd:root,env:childEnv,encoding:"utf8",windowsHide:true}));
if(status.applied!==7||status.pending.length)throw Error("Use the preserved compiled schema-seven baseline before rebuilding");
const log=fs.openSync(path.join(folder,"api.private.log"),"a"),server=spawn(process.execPath,["server-dist/index.mjs"],{cwd:root,env:childEnv,windowsHide:true,stdio:["ignore",log,log]});
try{
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(`http://127.0.0.1:${port}/readyz`)).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error("Owned baseline API did not become ready");
 const accounts=[];
 for(const kindred of ["Nature","Mythical","Arcane","Undead","Constructs"]){
  let cookie="",csrf="";const username=`legacy_${tag}_${kindred.toLowerCase()}`;
  const request=async(method,url,payload)=>{const response=await fetch(`http://127.0.0.1:${port}/api${url}`,{method,headers:{origin:settings.FRONTEND_ORIGIN,cookie,"x-csrf-token":csrf,...(payload?{"content-type":"application/json"}:{})},...(payload?{body:JSON.stringify(payload)}:{})});const set=response.headers.get("set-cookie");if(set)cookie=set.split(";")[0];const value=await response.json();if(value.csrf)csrf=value.csrf;if(!response.ok)throw Error(`Baseline API ${url} returned ${response.status}: ${value.error?.code}`);return value;};
  await request("GET","/session");const {player}=await request("POST","/accounts",{username,email:username+"@example.test",password,displayName:"Preserved "+kindred});
  const starter=await request("POST","/starting-collection",{kindred,idempotencyKey:crypto.randomUUID()});
  if((await request("GET","/collection")).inventory.length!==30)throw Error("Baseline starter collection mismatch");
  let match=await request("POST","/matches",{deckId:starter.deckId});for(let i=0;i<120&&match.status!=="finished";i++)match=await request("POST",`/matches/${match.id}/actions`,{revision:match.revision,requestId:crypto.randomUUID(),action:match.status==="mulligan"?{type:"mulligan",cards:[]}:match.legalActions[0]??{type:"pass"}});
  if(match.status!=="finished")throw Error("Baseline authoritative match did not finish");
  accounts.push({id:player.id,username,kindred,deckId:starter.deckId,matchId:match.id});
 }
 const administrator=accounts[0];execFileSync(process.execPath,["server-dist/cli.mjs","role","--username="+administrator.username,"--confirm-user="+administrator.username,"--role=administrator"],{cwd:root,env:childEnv,windowsHide:true,stdio:["ignore","pipe","pipe"]});
 const result={database:settings.PGDATABASE,port:instance.port,schema:7,accounts,allFiveStartersVerified:true,fiveNormalMatchesCompleted:true,administratorPreserved:true,ownerDevTouched:false,hostedTestTouched:false};fs.writeFileSync(path.join(folder,"legacy-fixture.json"),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}finally{server.kill();await new Promise(resolve=>server.once("exit",resolve));fs.closeSync(log);}
