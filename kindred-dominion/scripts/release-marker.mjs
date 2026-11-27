import fs from "node:fs/promises";
import path from "node:path";
const [directory,revision,kind="player"]=process.argv.slice(2);
if(!["dist-player","dist-control"].includes(directory)||!/^([0-9a-f]{40})$/.test(revision??""))throw Error("Docker release packaging requires the full reviewed VCS_REF.");
const version=JSON.parse(await fs.readFile("package.json","utf8")).version;
if(directory==="dist-control"){
  const file=path.join(directory,"control-manifest.json"),manifest=JSON.parse(await fs.readFile(file,"utf8"));manifest.revision=revision;await fs.writeFile(file,JSON.stringify(manifest,null,2));
}else{
  await fs.mkdir(path.join(directory,".well-known"),{recursive:true});
  await fs.writeFile(path.join(directory,".well-known/kindred-release.json"),JSON.stringify({format:"kindred-release",schema:1,revision,version,kind},null,2));
}
