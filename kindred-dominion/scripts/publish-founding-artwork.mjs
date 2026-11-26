import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "@playwright/test";
import {digest} from "./asset-package.mjs";

if(!process.argv.includes("--approve-production-artwork"))throw Error("Explicit --approve-production-artwork is required for this owner-reviewed roster. Draft art must never be published automatically.");
const value=key=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
const url=value("url")??"http://127.0.0.1:5173",output=path.resolve(value("output")??".local/founding-artwork/publication"),id=value("id")??"founding-kindreds-artwork-v1";
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!/^founding-[a-z0-9-]+$/.test(id))throw Error("Use a local development URL and portable founding publication identifier.");
const text=await fs.readFile("docs/FOUNDING-KINDREDS-ARTWORK.md","utf8"),rows=[...text.matchAll(/^\| ([NMAUC]\d{3}) \| (.*?) \| `(.*?)` \| (.*?) \|/gm)].map(m=>({number:m[1],name:m[2],filename:m[3]}));
if(rows.length!==150)throw Error("Run the founding artwork audit before publication.");
await fs.mkdir(output,{recursive:true});const browser=await chromium.launch(),parts=[];
try{for(let offset=0;offset<rows.length;offset+=10){
  const file=`part-${String(parts.length+1).padStart(2,"0")}.kindred.zip`;
  if(process.argv.includes("--resume")){const bytes=await fs.readFile(path.join(output,file)).catch(e=>{if(e.code!=="ENOENT")throw e;});if(bytes){parts.push({file,sha256:digest(bytes),bytes:bytes.length});console.log(`Reusing member ${parts.length}/15; importer will revalidate it`);continue;}}
  const page=await browser.newPage();await page.route("**/__founding-publisher",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Founding artwork export</title>"}));await page.goto(`${url}/__founding-publisher`);
  const download=page.waitForEvent("download",{timeout:180000}).then(value=>({value}),error=>({error}));
  await page.evaluate(async({rows,id,file,part})=>{
    const {ownerContent}=await import(/* @vite-ignore */ "/src/content/owner.ts"),{importLocalArtwork}=await import(/* @vite-ignore */ "/src/assets/artwork.ts"),{createPublication}=await import(/* @vite-ignore */ "/src/assets/publication.ts");
    const pack=ownerContent();
    for(const row of rows){const card=pack.cards.find(c=>c.collectible.number===row.number);if(!card||card.name!==row.name)throw Error("Roster identity conflict");const response=await fetch(`/artwork-source/cards/${card.kindred.toLowerCase()}/${row.filename}`);if(!response.ok)throw Error("Source artwork unavailable");const imported=await importLocalArtwork(new File([await response.blob()],row.filename,{type:"image/png"}));Object.assign(pack.metadata[card.id],imported,{artworkId:card.id,artworkApproval:"production"});}
    const bytes=await createPublication(pack,`${id}-part-${part}`,"Founding artwork publication member","production",true),link=document.createElement("a"),objectURL=URL.createObjectURL(new Blob([bytes],{type:"application/zip"}));link.href=objectURL;link.download=file;link.click();setTimeout(()=>URL.revokeObjectURL(objectURL),1000);
  },{rows:rows.slice(offset,offset+10),id,file,part:parts.length+1});
  const target=path.join(output,file);const received=await download;if(received.error)throw received.error;await received.value.saveAs(target);const bytes=await fs.readFile(target);if(bytes.length>60*1024*1024)throw Error("Publication member exceeds the existing importer limit");parts.push({file,sha256:digest(bytes),bytes:bytes.length});await page.close();console.log(`Exported ${parts.length}/15 Studio publication members`);
}}finally{await browser.close();}
const index={format:"kindred-dominion-founding-artwork-set",schema:1,contentId:id,name:"The Founding Kindreds — Owner Design V1 · Founding artwork",createdAt:value("created-at")??"2026-11-26T00:00:00Z",approval:"production",rosterSha256:digest(Buffer.from(text.replace(/\r\n/g,"\n"))),parts};
await fs.writeFile(path.join(output,"set.json"),JSON.stringify(index,null,2)+"\n");console.log(JSON.stringify({index:path.join(output,"set.json"),members:parts.length}));
