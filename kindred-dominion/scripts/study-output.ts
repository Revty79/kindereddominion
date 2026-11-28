import fs from "node:fs/promises";
import path from "node:path";
// Keep previous milestone evidence immutable when rerunning the same studies.
export async function studyDirectory(fallback="docs/v1.6a"){
 const directory=process.argv.find(a=>a.startsWith("--output="))?.slice(9)??fallback,root=path.resolve("docs"),resolved=path.resolve(directory);
 if(resolved===root||!resolved.startsWith(root+path.sep))throw Error("Study output must be a directory inside repository docs.");
 await fs.mkdir(resolved,{recursive:true});return directory;
}
