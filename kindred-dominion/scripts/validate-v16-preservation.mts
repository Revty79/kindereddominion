import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {parseEnv} from "node:util";
import {spawnSync} from "node:child_process";
import {readConfig} from "../server/config";
import {database,target} from "../server/db";
import {migrationStatus,applyMigrations} from "../server/migrations";
import {createApi} from "../server/app";

const args=process.argv.slice(2),option=(key:string)=>args.find(a=>a.startsWith("--"+key+"="))?.slice(key.length+3),file=option("env"),backup=option("backup"),directory=".local/v1.6g/preservation";
if(!file||!backup)throw Error("Use --env=<registered disposable file> --backup=<verified dump> [--prepare-browser]. No command ran.");
function isolated(file:string){const env=parseEnv(fs.readFileSync(file,"utf8")),manifest=JSON.parse(fs.readFileSync(".local/v1.3d/postgres/instance.json","utf8"));if(env.APP_ENV!=="integration"||env.PGHOST!=="127.0.0.1"||Number(env.PGPORT)===5432||Number(env.PGPORT)!==manifest.port||env.PGUSER!=="kindred_test"||env.ISOLATION_TOKEN!==manifest.instanceId||![...(manifest.testDatabases??[]),...(manifest.restoreDatabases??[])].includes(env.PGDATABASE))throw Error("Only a registered owned disposable database is allowed. No command ran.");}
isolated(file);fs.mkdirSync(directory,{recursive:true});process.env.KINDRED_ENV_FILE=path.resolve(file);
function cli(command:string[],name:string){const r=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs",...command],{env:process.env,encoding:"utf8",windowsHide:true,maxBuffer:40*1024*1024});fs.writeFileSync(directory+"/"+name+".log",r.stdout+"\n"+r.stderr,{mode:0o600});if(r.status!==0)throw Error(name+" failed; inspect its private log. No secret printed.");return r.stdout;}
const restore=JSON.parse(cli(["server/cli.ts","restore-test","--file="+path.resolve(backup)],"restore"));
const restored=directory+"/restored.env";fs.writeFileSync(restored,fs.readFileSync(".local/v1.3d/restore.env","utf8")+"\nAPI_PORT=3098\nFRONTEND_ORIGIN=http://127.0.0.1:5259\nLOCAL_TEST_ACQUISITION=false\nCOMMERCE_MODE=disabled\nECONOMY_ENABLED=true\n",{mode:0o600});isolated(restored);process.env.KINDRED_ENV_FILE=path.resolve(restored);
const config=readConfig();if(!config.database.startsWith("kd_restore_"))throw Error("Expected a newly restored disposable database");const pool=database(config),newTables=["starter_upgrade_grant","deck_workspace","player_presentation","match_recent_presentation","cosmetic_preferences","starting_cosmetic_grant","match_cosmetic_presentation"];
try{
 await target(pool,config);const fromSchema=(await migrationStatus(pool,config)).applied;
 const counts=async()=>{const result:Record<string,number>={};for(const table of newTables){const exists=(await pool.query("SELECT to_regclass($1) r",["kd."+table])).rows[0].r;result[table]=exists?(await pool.query(`SELECT count(*)::int n FROM kd.${table}`)).rows[0].n:0;}return result;};
 const oldCounts=await counts(),before=JSON.parse(cli(["scripts/verify-migration-preservation.mts","capture",directory+"/columns.json"],"capture")),after=await applyMigrations(pool,config),verified=JSON.parse(cli(["scripts/verify-migration-preservation.mts","verify",directory+"/columns.json"],"verify")),newCounts=await counts();
 if(after.applied!==after.sources.length||JSON.stringify(oldCounts)!==JSON.stringify(newCounts))throw Error("Unexpected schema or automatic grant/settings/history changes");
 let fixtureCount=0;
 if(args.includes("--prepare-browser")){
  const player=(await pool.query("SELECT p.id,p.username,p.role FROM kd.player p WHERE p.role='player' AND p.email LIKE '%@example.test' AND p.starting_kindred IS NOT NULL AND EXISTS(SELECT 1 FROM kd.deck d WHERE d.player_id=p.id AND NOT d.is_draft) AND EXISTS(SELECT 1 FROM kd.match m WHERE m.player_id=p.id AND m.status='finished') ORDER BY p.created_at DESC LIMIT 1")).rows[0],developer=(await pool.query("SELECT p.id,p.username,p.role FROM kd.player p JOIN kd.studio_workspace s ON s.player_id=p.id WHERE p.role IN ('developer','administrator') AND p.email LIKE '%@example.test' ORDER BY p.created_at DESC LIMIT 1")).rows[0];
  if(!player||!developer)throw Error("No representative synthetic legacy player/Studio accounts; preservation passed but browser fixtures need preparation.");
  const fixtures=[player,developer];for(const p of fixtures){p.password=crypto.randomBytes(30).toString("base64url");const privateFile=directory+"/"+p.role+".private";fs.writeFileSync(privateFile,p.password,{mode:0o600});cli(["server/cli.ts","password-reset","--username="+p.username,"--confirm-user="+p.username,"--private-file="+privateFile],"password-"+p.role);}
  const app=await createApi(config,pool);try{for(const p of fixtures){const anonymous=await app.inject({url:"/api/session",remoteAddress:"127.98.98.98"}),login=await app.inject({method:"POST",url:"/api/login",remoteAddress:"127.98.98.98",headers:{origin:config.origin,cookie:String(anonymous.headers["set-cookie"]).split(";")[0],"x-csrf-token":anonymous.json().csrf},payload:{username:p.username,password:p.password}});if(login.statusCode!==200)throw Error("Restored synthetic login failed");const cookie=String(login.headers["set-cookie"]).split(";")[0],get=async(url:string)=>{const r=await app.inject({url:"/api"+url,headers:{cookie}});if(r.statusCode!==200)throw Error("Restored read failed: "+url);return r.json();};Object.assign(p,{profile:await get("/profile"),collection:await get("/collection"),decks:await get("/decks"),progression:await get("/progression"),economy:await get("/economy"),matches:await get("/matches"),presentation:await get("/preferences/presentation")});if(p.role!=="player")p.workspace=await get("/developer/workspace");}}finally{await app.close();}
  fs.writeFileSync(directory+"/checkpoints.private",JSON.stringify(fixtures),{mode:0o600});fixtureCount=fixtures.length;
 }
 const result={fromSchema,toSchema:after.applied,originalRelations:before.tables,originalRows:before.rows,allExistingColumnsPreserved:verified.existingColumnsPreserved,automaticChanges:newCounts,declaredPostPreservationPasswordResets:fixtureCount,originalSourceUntouched:restore.originalUntouched,normalDevWrites:false,hostedAccessed:false};fs.writeFileSync(directory+"/result.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await pool.end();}
