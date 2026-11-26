import { loadTS, project } from "./tooling.mjs";
process.chdir(project);
await loadTS("scripts/v1.3a-validation.ts", "v1.3a-validation");
