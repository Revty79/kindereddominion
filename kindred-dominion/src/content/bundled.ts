import type { ContentPack, Workspace } from "./types";
import { foundingContent } from "./founding";
import { baselineContent } from "./baseline";
const published = import.meta.glob("./published/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ContentPack>;
export function bundledVersions(): ContentPack[] {
  return [
    foundingContent(baselineContent()),
    ...Object.values(published).map((p) => structuredClone(p)),
  ];
}
export function addBundledVersions(workspace: Workspace): Workspace {
  const missing = bundledVersions().filter(
    (p) => !workspace.versions.some((v) => v.id === p.id),
  );
  return missing.length
    ? { ...workspace, versions: [...workspace.versions, ...missing] }
    : workspace;
}
