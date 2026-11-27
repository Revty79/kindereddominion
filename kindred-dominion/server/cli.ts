import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import pg from "pg";
import {readConfig} from "./config";
import {database,target,transaction} from "./db";
import {applyMigrations,migrationStatus} from "./migrations";
import {seedRepository,publishContent} from "./catalog";
import {keyed,token,passwordHash,digest} from "./security";
import {validateRecord} from "../src/replay/record";
import {validateWorkspace} from "../src/content/transfer";
import {issueLocalRecovery} from "./identity";
import {reconcileEconomy} from "./economy-assets";
import {economyDigest} from "./economy-hash";
const config=readConfig(),pool=database(config),command=process.argv[2]??"status",args=process.argv.slice(3);
process.umask(0o077);
const value=(key:string)=>args.find(x=>x.startsWith(`--${key}=`))?.slice(key.length+3);
const bin=process.env.PG_BIN??(process.platform==="win32"?"C:/Program Files/PostgreSQL/18/bin":"/usr/lib/postgresql/18/bin");
const pgEnv={...process.env,PGHOST:config.host,PGPORT:String(config.port),PGDATABASE:config.database,PGUSER:config.user,PGPASSWORD:config.password};
const native=(name:string,parameters:string[],env=pgEnv)=>{try{return execFileSync(path.join(bin,name+(process.platform==="win32"?".exe":"")),parameters,{env,windowsHide:true,stdio:["ignore","pipe","pipe"],encoding:"utf8"});}catch{throw Error(`${name} failed. Inspect private diagnostics; credentials are never printed.`);}};
async function backup(){
  const identity=await target(pool,config),directory=path.resolve(value("directory")??".local/v1.3d/backups");await fs.mkdir(directory,{recursive:true,mode:0o700});
  const output=path.join(directory,`${config.database}-${new Date().toISOString().replace(/[:.]/g,"-")}-${crypto.randomBytes(4).toString("hex")}.dump`);
  const c=await pool.connect(),records:Record<string,number>={};let migrations:any[]=[],contentVersions:any[]=[];
  try{await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");const snapshot=(await c.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
    native("pg_dump",["--format=custom","--no-owner","--snapshot",snapshot,"--file",output]);native("pg_restore",["--list",output]);
    const counts=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='kd' ORDER BY tablename")).rows;
    for(const {tablename}of counts){if(!/^[a-z_]+$/.test(tablename))throw Error("Unexpected schema identifier");records[tablename]=Number((await c.query(`SELECT count(*) FROM kd.${tablename}`)).rows[0].count);}
    migrations=(await c.query("SELECT name,sha256 FROM kd.migration_checksum ORDER BY name")).rows;
    contentVersions=(await c.query("SELECT id,digest,engine_version,channel FROM kd.content_version ORDER BY id")).rows;
    await c.query("COMMIT");
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
  const bytes=await fs.readFile(output);
  const git=(parameters:string[])=>execFileSync("git",parameters,{windowsHide:true,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  const source={commit:git(["rev-parse","HEAD"]),trackedChanges:!!git(["status","--porcelain","--untracked-files=no"]),assetManifestSha256:crypto.createHash("sha256").update(await fs.readFile("public/assets/manifest.json")).digest("hex"),bundle:null as string|null,bundleVerified:false};
  if(args.includes("--with-source")){if(source.trackedChanges)throw Error("Source companion requires committed tracked changes. Database dump remains private and intact; commit or use backup without --with-source.");source.bundle=output+".bundle";git(["bundle","create",source.bundle,"HEAD"]);git(["bundle","verify",source.bundle]);source.bundleVerified=true;}
  const receipt={target:identity,createdAt:new Date().toISOString(),bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),records,migrations,contentVersions,source,archiveListVerified:true};
  await fs.writeFile(output+".json",JSON.stringify(receipt,null,2),{mode:0o600});return {output,receipt};
}
try{
  if(["test","prod"].includes(config.environment)&&value("allow-environment")!==config.environment)throw Error("Hosted database operation requires explicit --allow-environment=<environment>; no connection was attempted.");
  if(command==="status")console.log(JSON.stringify(await migrationStatus(pool,config),null,2));
  else if(command==="migrate")console.log(JSON.stringify(await applyMigrations(pool,config),null,2));
  else if(command==="seed"){
    await target(pool,config);
    // Validate all portable source/runtime files before importing official references.
    const sourceArchive=args.includes("--source-archive");
    execFileSync(process.execPath,["scripts/validate-assets.mjs",...(sourceArchive?[]:["--tracked"])],{windowsHide:true,stdio:"inherit"});
    const file=value("file");
    if(file){const relative=path.relative(config.root,path.resolve(file));if(relative.startsWith("..")||path.isAbsolute(relative))throw Error("Published content must remain inside the reviewed source root");if(!sourceArchive)execFileSync("git",["ls-files","--error-unmatch","--",relative],{stdio:"ignore",windowsHide:true});console.log(JSON.stringify(await publishContent(pool,JSON.parse(await fs.readFile(file,"utf8")),"official",args.includes("--activate"))));}
    else console.log(JSON.stringify(await seedRepository(pool)));
  }
  else if(command==="backup")console.log(JSON.stringify(await backup(),null,2));
  else if(command==="restore-test"){
    const input=value("file");if(!input)throw Error("Provide --file=<private dump path>");
    const receipt=JSON.parse(await fs.readFile(input+".json","utf8")),bytes=await fs.readFile(input);
    if(crypto.createHash("sha256").update(bytes).digest("hex")!==receipt.sha256)throw Error("Backup checksum mismatch");
    const m=JSON.parse(await fs.readFile(".local/v1.3d/postgres/instance.json","utf8")),password=(await fs.readFile(".local/v1.3d/postgres/password.private","utf8")).trim();
    if(m.host!=="127.0.0.1"||m.port===5432||path.resolve(m.data)!==path.resolve(".local/v1.3d/postgres/data"))throw Error("Disposable restore target verification failed");
    const name="kd_restore_"+crypto.randomBytes(8).toString("hex"),env={...process.env,PGHOST:m.host,PGPORT:String(m.port),PGUSER:"kd_isolation_admin",PGPASSWORD:password,PGDATABASE:"postgres"};
    native("createdb",["--owner=kindred_test",name],env);
    native("pg_restore",["--exit-on-error","--no-owner","--no-privileges","--role=kindred_test","--dbname",name,input],env);
    const restored=new pg.Client({host:m.host,port:m.port,database:name,user:"kindred_test",password});await restored.connect();
    const comparisons=[];try{for(const [table,count]of Object.entries(receipt.records)){if(!/^[a-z_]+$/.test(table))throw Error("Unsafe restore receipt identifier");const actual=Number((await restored.query(`SELECT count(*) FROM kd.${table}`)).rows[0].count);if(actual!==count)throw Error("Restored record count mismatch");comparisons.push({table,count:actual,identical:true});}
    if(receipt.migrations&&JSON.stringify((await restored.query("SELECT name,sha256 FROM kd.migration_checksum ORDER BY name")).rows)!==JSON.stringify(receipt.migrations))throw Error("Restored migration checksum ledger differs from the backup receipt");
    for(const row of (await restored.query("SELECT pack,digest FROM kd.content_version")).rows)if(digest(row.pack)!==row.digest)throw Error("Restored content checksum mismatch");
    await restored.query("SELECT p.id FROM kd.player p JOIN kd.inventory i ON p.id=i.player_id JOIN kd.edition e ON e.id=i.edition_id LIMIT 1");
    for(const row of (await restored.query("SELECT record FROM kd.match")).rows)validateRecord(row.record);
    for(const row of (await restored.query("SELECT workspace FROM kd.studio_workspace")).rows)validateWorkspace(row.workspace);
    const mismatch=await restored.query(`SELECT i.player_id FROM kd.inventory i LEFT JOIN (SELECT a.player_id,e.edition_id,sum(e.delta) AS balance FROM kd.inventory_entry e JOIN kd.acquisition a ON a.id=e.acquisition_id GROUP BY a.player_id,e.edition_id) l ON l.player_id=i.player_id AND l.edition_id=i.edition_id WHERE i.quantity<>coalesce(l.balance,0)`);
    if(mismatch.rowCount)throw Error("Restored inventory ledger does not reconcile");
    if((await restored.query("SELECT to_regclass('kd.economy_transaction') AS relation")).rows[0].relation){
      if(!(await reconcileEconomy(restored as any)).ok)throw Error("Restored economy ledger does not reconcile");
      for(const row of (await restored.query("SELECT document,digest FROM kd.configuration_version")).rows)if(economyDigest(row.document)!==row.digest)throw Error("Restored configuration checksum mismatch");
    }
    // Adopt only this newly created disposable copy; the source is never changed.
    await restored.query("UPDATE kd.environment_guard SET environment='integration',instance_id=$1,disposable=true WHERE singleton",[m.instanceId]);
    }finally{await restored.end();}
    m.restoreDatabases=[...(m.restoreDatabases??[]),name];await fs.writeFile(".local/v1.3d/postgres/instance.json",JSON.stringify(m,null,2));
    const restoreEnv=`APP_ENV=integration\nPGHOST=${m.host}\nPGPORT=${m.port}\nPGDATABASE=${name}\nPGUSER=kindred_test\nPGPASSWORD=${password}\nISOLATION_TOKEN=${m.instanceId}\nAPI_HOST=127.0.0.1\nAPI_PORT=3003\nFRONTEND_ORIGIN=http://127.0.0.1:5178\nSESSION_SECRET=${crypto.randomBytes(48).toString("base64url")}\nSESSION_HOURS=24\nCOOKIE_SECURE=false\nREGISTRATION_MODE=closed\nLOG_LEVEL=warn\n`;
    await fs.writeFile(".local/v1.3d/restore.env",restoreEnv,{mode:0o600});
    const result={restored:true,host:m.host,port:m.port,database:name,sourceDatabase:receipt.target.database,comparisons,engineReplaysVerified:true,privateWorkspacesVerified:true,inventoryLedgerReconciled:true,originalUntouched:true,environmentFile:".local/v1.3d/restore.env"};await fs.writeFile(input+".restore.json",JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result,null,2));
  }
  else if(command==="reset-dev"){
    if(config.environment!=="integration"||value("confirm-reset")!==config.database||value("disposable-token")!==config.isolationToken)throw Error("Reset requires an owned disposable integration target, exact database confirmation and its private instance token. Owner DEV/TEST/PROD are not resettable by this command.");
    const {rows:[g]}=await pool.query("SELECT * FROM kd.environment_guard WHERE singleton");if(!g?.disposable||g.instance_id!==config.isolationToken)throw Error("Disposable database guard verification failed");
    await backup();await pool.query("DROP SCHEMA kd CASCADE");console.log("Reset only the explicitly confirmed disposable development schema. Run migrations and seed separately.");
  }
  else if(command==="invite"){
    await target(pool,config);const invite=token();await pool.query("INSERT INTO kd.invite(token_hash,max_uses,expires_at) VALUES($1,1,now()+interval '7 days')",[keyed(invite,config)]);
    const directory=".local/v1.3d/invites";await fs.mkdir(directory,{recursive:true});const file=path.join(directory,crypto.randomUUID()+".private");await fs.writeFile(file,invite,{mode:0o600});console.log(JSON.stringify({inviteFile:file,uses:1,expiresInDays:7}));
  }
  else if(command==="role"){
    const username=value("username"),role=value("role");if(!username||value("confirm-user")!==username||!["player","developer","administrator"].includes(role??""))throw Error("Provide --username=... --role=... --confirm-user=<same username>");
    await target(pool,config);await transaction(pool,async c=>{const {rows:[p]}=await c.query("UPDATE kd.player SET role=$2 WHERE username=$1 RETURNING id",[username.toLowerCase(),role]);if(!p)throw Error("Account not found");await c.query("INSERT INTO kd.audit_event(operation,target_id,details) VALUES('operator-role-change',$1,$2)",[p.id,{role}]);});console.log(JSON.stringify({username,role,updated:true}));
  }
  else if(command==="account-status"){
    const username=value("username"),status=value("status");if(!username||value("confirm-user")!==username||!["active","disabled"].includes(status??""))throw Error("Provide --username=... --status=active|disabled --confirm-user=<same username>");
    await target(pool,config);await transaction(pool,async c=>{const {rows:[p]}=await c.query("UPDATE kd.player SET status=$2 WHERE username=$1 RETURNING id",[username.toLowerCase(),status]);if(!p)throw Error("Account not found");if(status==="disabled"){await c.query("DELETE FROM kd.session WHERE player_id=$1",[p.id]);await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE player_id=$1 AND used_at IS NULL",[p.id]);}await c.query("INSERT INTO kd.audit_event(operation,target_id,details) VALUES('operator-account-status',$1,$2)",[p.id,{status}]);});console.log(JSON.stringify({username,status,updated:true}));
  }
  else if(command==="recovery-code"){
    const username=value("username");if(!username||value("confirm-user")!==username)throw Error("Provide --username and an identical --confirm-user for the intended local account.");
    await target(pool,config);const code=await issueLocalRecovery(pool,config,username),directory=".local/v1.4/recovery";await fs.mkdir(directory,{recursive:true,mode:0o700});
    const file=path.join(directory,crypto.randomUUID()+".private");await fs.writeFile(file,code,{mode:0o600});console.log(JSON.stringify({username,recoveryFile:file,expiresInMinutes:15,oneTime:true,emailSent:false}));
  }
  else if(command==="password-reset"){
    const username=value("username"),privateFile=value("private-file");if(!username||value("confirm-user")!==username||!privateFile)throw Error("Provide exact username confirmation and a private file containing the new password.");
    const pass=(await fs.readFile(privateFile,"utf8")).trim();if(pass.length<15||pass.length>128||Buffer.byteLength(pass)>256)throw Error("New password requires 15–128 characters");
    const hash=await passwordHash(pass);await transaction(pool,async c=>{const {rows:[p]}=await c.query("UPDATE kd.player SET password_hash=$2 WHERE username=$1 RETURNING id",[username.toLowerCase(),hash]);if(!p)throw Error("Account not found");await c.query("DELETE FROM kd.session WHERE player_id=$1",[p.id]);await c.query("UPDATE kd.password_recovery SET used_at=now() WHERE player_id=$1 AND used_at IS NULL",[p.id]);await c.query("INSERT INTO kd.audit_event(operation,target_id) VALUES('operator-password-reset',$1)",[p.id]);});console.log("Password reset and sessions revoked.");
  }
  else throw Error("Unknown backend CLI command");
}catch(e){console.error(JSON.stringify({operation:command,error:e instanceof Error&&!("code" in e)?e.message:"Database operation failed. No credentials or raw database error details printed."}));process.exitCode=1;}finally{await pool.end();}
