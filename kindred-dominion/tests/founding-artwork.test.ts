import {expect,it} from "vitest";
import {currentOwnerContent,CURRENT_OWNER_CONTENT_ID} from "../src/content/current";
import {ownerContent,OWNER_CONTENT_ID} from "../src/content/owner";
import {initialWorkspace} from "../src/content/baseline";
import {addBundledVersions} from "../src/content/bundled";
import {validatePack} from "../src/content/validation";

it("packages all 150 illustrations without changing executable owner definitions, decks or evolution rules",()=>{
  const release=currentOwnerContent(),old=ownerContent();
  for(const key of ["cards","decks","rulesets","collections","engineVersion"] as const)expect(release[key]).toEqual(old[key]);
  expect(validatePack(release).filter(i=>i.severity==="error")).toEqual([]);expect(release.assets).toHaveLength(150);
  for(const card of release.cards){const meta=release.metadata[card.id],asset=release.assets!.find(a=>a.id===meta.artworkRef?.id&&a.revision===meta.artworkRef.revision);expect(asset?.id).toBe(card.collectible!.artworkId);expect(asset?.approval).toBe("production");expect(asset?.mime).toBe("image/webp");expect(meta.artwork).toBe("");expect(meta.sourceArtwork).toBeUndefined();}
});
it("starts fresh workspaces with complete artwork and preserves historical owner content",()=>{
  const workspace=addBundledVersions(initialWorkspace());expect(workspace.activeVersion).toBe(CURRENT_OWNER_CONTENT_ID);expect(workspace.working.metadata.n001.artworkRef).toBeDefined();expect(workspace.versions.find(v=>v.id===OWNER_CONTENT_ID)).toEqual(ownerContent());
});
it("upgrades ordinary owner new-match selection while preserving drafts and deliberate historical selection",()=>{
  const workspace=initialWorkspace();workspace.versions.push(ownerContent());workspace.activeVersion=OWNER_CONTENT_ID;workspace.working.cards[0].name="My unfinished draft";workspace.revision=7;const draft=structuredClone(workspace.working);
  const upgraded=addBundledVersions(workspace);expect(upgraded.activeVersion).toBe(CURRENT_OWNER_CONTENT_ID);expect(upgraded.working).toEqual(draft);expect(workspace.versions.some(v=>v.id===CURRENT_OWNER_CONTENT_ID)).toBe(false);
  workspace.activeVersion="v1.1-baseline";expect(addBundledVersions(workspace).activeVersion).toBe("v1.1-baseline");
});
