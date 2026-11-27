import fs from "node:fs/promises";
import path from "node:path";
import {parseEnv} from "node:util";
import {execFileSync} from "node:child_process";

// Print counts only: never print the private values being checked.
const tracked=execFileSync("git",["ls-files","-z"],{encoding:"utf8",windowsHide:true}).split("\0").filter(Boolean);
const privateFiles=tracked.filter(file=>/(^|\/)(\.local|backups)(\/|$)|\.(dump|backup|private)$|(^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith(".env.example"));
if(privateFiles.length)throw Error("Private configuration or backup files are tracked by Git.");
const values=[];
for(const file of ["server/.env.local",process.env.KINDRED_ENV_FILE].filter(Boolean)){
  try{const env=parseEnv(await fs.readFile(file,"utf8"));for(const key of ["PGPASSWORD","SESSION_SECRET","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","STRIPE_CATALOG_SECRET_KEY"])if(env[key]?.length>=8&&!env[key].startsWith("replace-"))values.push(env[key]);}
  catch(error){if(error.code!=="ENOENT")throw error;}
}
async function files(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await files(file));else result.push(file);}return result;}
let checked=0;
const buildRoot=path.resolve(process.env.KINDRED_BUILD_ROOT??".");
let trackedFilesChecked=0;
for(const file of tracked){
  const bytes=await fs.readFile(file);trackedFilesChecked++;
  for(const value of values)if(bytes.includes(Buffer.from(value)))throw Error("A private value was found in a tracked repository file.");
}
for(const directory of ["dist","dist-player","dist-control","server-dist"]){
  for(const file of await files(path.join(buildRoot,directory))){const bytes=await fs.readFile(file);checked++;for(const value of values)if(bytes.includes(Buffer.from(value)))throw Error("A private value was found in build output.");}
}
console.log(JSON.stringify({trackedPrivateFiles:0,trackedFilesChecked,privateValuesChecked:new Set(values).size,buildFilesChecked:checked,secretMatches:0}));
