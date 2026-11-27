// Native regression for Vite's config/cache writes, derived from the actual
// operator Docker argv. This is a Node filesystem-permission model, not a
// substitute for executing Linux Docker's read-only root and tmpfs mounts.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {execFileSync,spawnSync} from "node:child_process";

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2);
if(args.length!==2||args[0]!=="--root")throw Error("Use --root <separate, dependency-installed checkout application directory>.");
const root=await fs.realpath(path.resolve(args[1]));
if(root===await fs.realpath(project))throw Error("Use a separate checkout; the shared application and private configuration are not regression fixtures.");
if(JSON.parse(await fs.readFile(path.join(root,"package.json"),"utf8")).name!=="kindred-dominion")throw Error("The fixture is not a Kindred Dominion application checkout.");
if(Number(process.versions.node.split(".")[0])<24)throw Error("This regression requires Node.js 24 or newer.");
const python=process.platform==="win32"?"python":"python3";
const command=JSON.parse(execFileSync(python,["-B","-c","import sys,json;sys.path.insert(0,sys.argv[1]);from host import unit_validation_command;print(json.dumps(unit_validation_command('sha256:'+'a'*64)))",path.join(project,"deployment/operator")],{encoding:"utf8",windowsHide:true}));
const mounts=command.flatMap((value,index)=>value==="--tmpfs"?[command[index+1].split(":",1)[0]]:[]);
if(!mounts.includes("/app/node_modules/.vite-temp"))throw Error("The operator still omits the Vite bundled-config cache mount.");
const suite=command.slice(command.indexOf("node_modules/vitest/vitest.mjs"));
if(suite.join(" ")!=="node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism")throw Error("Review changed validation arguments before translating the container command.");
const directory=path.join(root,".local","readonly-validation",crypto.randomUUID());await fs.mkdir(directory,{recursive:true});
const hostPath=mount=>mount==="/tmp"?os.tmpdir():path.join(root,mount.slice("/app/".length));
// Docker provides existing mount directories at process startup. Node also
// needs those directories to exist when resolving recursive permissions.
for(const mount of mounts)await fs.mkdir(hostPath(mount),{recursive:true});
const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>! /^(PG|DATABASE_|SESSION_|AUTH_|KINDRED_|STRIPE_|VITE_|NODE_OPTIONS$|FORCE_COLOR$)/.test(key)));
function environment(selected){
  const paths=selected.map(hostPath);
  // NODE_OPTIONS is parsed by Node, never by a shell. Normalize Windows paths
  // so backslashes cannot escape quotes in the permission argument values.
  if(paths.some(value=>/["\r\n]/.test(value)))throw Error("Unsupported permission fixture path.");
  const options=["--permission","--allow-fs-read=*","--allow-child-process","--allow-worker","--allow-addons",...paths.map(value=>'--allow-fs-write="'+value.replaceAll("\\","/")+'"')];
  return {...clean,NO_COLOR:"1",NODE_OPTIONS:options.join(" ")};
}
function run(name,env,argv=suite){
  const result=spawnSync(process.execPath,argv,{cwd:root,env,encoding:"utf8",windowsHide:true,timeout:1800000,maxBuffer:32*1024*1024});
  if(result.error)throw Error("Native regression subprocess did not finish; inspect the ignored fixture.");
  const output=(result.stdout+result.stderr).replace(/\x1b\[[0-9;]*m/g,"");
  return fs.writeFile(path.join(directory,name+".log"),output).then(()=>({...result,output}));
}
const legacy=await run("missing-config-mount",environment(mounts.filter(value=>value!=="/app/node_modules/.vite-temp")));
if(legacy.status===0||!legacy.output.includes(".vite-temp")||!/(ERR_ACCESS_DENIED|EROFS|EACCES)/.test(legacy.output))throw Error("The old missing-mount failure was not reproduced; inspect missing-config-mount.log.");
const corrected=await run("corrected-full-suite",environment(mounts));
if(corrected.status!==0)throw Error("The unchanged full suite failed with the corrected write allowlist; inspect corrected-full-suite.log.");
const passed=corrected.output.match(/\bTests\s+(\d+)\s+passed/);
if(!passed||Number(passed[1])<1)throw Error("No successful full-suite test count was found.");
const probe="kindred-readonly-probe-"+crypto.randomUUID()+".txt";
const denied=await run("source-still-denied",environment(mounts),["--eval","require('node:fs').writeFileSync(process.argv[1],'must not write')",probe]);
if(denied.status===0||!denied.output.includes("ERR_ACCESS_DENIED"))throw Error("Ordinary source writes were not denied by the native permission model.");
const version=async name=>JSON.parse(await fs.readFile(path.join(root,"node_modules",name,"package.json"),"utf8")).version;
const receipt={node:process.versions.node,vite:await version("vite"),vitest:await version("vitest"),oldConfigWriteDenied:true,correctedFullSuitePassed:Number(passed[1]),ordinarySourceWriteDenied:true,containerWritePaths:mounts,databaseCredentialsSupplied:false,dockerExecuted:false,scope:"Node filesystem-permission model; Linux Docker rehearsal remains separate"};
await fs.writeFile(path.join(directory,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({...receipt,evidence:directory}));
