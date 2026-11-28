import {afterEach,it,expect,vi} from "vitest";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {unzipSync} from "fflate";
import {baselineContent} from "../src/content/baseline";
import {createPublication} from "../src/assets/publication";
import {toDataURL} from "../src/assets/artwork";
import type {OfficialAsset} from "../src/assets/types";
const digest=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
async function fixture(local=true,changedSource=false){
 const source=new Uint8Array(await readFile("tests/fixtures/artwork/test-sprout-source.png")),production=new Uint8Array(await sharp(source).webp({quality:85}).toBuffer()),hash=digest(production),sourceHash=digest(source),pack=baselineContent();
 const asset:OfficialAsset={id:"test-sprout",revision:hash.slice(0,16),path:`assets/cards/nature/test-sprout-${hash.slice(0,16)}.webp`,sha256:hash,mime:"image/webp",bytes:production.length,width:240,height:320,category:"cards",approval:"testing",source:{path:`artwork-source/cards/nature/test-sprout-${sourceHash.slice(0,16)}.png`,sha256:sourceHash,mime:"image/png",bytes:source.length}};
 pack.assets=[asset];pack.metadata.sprout.artworkRef={id:asset.id,revision:asset.revision};
 if(local){pack.metadata.sprout.artwork=toDataURL(production,"image/webp");pack.metadata.sprout.sourceArtwork=toDataURL(changedSource?new Uint8Array(await sharp(source).png({compressionLevel:1}).toBuffer()):source,"image/png");pack.metadata.sprout.artworkApproval="testing";}
 vi.stubEnv("DEV",false);vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:240,height:320,close(){}})));const fetch=vi.fn(()=>{throw Error("Public output must not fetch source masters");});vi.stubGlobal("fetch",fetch);
 return {pack,asset,source,production,fetch};
}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("exports exact locally restored original bytes in compiled Studio while retaining the known artwork relationship",async()=>{const f=await fixture(),before=structuredClone(f.pack),zip=await createPublication(f.pack,"local-source-proof","Local source proof","testing",true),files=unzipSync(zip),content=JSON.parse(new TextDecoder().decode(files["content.json"]));expect(content.metadata.sprout.artworkRef).toEqual({id:f.asset.id,revision:f.asset.revision});expect(content.assets).toEqual([f.asset]);expect(files[f.asset.source.path]).toEqual(f.source);expect(files["public/"+f.asset.path]).toEqual(f.production);expect(content.metadata.sprout.sourceArtwork).toBeUndefined();expect(content.metadata.sprout.artwork).toBe("");expect(f.pack).toEqual(before);expect(f.fetch).not.toHaveBeenCalled();});
it("keeps public-build source fetching disabled when the original source is unavailable",async()=>{const f=await fixture(false);await expect(createPublication(f.pack,"missing-source-proof","Missing source","testing",true)).rejects.toThrow("Production builds do not expose source masters");expect(f.fetch).not.toHaveBeenCalled();});
it("refuses to substitute different original bytes for a historical source with the same runtime image",async()=>{const f=await fixture(true,true);expect(digest(new Uint8Array(Buffer.from(f.pack.metadata.sprout.sourceArtwork!.split(",")[1],"base64")))).not.toBe(f.asset.source.sha256);await expect(createPublication(f.pack,"changed-source-proof","Changed source","testing",true)).rejects.toThrow("Production builds do not expose source masters");expect(f.fetch).not.toHaveBeenCalled();});
