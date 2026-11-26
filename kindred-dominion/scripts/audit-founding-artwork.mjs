import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {digest} from "./asset-package.mjs";
import {loadTS} from "./tooling.mjs";

const rosterFile="docs/FOUNDING-KINDREDS-ARTWORK.md",text=await fs.readFile(rosterFile,"utf8");
const rows=[...text.matchAll(/^\| ([NMAUC]\d{3}) \| (.*?) \| `(.*?)` \| (.*?) \|/gm)].map(m=>({number:m[1],name:m[2],filename:m[3],predecessors:m[4].match(/[NMAUC]\d{3}/g)??[]}));
const {ownerContent}=await loadTS("src/content/owner.ts","artwork-audit"),pack=ownerContent();
if(rows.length!==150||new Set(rows.map(r=>r.number)).size!==150)throw Error("Authoritative roster must contain all 150 unique founding identities.");
const images=[],hashes=new Set(),pixelHashes=new Set(),warnings=[];
for(const card of pack.cards){
  const number=card.collectible.number,row=rows.find(r=>r.number===number);
  if(!row||row.name!==card.name||row.filename!==`${number}.png`||JSON.stringify(row.predecessors.map(x=>x.toLowerCase()).sort())!==JSON.stringify([...(card.prerequisite?.definitions??[])].sort()))throw Error(`Roster/executable identity or relationship conflict: ${number}`);
  const file=`artwork-source/cards/${card.kindred.toLowerCase()}/${row.filename}`,bytes=await fs.readFile(file);
  const image=sharp(bytes,{failOn:"warning",limitInputPixels:40000000}),metadata=await image.metadata(),pixels=await image.clone().raw().toBuffer();
  if(metadata.format!=="png"||!metadata.width||!metadata.height||bytes.length>10*1024*1024)throw Error(`Invalid source image: ${file}`);
  const sha256=digest(bytes),pixelSha256=digest(pixels);if(hashes.has(sha256)||pixelHashes.has(pixelSha256))throw Error(`Duplicate source illustration: ${file}`);hashes.add(sha256);pixelHashes.add(pixelSha256);
  if(Math.abs(metadata.width/metadata.height-.75)>.01)warnings.push({number,issue:"Aspect ratio differs from preferred 3:4; preserve proportions without cropping the master."});
  images.push({number,cardId:card.id,name:card.name,kindred:card.kindred,source:file,sha256,pixelSha256,bytes:bytes.length,width:metadata.width,height:metadata.height});
}
for(const kindred of pack.collections){const dir=`artwork-source/cards/${kindred.id.toLowerCase()}`;for(const file of await fs.readdir(dir))if(/^[NMAUC]\d+\.png$/i.test(file)&&!images.some(i=>i.source===`${dir}/${file}`))throw Error(`Unexpected or case-mismatched source filename: ${dir}/${file}`);}
const report={roster:rosterFile,rosterSha256:digest(Buffer.from(text.replace(/\r\n/g,"\n"))),images:images.length,bytes:images.reduce((n,i)=>n+i.bytes,0),counts:Object.fromEntries(pack.collections.map(k=>[k.id,images.filter(i=>i.kindred===k.id).length])),missing:0,duplicates:0,invalidFormats:0,identityConflicts:0,warnings,inventory:images};
const output=process.argv[2]??".local/founding-artwork/inventory.json";await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({...report,inventory:undefined,warnings:report.warnings.length}));
