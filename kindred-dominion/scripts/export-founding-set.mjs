import fs from "node:fs/promises";
import path from "node:path";
import {zipSync,strToU8} from "fflate";
import {digest} from "./asset-package.mjs";
export async function exportFoundingSet(content,directory){
  if(content.cards.length!==150||content.assets?.length!==150||content.assets.some(a=>a.approval!=="production"))throw Error("Split founding export requires the complete approved 150-card artwork release.");
  await fs.mkdir(directory,{recursive:true});const parts=[];
  for(let offset=0;offset<150;offset+=10){const assets=content.assets.slice(offset,offset+10),part=structuredClone(content);part.assets=assets;part.id=`${content.id}-part-${parts.length+1}`;for(const meta of Object.values(part.metadata))if(meta.artworkRef&&!assets.some(a=>a.id===meta.artworkRef.id&&a.revision===meta.artworkRef.revision))delete meta.artworkRef;
    const files={"content.json":strToU8(JSON.stringify(part)),"assets.json":strToU8(JSON.stringify({format:"kindred-dominion-assets",schema:1,contentId:part.id,assets}))};
    for(const asset of assets)for(const name of [`public/${asset.path}`,asset.source.path])files[name]=new Uint8Array(await fs.readFile(name));
    files["publication.json"]=strToU8(JSON.stringify({format:"kindred-dominion-publication",schema:1,engineVersion:content.engineVersion,contentId:part.id,approval:"production",files:Object.entries(files).map(([path,bytes])=>({path,bytes:bytes.length,sha256:digest(bytes)}))}));
    const bytes=zipSync(files,{level:6});if(bytes.length>60*1024*1024)throw Error("Publication member exceeds the existing package limit.");const file=`part-${String(parts.length+1).padStart(2,"0")}.kindred.zip`;await fs.writeFile(path.join(directory,file),bytes);parts.push({file,bytes:bytes.length,sha256:digest(bytes)});
  }
  const index={format:"kindred-dominion-founding-artwork-set",schema:1,contentId:content.id,name:content.name,createdAt:content.createdAt,approval:"production",rosterSha256:digest(Buffer.from((await fs.readFile("docs/FOUNDING-KINDREDS-ARTWORK.md","utf8")).replace(/\r\n/g,"\n"))),parts};await fs.writeFile(path.join(directory,"set.json"),JSON.stringify(index,null,2)+"\n");return {index:path.join(directory,"set.json"),members:parts.length};
}
