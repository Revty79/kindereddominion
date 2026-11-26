import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {digest,readPackage,safePath} from "./asset-package.mjs";
import {importValidatedBundle} from "./import-content.mjs";
import {loadTS} from "./tooling.mjs";
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;

// A set of ordinary Studio exports stays within the existing 60MB/150MB limits.
// Every member goes through the existing package validator. Only the complete
// assembled release is written, using the existing importer/rollback path.
export async function importFoundingArtwork(indexFile,options={}){
  const index=JSON.parse(await fs.readFile(indexFile,"utf8"));
  if(index.format!=="kindred-dominion-founding-artwork-set"||index.schema!==1||index.approval!=="production"||!Array.isArray(index.parts)||!index.parts.length||index.parts.length>150||!/^founding-[a-z0-9-]+$/.test(index.contentId)||typeof index.name!=="string"||!index.name.trim()||!Number.isFinite(Date.parse(index.createdAt)))throw Error("Invalid founding artwork publication set.");
  const {ownerContent}=await loadTS("src/content/owner.ts","founding-artwork-owner"),{validatePack}=await loadTS("src/content/validation.ts","founding-artwork-validation");
  if(index.rosterSha256!==digest(Buffer.from((await fs.readFile("docs/FOUNDING-KINDREDS-ARTWORK.md","utf8")).replace(/\r\n/g,"\n"))))throw Error("Publication set does not match the reviewed founding artwork roster.");
  const expected=ownerContent(),content=structuredClone(expected),files={},assets=[],assigned=new Set(),parts=new Set();
  if(index.contentId===expected.id)throw Error("Use a new artwork release identifier; the original owner catalog is immutable.");
  for(const part of index.parts){
    safePath(part.file);if(path.basename(part.file)!==part.file||parts.has(part.file))throw Error("Invalid or duplicate publication member.");parts.add(part.file);
    const file=path.join(path.dirname(indexFile),part.file),bytes=await fs.readFile(file);if(digest(bytes)!==part.sha256)throw Error("Publication member checksum mismatch.");
    const bundle=await readPackage(file);
    for(const key of ["cards","collections","decks","rulesets","engineVersion"])if(JSON.stringify(canonical(bundle.content[key]))!==JSON.stringify(canonical(expected[key])))throw Error("Artwork publication cannot change executable owner definitions, relationships, decks or rules.");
    if(bundle.publication.approval!=="production"||!bundle.manifest.assets.length)throw Error("All publication members require approved production artwork.");
    for(const card of expected.cards){const metadata=bundle.content.metadata[card.id];if(!metadata?.artworkRef)continue;
      if(assigned.has(card.id))throw Error("Duplicate collectible artwork assignment.");
      const asset=bundle.manifest.assets.find(a=>a.id===metadata.artworkRef.id&&a.revision===metadata.artworkRef.revision);
      if(!asset||asset.id!==card.collectible.artworkId||asset.approval!=="production")throw Error("Artwork must retain the card's established artwork identifier.");
      const original=`artwork-source/cards/${card.kindred.toLowerCase()}/${card.collectible.number}.png`;
      if(asset.source.sha256!==digest(await fs.readFile(original)))throw Error("Publication source differs from the preserved numbered original.");
      assigned.add(card.id);content.metadata[card.id]=structuredClone(metadata);content.metadata[card.id].notes="Owner founding illustration integrated; gameplay and balance remain unchanged.";assets.push(asset);
      for(const name of [`public/${asset.path}`,asset.source.path]){if(files[name]&&digest(files[name])!==digest(bundle.files[name]))throw Error("Conflicting immutable publication file.");files[name]=bundle.files[name];}
    }
  }
  if(assigned.size!==150||assets.length!==150||new Set(assets.map(a=>a.sha256)).size!==150)throw Error("Publication requires exactly one distinct illustration for each of the 150 founding cards.");
  content.id=index.contentId;content.name=index.name;content.createdAt=index.createdAt;content.assets=assets.sort((a,b)=>a.id.localeCompare(b.id));
  if(validatePack(content).some(i=>i.severity==="error"))throw Error("Assembled content failed shared validation.");
  return importValidatedBundle({content,files,manifest:{assets:content.assets}},options);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(!process.argv[2])throw Error("Usage: node scripts/import-founding-artwork.mjs set.json [--validate-only]");const result=await importFoundingArtwork(path.resolve(process.argv[2]),{validateOnly:process.argv.includes("--validate-only")});console.log(JSON.stringify({content:result.content,assets:result.assets,files:result.files.length}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
