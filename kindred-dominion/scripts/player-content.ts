import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ownerContent } from "../src/content/owner";
import { currentOwnerContent } from "../src/content/current";
import { validatePack } from "../src/content/validation";
import type { ContentPack } from "../src/content/types";
import type { OfficialAsset } from "../src/assets/types";

export async function selectedPlayerContent(root: string): Promise<ContentPack> {
  let content = currentOwnerContent();
  const selected = process.env.VITE_PLAYER_CONTENT_ID;
  if (selected && selected !== content.id) {
    const candidates = [ownerContent(),...await Promise.all((await readdir(path.join(root, "src/content/published"))).filter(n => n.endsWith(".json")).map(async n => JSON.parse(await readFile(path.join(root, "src/content/published", n), "utf8")) as ContentPack))];
    const matches = candidates.filter(p => p.id === selected);
    if (matches.length !== 1) throw new Error("Select exactly one committed published player content version.");
    content = matches[0];
  }
  const errors = validatePack(content).filter(i => i.severity === "error");
  if (errors.length) throw new Error(errors.map(i => i.message).join("\n"));
  const founding = ownerContent();
  if (content.cards.length !== 150 || content.cards.some(c => !founding.cards.some(f => f.id === c.id && f.collectible!.number === c.collectible?.number)))
    throw new Error("This tester build requires the 150 stable owner-designed collectible identities.");
  for (const card of content.cards) {
    const metadata = content.metadata[card.id];
    if (metadata.artwork || metadata.sourceArtwork) throw new Error(`${card.id}: local artwork cannot be shipped in a tester build. Publish an approved repository reference first.`);
    if (metadata.artworkRef) {
      const asset = content.assets?.find(a => a.id === metadata.artworkRef!.id && a.revision === metadata.artworkRef!.revision);
      if (!asset || asset.approval !== "production") throw new Error(`${card.id}: tester artwork requires explicit production approval.`);
    }
  }
  return content;
}

export async function selectedPlayerAssets(root: string, content: ContentPack): Promise<OfficialAsset[]> {
  const registry = JSON.parse(await readFile(path.join(root, "public/assets/manifest.json"), "utf8"));
  const ids = new Set(["kindred-art-fallback", "kindred-brand-crest"]);
  const references = Object.values(content.metadata).flatMap(m => m.artworkRef ? [m.artworkRef] : []);
  const assets: OfficialAsset[] = registry.assets.filter((a: OfficialAsset) => a.approval === "production" || ids.has(a.id) || references.some(r => r.id === a.id && r.revision === a.revision));
  for (const reference of references) if (!assets.some(a => a.id === reference.id && a.revision === reference.revision && a.approval === "production")) throw new Error("Approved artwork is missing from the repository registry.");
  return assets;
}
