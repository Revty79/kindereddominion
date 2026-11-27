import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {parseEnv} from "node:util";
import {spawnSync} from "node:child_process";

// Independent suites receive independent disposable service sessions. This
// preserves real request/session limits during the deliberately dense fixtures.
const args=process.argv.slice(2),index=args.indexOf("--env"),file=index>=0?args[index+1]:args.find(a=>a.startsWith("--env="))?.slice(6);
if(!file)throw Error("Provide --env <registered disposable integration environment file>. No command ran.");
const source=fs.readFileSync(path.resolve(file),"utf8"),env=parseEnv(source),manifest=JSON.parse(fs.readFileSync(".local/v1.3d/postgres/instance.json","utf8"));
if(env.APP_ENV!=="integration"||env.PGHOST!=="127.0.0.1"||Number(env.PGPORT)===5432||Number(env.PGPORT)!==manifest.port||env.PGUSER!=="kindred_test"||env.ISOLATION_TOKEN!==manifest.instanceId||!manifest.testDatabases?.includes(env.PGDATABASE))throw Error("Only a registered disposable integration database is permitted. No command ran.");
for(const required of["server-dist/index.mjs","dist-player/index.html"])if(!fs.existsSync(required))throw Error("Build the backend and player application before compiled browser acceptance.");
const directory=path.resolve(".local/v1.6f/browser-groups");fs.mkdirSync(directory,{recursive:true});
for(const[group,filter]of[["inspection-and-preferences",["--grep-invert","instant presentation completes"]],["ordinary-match",["--grep","instant presentation completes"]]]){
  const privateFile=path.join(directory,`${group}-${crypto.randomUUID()}.env`);
  fs.writeFileSync(privateFile,source+"\nAPI_PORT=3090\nFRONTEND_ORIGIN=http://127.0.0.1:5251\nLOCAL_TEST_ACQUISITION=false\nCOMMERCE_MODE=disabled\nSESSION_SECRET="+crypto.randomBytes(48).toString("base64url")+"\n",{mode:0o600});
  const result=spawnSync(process.execPath,["node_modules/@playwright/test/cli.js","test","--config","server/playwright.config.ts","server/tests/browser/history.spec.ts",...filter],{env:{...process.env,KINDRED_ENV_FILE:privateFile,KINDRED_HISTORY_ACCEPT:"yes"},stdio:"inherit",windowsHide:true});
  console.log(JSON.stringify({group,passed:result.status===0}));if(result.status!==0)process.exit(result.status??1);
}
