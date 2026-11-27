import fs from "node:fs";
import {parseEnv} from "node:util";
import {spawn,execFileSync} from "node:child_process";
import {frontendEnvironment} from "./frontend-environment.mjs";
if(Number(process.versions.node.split(".")[0])<24)throw Error("The backend requires Node.js 24 or newer.");
const file=process.env.KINDRED_ENV_FILE??"server/.env.local";
if(!fs.existsSync(file))throw Error("Configure the private backend environment first with npm run backend:configure. Local practice alone remains npm run dev.");
const config=parseEnv(fs.readFileSync(file,"utf8")),port=Number(config.API_PORT??3001);
if((config.API_HOST??"127.0.0.1")!=="127.0.0.1"||!Number.isInteger(port)||port<1||port>65535)throw Error("The Windows/local launcher requires an explicit loopback backend address and valid port.");
const frontendEnv=frontendEnvironment(process.env,`http://127.0.0.1:${port}`);
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)if(child.pid)try{if(process.platform==="win32")execFileSync("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else process.kill(-child.pid,"SIGTERM");}catch{}process.exit(code);}
for(const [args,env] of [
  [["node_modules/tsx/dist/cli.mjs","watch","server/index.ts"],process.env],
  [["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","5173","--strictPort"],frontendEnv],
]){const child=spawn(process.execPath,args,{stdio:"inherit",env,windowsHide:true,detached:process.platform!=="win32"});children.push(child);child.on("error",()=>stop(1));child.on("exit",code=>{if(!stopping)stop(code??1);});}
process.on("SIGINT",()=>stop());process.on("SIGTERM",()=>stop());
console.log(`Kindred Dominion: http://127.0.0.1:5173/ · backend loopback port ${port}. Ctrl+C stops both owned processes.`);
