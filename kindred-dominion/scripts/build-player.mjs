import { spawnSync } from "node:child_process";
import { project } from "./tooling.mjs";
const commands = [
  ["scripts/validate-assets.mjs"],
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build", "--outDir", "dist-player"],
  ["scripts/verify-build.mjs", "dist-player", "--player", ...(process.argv.includes("--source-archive") ? [] : ["--tracked"])],
];
for (const args of commands) {
  const result = spawnSync(process.execPath, args, { cwd: project, env: { ...process.env, VITE_STUDIO: "0" }, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
