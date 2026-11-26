import type { ContentPack, Workspace } from "./types";
import { foundingContent } from "./founding";
import { baselineContent } from "./baseline";
import { laboratoryContent, laboratoryScenarios } from "./laboratory";
const published = import.meta.glob("./published/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ContentPack>;
export function bundledVersions(): ContentPack[] {
  return [
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
      : laboratoryScenarios().filter(
          (s) => !workspace.scenarios.some((existing) => existing.id === s.id),
        );
  return missing.length || missingScenarios.length
    ? {
        ...workspace,
        versions: [...workspace.versions, ...missing],
        scenarios: [...workspace.scenarios, ...missingScenarios],
      }
    : workspace;
}
