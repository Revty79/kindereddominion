import type { ContentPack, Workspace } from "./types";
import { foundingContent } from "./founding";
import { baselineContent } from "./baseline";
import { laboratoryContent, laboratoryScenarios } from "./laboratory";
import { ownerContent, OWNER_CONTENT_ID } from "./owner";
import { currentOwnerContent, CURRENT_OWNER_CONTENT_ID } from "./current";
import { ownerReadabilityScenarios } from "./owner-scenarios";
const published = import.meta.glob("./published/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ContentPack>;
export function bundledVersions(): ContentPack[] {
  return [
    ownerContent(),
    foundingContent(baselineContent()),
    ...(import.meta.env.VITE_STUDIO === "0" ? [] : [laboratoryContent()]),
    ...Object.values(published).map((p) => structuredClone(p)),
  ];
}
export function addBundledVersions(workspace: Workspace): Workspace {
  const missing = bundledVersions().filter(
    (p) => !workspace.versions.some((v) => v.id === p.id),
  );
  const missingScenarios =
    import.meta.env.VITE_STUDIO === "0"
      ? []
      : [...laboratoryScenarios(), ...ownerReadabilityScenarios()].filter(
          (s) => !workspace.scenarios.some((existing) => existing.id === s.id),
        );
  const installingOwner = missing.some(p => p.id === OWNER_CONTENT_ID);
  const installingArtwork = missing.some(p => p.id === CURRENT_OWNER_CONTENT_ID);
  // An untouched new workspace starts with the owner catalog. Existing drafts stay intact.
  const fresh = workspace.revision === 0 && workspace.replays.length === 0 && workspace.scenarios.length === 0 &&
    JSON.stringify(workspace.working.cards) === JSON.stringify(foundingContent(baselineContent()).cards);
  return missing.length || missingScenarios.length
    ? {
        ...workspace,
        versions: [...workspace.versions, ...missing],
        scenarios: [...workspace.scenarios, ...missingScenarios],
        ...(installingOwner ? { activeVersion: OWNER_CONTENT_ID } : {}),
        ...(installingOwner && fresh ? { working: { ...ownerContent(), id: "working", name: "Working drafts", kind: "draft" as const } } : {}),
        ...(installingArtwork && (installingOwner || workspace.activeVersion===OWNER_CONTENT_ID) ? { activeVersion: CURRENT_OWNER_CONTENT_ID } : {}),
        ...(installingArtwork && fresh ? {working:{...currentOwnerContent(),id:"working",name:"Working drafts",kind:"draft" as const}} : {}),
      }
    : workspace;
}
