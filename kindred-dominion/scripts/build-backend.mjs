import {build} from "esbuild";
import fs from "node:fs";
await build({entryPoints:{index:"server/index.ts",cli:"server/cli.ts"},bundle:true,platform:"node",target:"node24",format:"esm",packages:"external",outdir:"server-dist",outExtension:{".js":".mjs"}});
fs.cpSync("server/migrations","server-dist/migrations",{recursive:true});
console.log("Built backend and CLI without embedding environment configuration.");
