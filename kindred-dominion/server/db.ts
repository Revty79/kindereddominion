import pg, { type PoolClient } from "pg";
import type { BackendConfig } from "./config";
export type DB = pg.Pool;
export function database(config:BackendConfig) {
  const pool=new pg.Pool({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,
    max:8,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,application_name:`kindred-${config.environment}`});
  pool.on("error",()=>console.error(JSON.stringify({event:"database-pool-error"})));
  return pool;
}
export async function transaction<T>(pool:DB, fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();try{await client.query("BEGIN");const result=await fn(client);await client.query("COMMIT");return result;}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
export async function target(pool:DB,config:BackendConfig) {
  const {rows:[row]}=await pool.query("SELECT current_database() AS database, current_user AS username, inet_server_addr()::text AS host, inet_server_port() AS port, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser, current_setting('server_version_num')::int AS version");
  if(row.database!==config.database||row.username!==config.user||row.port!==config.port||row.superuser)throw Error("Database identity/privilege preflight failed.");
  if(row.version<150000)throw Error("PostgreSQL 15 or newer is required.");return row;
}
export async function readiness(pool:DB,config:BackendConfig){
  await target(pool,config);
  const {rows:[guard]}=await pool.query("SELECT environment,instance_id FROM kd.environment_guard WHERE singleton");
  if(!guard||guard.environment!==config.environment||(config.environment==="integration"&&guard.instance_id!==config.isolationToken))throw Error("Database environment guard does not match backend configuration.");
  const {rows}=await pool.query("SELECT version_id FROM kd.content_selection WHERE singleton");if(!rows.length)throw Error("Official catalog is not seeded.");
  const {rows:migrations}=await pool.query("SELECT name FROM kd.migration_checksum WHERE name='1795800000000_hosted_administration.cjs'");if(!migrations.length)throw Error("Backend migrations are pending.");
}
