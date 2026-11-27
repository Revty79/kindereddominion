import {hasRegisteredPlayerIdentities} from "../src/content/founding-identities";
import fs from "node:fs/promises";
import path from "node:path";
import type {PoolClient} from "pg";
import type {ContentPack} from "../src/content/types";
import {ownerContent,collectibleRegistry} from "../src/content/owner";
import {currentOwnerContent,CURRENT_OWNER_CONTENT_ID} from "../src/content/current";
import {baselineContent} from "../src/content/baseline";
import {foundingContent} from "../src/content/founding";
import {laboratoryContent} from "../src/content/laboratory";
import {validatePack} from "../src/content/validation";
import {collectibleParts,gameplayFingerprint} from "../src/engine/identity";
import {transaction,type DB} from "./db";
import {digest} from "./security";
import {reject} from "./errors";
export async function activeContent(db:DB|PoolClient):Promise<ContentPack>{const {rows:[r]}=await db.query("SELECT v.pack FROM kd.content_selection s JOIN kd.content_version v ON v.id=s.version_id WHERE singleton");if(!r)reject(503,"catalog_unavailable","Official content is not initialized.");return r.pack;}
export async function contentVersion(db:DB|PoolClient,id:string):Promise<ContentPack>{const {rows:[r]}=await db.query("SELECT pack FROM kd.content_version WHERE id=$1",[id]);if(!r)reject(404,"content_missing","Content version was not found.");return r.pack;}
export async function publishContent(pool:DB,pack:ContentPack,channel:"official"|"archived"|"development",activate=false,root=process.cwd(),registry=collectibleRegistry()){
  const issues=validatePack(pack).filter(i=>i.severity==="error");if(issues.length)reject(400,"invalid_content","Content failed the shared engine/content validators.");
  if(channel==="official"&&(!pack.cards.length||pack.cards.some(c=>!c.collectible)))reject(400,"missing_identity","Official cards require permanent collectible identities.");
  const manifest=JSON.parse(await fs.readFile(path.join(root,"public/assets/manifest.json"),"utf8"));
  for(const metadata of Object.values(pack.metadata)){
    if(metadata.artwork||metadata.sourceArtwork)reject(400,"local_artwork","Repository publication cannot contain browser-local artwork.");
    if(metadata.artworkRef){const asset=manifest.assets.find((a:any)=>a.id===metadata.artworkRef!.id&&a.revision===metadata.artworkRef!.revision);
      if(!asset)reject(400,"missing_artwork","Artwork reference is missing from the repository manifest.");
      if(channel==="official"&&asset.approval!=="production")reject(400,"unapproved_artwork","Ordinary player content requires explicit production artwork approval.");
      for(const [relative,expected]of [[`public/${asset.path}`,asset.sha256],[asset.source.path,asset.source.sha256]]){const file=path.resolve(root,relative);if(path.relative(root,file).startsWith("..")||path.isAbsolute(path.relative(root,file)))reject(400,"unsafe_asset_path","Artwork must remain inside the repository.");let bytes;try{bytes=await fs.readFile(file);}catch{reject(400,"missing_artwork_file","A referenced artwork file or source master is missing.");}if((await import("node:crypto")).createHash("sha256").update(bytes).digest("hex")!==expected)reject(400,"corrupt_artwork","Artwork checksum differs from its approved manifest.");}
    }
  }
  return transaction(pool,async c=>{
    await c.query("SELECT pg_advisory_xact_lock(134529431)");
    if(channel==="official"){
      if(new Set(registry.map(r=>r.number)).size!==registry.length||new Set(registry.map(r=>r.gameplayId)).size!==registry.length)reject(409,"registry_conflict","The permanent registry contains duplicate assignments.");
      for(const entry of registry){
        const parts=collectibleParts(entry.number);if(!parts||entry.gameplayId!==entry.number.toLowerCase())reject(400,"invalid_registry","Permanent registry identifiers are invalid.");
        const {rows:[stored]}=await c.query("SELECT * FROM kd.card_identity WHERE id=$1 OR collectible_number=$2 FOR UPDATE",[entry.gameplayId,entry.number]);
        if(stored&&(stored.id!==entry.gameplayId||stored.collectible_number!==entry.number||stored.kindred!==entry.kindred||stored.set_id!==entry.setId))reject(409,"registry_conflict","A permanent or retired assignment cannot be replaced.");
        if(!stored)await c.query("INSERT INTO kd.card_identity(id,collectible_number,prefix,serial,kindred,set_id,expansion_id,retired) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[entry.gameplayId,entry.number,parts.prefix,parts.serial,entry.kindred,entry.setId,entry.expansionId,entry.retired]);
        else if(entry.retired&&!stored.retired)await c.query("UPDATE kd.card_identity SET retired=true WHERE id=$1",[entry.gameplayId]);
      }
      for(const card of pack.cards)if(!registry.some(r=>r.gameplayId===card.collectible?.gameplayId&&r.number===card.collectible.number&&r.kindred===card.kindred&&r.setId===card.collectible.setId))reject(409,"unregistered_collectible","Assign official cards in the reviewed permanent registry before publishing.");
    }
    const checksum=digest(pack),{rows:[previous]}=await c.query("SELECT digest,channel FROM kd.content_version WHERE id=$1",[pack.id]);
    if(previous&&previous.digest!==checksum)reject(409,"immutable_content","An existing content version cannot be rewritten. Publish a new version.");
    if(previous&&previous.channel!==channel)reject(409,"content_channel","A content version's publication channel cannot be silently changed.");
    if(!previous){
      await c.query("INSERT INTO kd.content_version(id,digest,engine_version,channel,pack) VALUES($1,$2,$3,$4,$5)",[pack.id,checksum,pack.engineVersion,channel,pack]);
      for(const card of pack.cards){
        const id=card.collectible?.gameplayId??`legacy:${pack.id}:${card.id}`,number=card.collectible?.number??null,parts=number?collectibleParts(number):null;
        const {rows:[existing]}=await c.query("SELECT * FROM kd.card_identity WHERE id=$1 OR ($2::text IS NOT NULL AND collectible_number=$2) FOR UPDATE",[id,number]);
        if(parts){const {rows:[namespace]}=await c.query("SELECT kindred,prefix FROM kd.card_identity WHERE prefix=$1 OR (kindred=$2 AND prefix IS NOT NULL) LIMIT 1",[parts.prefix,card.kindred]);if(namespace&&(namespace.kindred!==card.kindred||namespace.prefix!==parts.prefix))reject(409,"collectible_namespace","A Kindred's permanent collectible prefix cannot be reassigned.");}
        if(existing&&(existing.id!==id||existing.collectible_number!==number||existing.kindred!==card.kindred||existing.set_id!==(card.collectible?.setId??"legacy")||existing.retired&&channel==="official"))reject(409,"identity_conflict","A permanent or retired collectible assignment conflicts with this publication.");
        if(!existing)await c.query("INSERT INTO kd.card_identity(id,collectible_number,prefix,serial,kindred,set_id,expansion_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,number,parts?.prefix??null,parts?.serial??null,card.kindred,card.collectible?.setId??"legacy",card.collectible?.expansionId??pack.id]);
        const revision=card.collectible?.definitionRevision??1;
        const {rows:[last]}=await c.query("SELECT definition_revision,definition FROM kd.card_revision WHERE card_id=$1 ORDER BY definition_revision DESC LIMIT 1",[id]);
        if(last&&(revision<last.definition_revision||gameplayFingerprint(card)!==gameplayFingerprint(last.definition)&&revision<=last.definition_revision))reject(409,"revision_required","Changed gameplay requires a greater definition revision.");
        await c.query("INSERT INTO kd.card_revision(version_id,card_id,definition_revision,display_name,definition,metadata) VALUES($1,$2,$3,$4,$5,$6)",[pack.id,id,revision,card.name,card,pack.metadata[card.id]]);
        if(card.collectible)await c.query("INSERT INTO kd.edition(id,card_id,edition) VALUES($1,$2,$3) ON CONFLICT(card_id,edition) DO NOTHING",[`${id}:${card.collectible.edition}`,id,card.collectible.edition]);
      }
    }
    if(activate){if(channel!=="official")reject(400,"unpublished_content","Only official content may become the ordinary active catalog.");if((await c.query("SELECT id FROM kd.card_identity WHERE retired AND id=ANY($1)",[pack.cards.map(x=>x.collectible?.gameplayId??x.id)])).rowCount)reject(409,"retired_content","A release containing retired cards cannot be activated for new ordinary matches.");await c.query("INSERT INTO kd.content_selection(singleton,version_id) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET version_id=EXCLUDED.version_id",[pack.id]);}
    return {version:pack.id,imported:!previous,cards:pack.cards.length,digest:checksum};
  });
}
export async function seedRepository(pool:DB,root=process.cwd(),registry=collectibleRegistry()){
  const results=[];
  for(const pack of [baselineContent(),foundingContent(baselineContent()),laboratoryContent()])results.push(await publishContent(pool,pack,"archived",false,root,registry));
  for(const name of await fs.readdir(path.join(root,"src/content/published")))if(name.endsWith(".json")){const pack=JSON.parse(await fs.readFile(path.join(root,"src/content/published",name),"utf8"));const previous=(await pool.query("SELECT channel FROM kd.content_version WHERE id=$1",[pack.id])).rows[0];const channel=previous?.channel??(pack.id===CURRENT_OWNER_CONTENT_ID||hasRegisteredPlayerIdentities(pack,registry)?"official":"archived");results.push(await publishContent(pool,pack,channel,false,root,registry));}
  results.push(await publishContent(pool,ownerContent(),"official",false,root,registry));
  const {rows}=await pool.query("SELECT 1 FROM kd.content_selection");if(!rows.length)await publishContent(pool,currentOwnerContent(),"official",true,root,registry);
  return results;
}
