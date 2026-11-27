import {build} from "esbuild";
import fs from "node:fs";
for(const name of fs.readdirSync("server/migrations").filter(n=>n.endsWith(".cjs"))){const bytes=fs.readFileSync("server/migrations/"+name);if(bytes.includes(13)||bytes.subarray(0,3).equals(Buffer.from([239,187,191])))throw Error("Migration source portability failed: restore exact LF Git bytes before building.");}
await build({entryPoints:{index:"server/index.ts",cli:"server/cli.ts","commerce-tools":"scripts/stripe-tools.mts"},bundle:true,platform:"node",target:"node24",format:"esm",packages:"external",outdir:"server-dist",outExtension:{".js":".mjs"}});
fs.cpSync("server/migrations","server-dist/migrations",{recursive:true});
console.log("Built backend and CLI without embedding environment configuration.");
