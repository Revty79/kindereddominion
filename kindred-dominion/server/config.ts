import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
export type BackendConfig = ReturnType<typeof readConfig>;
export function readConfig() {
  const file=process.env.KINDRED_ENV_FILE??"server/.env.local";
  // Explicit private file wins over stale shell PG variables for repeatable target checks.
  const env={...process.env,...(fs.existsSync(file)?parseEnv(fs.readFileSync(file,"utf8")): {})};
  const required=(key:string)=>{const value=env[key];if(!value||value.startsWith("replace-"))throw Error(`Configure ${key} privately in the backend environment.`);return value;};
  const environment=required("APP_ENV");
  if(!["dev","integration","test","prod"].includes(environment))throw Error("Invalid APP_ENV");
  const integer=(key:string,fallback:number,min:number,max:number)=>{const n=Number(env[key]??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`Invalid ${key}`);return n;};
  const host=required("PGHOST"),port=integer("PGPORT",5432,1,65535),database=required("PGDATABASE"),user=required("PGUSER");
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(database)||!/^[a-z][a-z0-9_]{0,62}$/.test(user))throw Error("Use portable PostgreSQL database and role identifiers.");
  const sessionSecret=required("SESSION_SECRET");if(sessionSecret.length<43)throw Error("SESSION_SECRET requires at least 32 random bytes encoded as base64url.");
  const origin=new URL(required("FRONTEND_ORIGIN")).origin;
  const secure=env.COOKIE_SECURE==="true",registration=env.REGISTRATION_MODE??"invite";
  if(!["local","invite","closed"].includes(registration))throw Error("Invalid REGISTRATION_MODE");
  if((environment==="prod"||environment==="test")&&(!secure||!origin.startsWith("https:")||registration==="local"))throw Error("Hosted environments require HTTPS, secure cookies and closed/invite registration.");
  if(registration==="local"&&!['dev','integration'].includes(environment))throw Error("Local registration is development-only.");
  if(environment==="dev"&&(host!=="127.0.0.1"||port!==5432||database!=="kindred_dominion_dev"||user!=="kindred_dev"))throw Error("DEV target must exactly match the owner's authorized local database.");
  if(environment==="integration") {
    const m=JSON.parse(fs.readFileSync(path.resolve(".local/v1.3d/postgres/instance.json"),"utf8"));
    if(host!==m.host||port!==m.port||database!==m.database&&![...(m.restoreDatabases??[]),...(m.testDatabases??[])].includes(database)||user!=="kindred_test"||env.ISOLATION_TOKEN!==m.instanceId)throw Error("Integration configuration does not match the owned isolated PostgreSQL instance.");
  }
  return {environment,host,port,database,user,password:required("PGPASSWORD"),sessionSecret,origin,secure,registration,
    sessionHours:integer("SESSION_HOURS",168,1,720),registrationLimit:integer("REGISTRATION_PER_HOUR",10,1,100),apiHost:env.API_HOST??"127.0.0.1",apiPort:integer("API_PORT",3001,1,65535),
    logLevel:env.LOG_LEVEL??"info",isolationToken:env.ISOLATION_TOKEN??"",root:path.resolve(process.env.KINDRED_ROOT??".")};
}
