import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {migrationSourceHash} from "./migration-source";
import {runner} from "node-pg-migrate";
import {transaction,target,type DB} from "./db";
import type {BackendConfig} from "./config";
export const migrationsDirectory=()=>path.join(import.meta.dirname,"migrations");
export async function migrationStatus(pool:DB,config:BackendConfig){
  const identity=await target(pool,config),dir=migrationsDirectory();
  const files=(await fs.readdir(dir)).filter(f=>/^\d+.*\.cjs$/.test(f)).sort();
  const exists=await pool.query("SELECT to_regclass('kd.migration_checksum') AS table");
  const guardExists=await pool.query("SELECT to_regclass('kd.environment_guard') AS table");
  if(guardExists.rows[0].table){const {rows:[guard]}=await pool.query("SELECT environment,instance_id FROM kd.environment_guard WHERE singleton");if(guard&&(guard.environment!==config.environment||config.environment==="integration"&&guard.instance_id!==config.isolationToken))throw Error("Database environment guard mismatch; migrations refused before writes.");}
  const rows=exists.rows[0].table?(await pool.query("SELECT name,sha256 FROM kd.migration_checksum ORDER BY name")).rows:[];
  const sources=await Promise.all(files.map(async name=>({name,sha256:migrationSourceHash(await fs.readFile(path.join(dir,name)))})));
  for(const row of rows)if(!sources.some(s=>s.name===row.name&&s.sha256===row.sha256))throw Error("Applied migration checksum mismatch or missing source. Restore/review; do not rewrite applied migrations.");
  return {target:identity,applied:rows.length,pending:sources.filter(s=>!rows.some(r=>r.name===s.name)),sources};
}
export async function applyMigrations(pool:DB,config:BackendConfig){
  const status=await migrationStatus(pool,config),client=await pool.connect();
  try{
    await runner({dbClient:client,dir:migrationsDirectory(),direction:"up",migrationsTable:"schema_migrations",migrationsSchema:"kd",schema:"kd",createSchema:true,createMigrationsSchema:true,
      singleTransaction:true,checkOrder:true,log:()=>{},logger:{debug:()=>{},info:()=>{},warn:()=>{},error:()=>{}}});
  }finally{client.release();}
  await transaction(pool,async c=>{
    for(const s of status.sources)await c.query("INSERT INTO kd.migration_checksum(name,sha256) VALUES($1,$2) ON CONFLICT(name) DO NOTHING",[s.name,s.sha256]);
    const instance=config.environment==="integration"?config.isolationToken:crypto.randomUUID();
    await c.query("INSERT INTO kd.environment_guard(singleton,environment,instance_id,disposable) VALUES(true,$1,$2,$3) ON CONFLICT(singleton) DO NOTHING",[config.environment,instance,config.environment==="integration"]);
    const {rows:[guard]}=await c.query("SELECT environment,instance_id FROM kd.environment_guard WHERE singleton");
    if(guard.environment!==config.environment||config.environment==="integration"&&guard.instance_id!==config.isolationToken)throw Error("Existing database environment guard mismatch");
  });
  return migrationStatus(pool,config);
}
