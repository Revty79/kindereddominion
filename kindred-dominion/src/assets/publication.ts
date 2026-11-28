import { zipSync, strToU8 } from "fflate";
import type { ContentPack } from "../content/types";
import { validatePack } from "../content/validation";
import type {
  AssetManifest,
  OfficialAsset,
  PublicationManifest,
} from "./types";
import { decodeImage, fromDataURL, identifyImage, sha256 } from "./artwork";
export async function createPublication(
  pack: ContentPack,
  id: string,
  name: string,
  approval: "testing" | "production",
  definitionsApproved: boolean,
): Promise<Uint8Array> {
  if (!definitionsApproved)
    throw new Error(
      "Explicitly approve these definition revisions for publication before exporting.",
    );
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(id) || !name.trim())
    throw new Error(
      "Choose a lowercase portable publication identifier and a name.",
    );
  const errors = validatePack(pack).filter((i) => i.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));
  const sourceBytes=(pack.assets??[]).reduce((n,a)=>n+a.bytes+a.source.bytes,0)+Object.values(pack.metadata).reduce((n,m)=>n+Math.ceil(((m.sourceArtwork?.length??0)+(m.artwork?.length??0))*3/4),0);
  if(sourceBytes>150*1024*1024)throw new Error("This collection exceeds a single portable package. Use repository export-content.mjs with --split, then import-founding-artwork.mjs.");
  const content = structuredClone(pack);
  content.id = id;
  content.name = name;
  content.kind = "testing";
  content.createdAt = new Date().toISOString();
  const files: Record<string, Uint8Array> = {};
  const assets: OfficialAsset[] = [];
  const hashes = new Map<string, OfficialAsset>();
  async function includeExisting(asset: OfficialAsset,local?:{production:Uint8Array;source:Uint8Array}) {
    if (assets.some((a) => a.id === asset.id && a.revision === asset.revision))
      return;
    if (
      asset.approval !== approval &&
      !(approval === "testing" && asset.approval === "production")
    )
      throw new Error(
        "Referenced artwork is not approved for this publication level.",
      );
    if (!local&&!import.meta.env.DEV)
      throw new Error(
        "Re-export packaged source masters from the repository with scripts/export-content.mjs, or import the source locally. Production builds do not expose source masters.",
      );
    for (const entry of [
      {
        name: `public/${asset.path}`,
        url: asset.path,
        hash: asset.sha256,
        size: asset.bytes,
        mime: asset.mime,
        local: local?.production,
      },
      {
        name: asset.source.path,
        url: `__studio/${asset.source.path}`,
        hash: asset.source.sha256,
        size: asset.source.bytes,
        mime: asset.source.mime,
        local: local?.source,
      },
    ]) {
      let bytes=entry.local;
      if(!bytes){
        const response = await fetch(`${import.meta.env.BASE_URL}${entry.url}`);
        if (!response.ok)throw new Error(`Missing repository artwork ${entry.name}.`);
        bytes = new Uint8Array(await response.arrayBuffer());
      }
      if (
        bytes.length !== entry.size ||
        (await sha256(bytes)) !== entry.hash ||
        identifyImage(bytes) !== entry.mime
      )
        throw new Error(`Corrupt repository artwork ${entry.name}.`);
      const decoded = await decodeImage(bytes, entry.mime);
      decoded.close();
      files[entry.name] = bytes;
    }
    assets.push(asset);
    hashes.set(asset.sha256, asset);
  }
  for (const card of content.cards) {
    const meta = content.metadata[card.id];
    if (!meta) continue;
    if (meta.artwork) {
      if (
        meta.artworkApproval !== approval &&
        !(approval === "testing" && meta.artworkApproval === "production")
      )
        throw new Error(
          `${card.name}: artwork is experimental or not approved for this publication level.`,
        );
      const production = fromDataURL(meta.artwork);
      if (production.mime !== "image/webp")
        throw new Error(
          `${card.name}: re-import local artwork to create an optimized WebP preview.`,
        );
      const source = fromDataURL(meta.sourceArtwork ?? meta.artwork);
      const sourceDecoded = await decodeImage(source.bytes, source.mime);
      sourceDecoded.close();
      const hash = await sha256(production.bytes);
      let asset = hashes.get(hash);
      if (!asset) {
        const known = pack.assets?.find((a) => a.sha256 === hash);
        if (known) {
          // An exact local source can restore a known immutable revision in a
          // compiled Studio. Never fetch private masters from public output or
          // replace a pinned source with different bytes sharing its pixels.
          const exactSource=await sha256(source.bytes)===known.source.sha256;
          await includeExisting(known,exactSource?{production:production.bytes,source:source.bytes}:undefined);
          asset = known;
        }
      }
      if (!asset) {
        const assetId = meta.artworkId || `art-${card.id}`;
        if (!/^[a-z][a-z0-9-]{0,79}$/.test(assetId))
          throw new Error(
            "Artwork identifiers must be lowercase and case-consistent.",
          );
        const revision = hash.slice(0, 16),
          folder = card.kindred.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const sourceHash = await sha256(source.bytes);
        const extension = {
          "image/png": "png",
          "image/jpeg": "jpg",
          "image/webp": "webp",
          "image/svg+xml": "svg",
        }[source.mime];
        const bitmap = await createImageBitmap(
          new Blob([production.bytes as BlobPart], { type: production.mime }),
        );
        asset = {
          id: assetId,
          revision,
          path: `assets/cards/${folder}/${assetId}-${revision}.webp`,
          sha256: hash,
          mime: "image/webp",
          bytes: production.bytes.length,
          width: bitmap.width,
          height: bitmap.height,
          source: {
            path: `artwork-source/cards/${folder}/${assetId}-${sourceHash.slice(0, 16)}.${extension}`,
            sha256: sourceHash,
            mime: source.mime,
            bytes: source.bytes.length,
          },
          category: "cards",
          approval,
        };
        bitmap.close();
        if (assets.some((a) => a.id === assetId && a.revision !== revision))
          throw new Error(
            `Artwork ID ${assetId} has two different revisions in one publication; use a distinct asset ID for distinct illustrations.`,
          );
        assets.push(asset);
        hashes.set(hash, asset);
        files[`public/${asset.path}`] = production.bytes;
        files[asset.source.path] = source.bytes;
      }
      meta.artworkRef = { id: asset.id, revision: asset.revision };
    } else if (meta.artworkRef) {
      const prior = pack.assets?.find(
        (a) =>
          a.id === meta.artworkRef!.id &&
          a.revision === meta.artworkRef!.revision,
      );
      if (!prior)
        throw new Error(
          `${card.name}: referenced official artwork is missing from the content manifest.`,
        );
      await includeExisting(prior);
    }
    meta.artwork = "";
    delete meta.sourceArtwork;
    delete meta.artworkApproval;
  }
  content.assets = assets;
  const manifest: AssetManifest = {
    format: "kindred-dominion-assets",
    schema: 1,
    contentId: id,
    assets,
  };
  files["content.json"] = strToU8(JSON.stringify(content, null, 2));
  files["assets.json"] = strToU8(JSON.stringify(manifest, null, 2));
  const publication: PublicationManifest = {
    format: "kindred-dominion-publication",
    schema: 1,
    contentId: id,
    engineVersion: pack.engineVersion,
    approval,
    files: await Promise.all(
      Object.entries(files).map(async ([path, bytes]) => ({
        path,
        bytes: bytes.length,
        sha256: await sha256(bytes),
      })),
    ),
  };
  files["publication.json"] = strToU8(JSON.stringify(publication, null, 2));
  const zipped=zipSync(files, { level: 6 });
  if(zipped.length>60*1024*1024)throw new Error("This export exceeds 60 MB. Export smaller batches or use the repository --split command.");
  return zipped;
}
