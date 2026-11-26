import { loadTS, project } from "./tooling.mjs";
process.chdir(project);
await loadTS("scripts/owner-validation.ts", "owner-validation");
