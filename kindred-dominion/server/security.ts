import crypto from "node:crypto";
import type { DB } from "./db";
import type { BackendConfig } from "./config";
import { reject } from "./errors";
const scrypt=(password:string,salt:string,length:number,options:crypto.ScryptOptions)=>new Promise<Buffer>((resolve,fail)=>crypto.scrypt(password,salt,length,options,(error,key)=>error?fail(error):resolve(key)));
const N=131072,r=8,p=1;
let hashes=0;
export const token=()=>crypto.randomBytes(32).toString("base64url");
export const digest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");
export const canonical=(value:unknown)=>JSON.stringify(value,(_,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
export const keyed=(value:string,config:BackendConfig)=>crypto.createHmac("sha256",config.sessionSecret).update(value).digest("hex");
export async function passwordHash(password:string,salt=crypto.randomBytes(16).toString("base64url")){
  if(hashes>=2)reject(503,"authentication_busy","Authentication is busy. Retry shortly.");
  hashes++;try{const key=await scrypt(password,salt,64,{N,r,p,maxmem:192*1024*1024}) as Buffer;return `scrypt$${N}$${r}$${p}$${salt}$${key.toString("base64url")}`;}finally{hashes--;}
}
export async function verifyPassword(password:string,stored:string){
  const parts=stored.split("$");if(parts.length!==6||parts[0]!=="scrypt"||Number(parts[1])!==N||Number(parts[2])!==r||Number(parts[3])!==p)return false;
  const actual=await passwordHash(password,parts[4]),a=Buffer.from(actual),b=Buffer.from(stored);return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export async function rateLimit(pool:DB,key:string,limit:number,seconds:number){
  const {rows:[row]}=await pool.query(`INSERT INTO kd.rate_bucket(key,window_at,attempts) VALUES($1,now(),1)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN kd.rate_bucket.window_at<now()-make_interval(secs=>$2) THEN 1 ELSE kd.rate_bucket.attempts+1 END,
    window_at=CASE WHEN kd.rate_bucket.window_at<now()-make_interval(secs=>$2) THEN now() ELSE kd.rate_bucket.window_at END RETURNING attempts`,[key,seconds]);
  if(row.attempts>limit)reject(429,"rate_limited","Too many attempts. Retry later.");
}
