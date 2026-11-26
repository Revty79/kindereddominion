import { loadTS, project } from "./tooling.mjs";
process.chdir(project);
await loadTS("scripts/balance-entry.ts", "balance-entry");
