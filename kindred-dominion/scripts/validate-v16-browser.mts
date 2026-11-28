import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {parseEnv} from "node:util";
import {spawnSync} from "node:child_process";
import {releaseServices} from "../server/tests/browser/release-services";

// No implicit environment file, normal DEV service or hosted target is allowed.
const args=process.argv.slice(2),at=args.indexOf("--env"),file=at>=0?args[at+1]:args.find(a=>a.startsWith("--env="))?.slice(6);
if(!file)throw Error("Provide --env <registered disposable environment file>. No service started.");
const source=fs.readFileSync(path.resolve(file),"utf8"),env=parseEnv(source),manifest=JSON.parse(fs.readFileSync(".local/v1.3d/postgres/instance.json","utf8"));
if(env.APP_ENV!=="integration"||env.PGHOST!=="127.0.0.1"||Number(env.PGPORT)===5432||Number(env.PGPORT)!==manifest.port||env.PGUSER!=="kindred_test"||env.ISOLATION_TOKEN!==manifest.instanceId||![...(manifest.testDatabases??[]),...(manifest.restoreDatabases??[])].includes(env.PGDATABASE))throw Error("Only a registered owned disposable integration database is allowed. No service started.");
for(const name of["server-dist/index.mjs","dist-player/index.html"])if(!fs.existsSync(name))throw Error("Build the backend and player application first.");
type Group={name:string;file:string;flag?:string;ports?:[number,number];external?:boolean;sampler?:boolean;simulation?:boolean;invite?:boolean;grep?:string;full?:boolean;optional?:boolean};
const groups:Group[]=[
 ...["Nature","Mythical","Arcane","Undead","Constructs"].map(k=>({name:"experience-"+k.toLowerCase(),file:"experience",flag:"KINDRED_EXPERIENCE_ACCEPT",ports:[3092,5253]as[number,number],grep:k+" completes"})),
 {name:"deck-builder",file:"deck-builder",flag:"KINDRED_DECK_BUILDER_ACCEPT"},
 {name:"placement",file:"placement",flag:"KINDRED_PLACEMENT_ACCEPT",ports:[3084,5245]},
 {name:"tactical",file:"tactical",flag:"KINDRED_TACTICAL_ACCEPT",ports:[3086,5247]},
 {name:"resolution",file:"resolution",flag:"KINDRED_RESOLUTION_ACCEPT",ports:[3088,5249]},
 {name:"history",file:"history",flag:"KINDRED_HISTORY_ACCEPT",ports:[3090,5251]},
 {name:"viewport",file:"viewport",external:true},
 {name:"accounts",file:"accounts",external:true,sampler:true,full:true},
 {name:"identity",file:"identity",external:true,sampler:true},
 {name:"collections",file:"collections",external:true,sampler:true},
 {name:"matches",file:"matches",external:true,sampler:true},
 ...["economy","shop","trading","trading-safety","commerce","commerce-admin","control","release"].map(name=>({name,file:name,flag:"KINDRED_"+name.replaceAll("-","_").toUpperCase()+"_ACCEPT",simulation:name.startsWith("commerce"),invite:name==="control",sampler:name==="release"})),
 // This legacy acceptance deliberately activates the proposal in its isolated
 // target. Run it last so the other legacy cases still test their 30-copy path.
 {name:"starters",file:"starters",flag:"KINDRED_STARTER_ACCEPT"},
 {name:"legacy-restored",file:"experience-restore",flag:"KINDRED_EXPERIENCE_RESTORE_ACCEPT",ports:[3098,5259],optional:true},
 {name:"launch-catalog",file:"launch-catalog",flag:"KINDRED_LAUNCH_CATALOG_ACCEPT",ports:[3104,5275],simulation:true,optional:true},
 {name:"storefront",file:"storefront",flag:"KINDRED_STOREFRONT_ACCEPT",ports:[3102,5273],simulation:true,optional:true},
 // Private temporary artwork and sandbox accounts never enter the official registry.
 {name:"cosmetics",file:"cosmetics",flag:"KINDRED_COSMETICS_ACCEPT",ports:[3108,5279],simulation:true,optional:true},
 {name:"trading-experience",file:"trading-experience",flag:"KINDRED_TRADING_EXPERIENCE_ACCEPT",ports:[3118,5289],optional:true},
 {name:"onboarding",file:"onboarding",flag:"KINDRED_ONBOARDING_ACCEPT",ports:[3120,5291],optional:true},
 {name:"offline-gameplay",file:"offline-gameplay",ports:[3122,5293],external:true,full:true,optional:true},
 {name:"offline-invited",file:"offline-invited",ports:[3124,5295],external:true,optional:true},
 {name:"clean-player",file:"clean-player",flag:"KINDRED_CLEAN_PLAYER_ACCEPT",ports:[3126,5297],optional:true},
 {name:"setup",file:"setup",flag:"KINDRED_SETUP_ACCEPT",ports:[3116,5287],optional:true},
 {name:"limited",file:"limited",flag:"KINDRED_LIMITED_ACCEPT",ports:[3114,5285],simulation:true,optional:true},
 {name:"store-acceptance",file:"store-acceptance",flag:"KINDRED_STORE_ACCEPT",ports:[3110,5281],simulation:true,optional:true},
];
const only=args.find(a=>a.startsWith("--only="))?.slice(7).split(","),selected=groups.filter(g=>only?only.includes(g.name):!g.optional);if(!selected.length||only?.some(n=>!groups.some(g=>g.name===n)))throw Error("Unknown browser group; no service started.");
const offlineSuites=["gameplay","owner","founding-artwork","advanced","artwork","clean-publication","studio","svg-artwork"],offlineFiles=args.find(a=>a.startsWith("--offline-files="))?.slice(16).split(",")??offlineSuites;
if(offlineFiles.some(name=>!offlineSuites.includes(name))||args.some(a=>a.startsWith("--offline-files="))&&!selected.some(g=>g.name==="offline-gameplay"))throw Error("Choose supported offline browser files with the offline-gameplay group. No service started.");
if(selected.some(g=>g.name==="clean-player")){
 const status=spawnSync("git",["status","--porcelain"],{encoding:"utf8",windowsHide:true});
 if(status.status!==0||status.stdout.trim())throw Error("Clean-player acceptance requires an unchanged committed checkout. No service started.");
}
if(env.PGDATABASE?.startsWith("kd_restore_")&&selected.some(g=>g.name!=="legacy-restored"))throw Error("Restored data is only used by the declared read-only restoration browser journey.");
const directory=".local/v1.6g/browser-groups";fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(".local/v1.4",{recursive:true});
const results:any[]=[];
for(const group of selected){
 const [api,frontend]=group.ports??[3094,5255],privateFile=path.resolve(directory,group.name+"-"+crypto.randomUUID()+".env");
 fs.writeFileSync(privateFile,source+`\nAPI_PORT=${api}\nFRONTEND_ORIGIN=http://127.0.0.1:${frontend}\nSESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}\nREGISTRATION_MODE=${group.invite?"invite":"local"}\nLOCAL_TEST_ACQUISITION=${!!group.sampler}\nCOMMERCE_MODE=${group.simulation?"simulation":"disabled"}\nECONOMY_ENABLED=${!group.sampler}\n`,{mode:0o600});
 const processEnv:NodeJS.ProcessEnv={...process.env,KINDRED_ENV_FILE:privateFile,KINDRED_ACCOUNT_URL:`http://127.0.0.1:${frontend}`};for(const g of groups)if(g.flag)delete processEnv[g.flag];if(group.flag)processEnv[group.flag]="yes";
 if(group.name==="cosmetics")processEnv.KINDRED_ROOT=path.resolve(".local/v1.6h56/browser-assets");
 if(group.name==="limited")processEnv.KINDRED_ROOT=path.resolve(".local/v1.6hl/browser-assets");
 if(group.name==="store-acceptance")processEnv.KINDRED_ROOT=path.resolve(".local/v1.6h78/browser-assets");
 if(group.name==="offline-invited")processEnv.KINDRED_PLAYER_URL=`http://127.0.0.1:${frontend}`;
 const services=releaseServices(api,frontend,group.full?"dist":"dist-player"),previous=process.env.KINDRED_ENV_FILE,start=Date.now();
 try{
  process.env.KINDRED_ENV_FILE=privateFile;if(group.external)await services.start();
  let command=group.file==="history"?["scripts/test-history-browser.mjs","--env",privateFile]:["node_modules/@playwright/test/cli.js","test","--config","server/playwright.config.ts",`server/tests/browser/${group.file}.spec.ts`,...(group.grep?["--grep",group.grep]:[])];
  if(["offline-gameplay","offline-invited"].includes(group.name)){
   const configFile=privateFile+".config.mjs";
   fs.writeFileSync(configFile,"export default "+JSON.stringify({testDir:path.resolve("tests/browser"),fullyParallel:false,workers:1,timeout:60000,use:{baseURL:`http://127.0.0.1:${frontend}`,trace:"retain-on-failure"},outputDir:path.resolve(".local/v1.6i45/offline-results",path.basename(privateFile,".env")),projects:[{name:"offline-chromium",use:{browserName:"chromium",viewport:{width:1280,height:720}}}]}));
   command=["node_modules/@playwright/test/cli.js","test","--config",configFile,...(group.name==="offline-invited"?["owner.spec.ts","--grep","invited player build"]:offlineFiles.map(name=>"(?:^|[/\\\\])"+name+"\\.spec\\.ts$"))];
  }
  const result=spawnSync(process.execPath,command,{env:processEnv,encoding:"utf8",windowsHide:true,maxBuffer:50*1024*1024});
  fs.writeFileSync(directory+"/"+group.name+".log",result.stdout+"\n"+result.stderr);results.push({group:group.name,passed:result.status===0,elapsedSeconds:Math.round((Date.now()-start)/1000)});fs.writeFileSync(directory+"/results-"+selected.map(g=>g.name).join("_").slice(0,120)+".json",JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));
  if(result.status!==0)throw Error("Compiled "+group.name+" failed; inspect its private group log. No limit or assertion was relaxed.");
 }finally{await services.stop();if(previous===undefined)delete process.env.KINDRED_ENV_FILE;else process.env.KINDRED_ENV_FILE=previous;}
}
