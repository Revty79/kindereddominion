import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root=path.resolve(import.meta.dirname,".."), dir=path.join(root,".local/v1.3d/postgres"), manifest=path.join(dir,"instance.json");
const pgBin=process.env.PG_BIN??(process.platform==="win32"?"C:/Program Files/PostgreSQL/18/bin":"/usr/lib/postgresql/18/bin");
const exe=name=>path.join(pgBin,name+(process.platform==="win32"?".exe":""));
const run=(name,args,env={})=>{try{return execFileSync(exe(name),args,{env:{...process.env,...env},encoding:"utf8",windowsHide:true,timeout:120000,stdio:name==="pg_ctl"?"ignore":["ignore","pipe","pipe"]});}catch{throw Error(`Isolated PostgreSQL ${name} failed; inspect its private log. No credentials printed.`);}};
fs.mkdirSync(dir,{recursive:true});
const command=process.argv[2]??"start";
if(command==="create-db"){
  const m=JSON.parse(fs.readFileSync(manifest,"utf8"));
  if(m.host!=="127.0.0.1"||m.port===5432||path.resolve(m.data)!==path.join(dir,"data"))throw Error("Owned disposable instance verification failed");
  const password=fs.readFileSync(path.join(dir,"password.private"),"utf8").trim(),name="kd_test_"+crypto.randomBytes(8).toString("hex");
  run("createdb",["--owner=kindred_test",name],{PGHOST:m.host,PGPORT:String(m.port),PGUSER:"kd_isolation_admin",PGPASSWORD:password,PGDATABASE:"postgres"});
  m.testDatabases=[...(m.testDatabases??[]),name];fs.writeFileSync(manifest,JSON.stringify(m,null,2));
  const envFile=`.local/v1.3d/${name}.env`,contents=fs.readFileSync(path.join(root,".local/v1.3d/integration.env"),"utf8").replace(/^PGDATABASE=.*$/m,`PGDATABASE=${name}`);
  fs.writeFileSync(path.join(root,envFile),contents,{mode:0o600});console.log(JSON.stringify({database:name,environmentFile:envFile,createdEmpty:true}));
}else if(command==="stop"){
  if(!fs.existsSync(manifest))throw Error("No owned isolated instance manifest");
  const m=JSON.parse(fs.readFileSync(manifest,"utf8"));
  if(path.resolve(m.data)!==path.join(dir,"data")||!m.instanceId)throw Error("Isolation path verification failed");
  run("pg_ctl",["-D",m.data,"-m","fast","-w","stop"]);console.log("Stopped only the recorded isolated Kindred PostgreSQL instance.");
}else if(command==="start"||command==="resume"){
  if(fs.existsSync(manifest)&&command!=="resume")throw Error("Isolation already exists. Use resume; this command never resets an existing cluster.");
  if(command==="resume"&&!fs.existsSync(manifest))throw Error("No recorded isolated cluster to resume.");
  const existing=command==="resume"?JSON.parse(fs.readFileSync(manifest,"utf8")):null;
  if(existing&&path.resolve(existing.data)!==path.join(dir,"data"))throw Error("Isolation path verification failed");
  const port=existing?.port??await new Promise(resolve=>{const server=net.createServer();server.listen(0,"127.0.0.1",()=>{const p=server.address().port;server.close(()=>resolve(p));});});
  const passwordFile=path.join(dir,"password.private"),password=existing?fs.readFileSync(passwordFile,"utf8").trim():crypto.randomBytes(36).toString("base64url"),instanceId=existing?.instanceId??crypto.randomUUID(),data=path.join(dir,"data");
  if(!existing){fs.writeFileSync(passwordFile,password+"\n",{mode:0o600});
  run("initdb",["-D",data,"-U","kd_isolation_admin","--auth-host=scram-sha-256","--auth-local=scram-sha-256","--pwfile="+passwordFile,"--encoding=UTF8","--locale=C"]);}
  fs.writeFileSync(manifest,JSON.stringify({...existing,instanceId,data,port,host:"127.0.0.1",database:"kd_integration",owner:os.userInfo().username,pgBin,createdAt:existing?.createdAt??new Date().toISOString()},null,2));
  let running=false;try{run("pg_ctl",["-D",data,"status"]);running=true;}catch{}
  if(!running)run("pg_ctl",["-D",data,"-l",path.join(dir,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);
  const pgEnv={PGHOST:"127.0.0.1",PGPORT:String(port),PGUSER:"kd_isolation_admin",PGPASSWORD:password,PGDATABASE:"postgres"};
  // All names are fixed and password is locally generated URL-safe text, not user SQL.
  const initFile=path.join(dir,"initialize.private.sql");
  fs.writeFileSync(initFile,`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='kindred_test') THEN CREATE ROLE kindred_test LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$;`,{mode:0o600});
  run("psql",["-X","-v","ON_ERROR_STOP=1","-f",initFile],pgEnv);
  const exists=run("psql",["-X","-t","-A","-c","SELECT 1 FROM pg_database WHERE datname='kd_integration'"],pgEnv).trim();
  if(exists!=="1")run("createdb",["--owner=kindred_test","kd_integration"],pgEnv);
  const config=`APP_ENV=integration\nPGHOST=127.0.0.1\nPGPORT=${port}\nPGDATABASE=kd_integration\nPGUSER=kindred_test\nPGPASSWORD=${password}\nISOLATION_TOKEN=${instanceId}\nAPI_HOST=127.0.0.1\nAPI_PORT=3002\nFRONTEND_ORIGIN=http://127.0.0.1:5173\nSESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}\nSESSION_HOURS=24\nCOOKIE_SECURE=false\nREGISTRATION_MODE=local\nLOG_LEVEL=warn\n`;
  if(!fs.existsSync(path.join(root,".local/v1.3d/integration.env")))fs.writeFileSync(path.join(root,".local/v1.3d/integration.env"),config,{mode:0o600});
  console.log(JSON.stringify({isolated:true,host:"127.0.0.1",port,database:"kd_integration",role:"kindred_test",environmentFile:".local/v1.3d/integration.env",instanceId}));
}else throw Error("Use start or stop. This script never deletes a database or cluster.");
