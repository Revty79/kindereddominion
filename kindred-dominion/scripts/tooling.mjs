import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
export const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export async function loadTS(entry, name = "tool") {
  const directory = path.join(project, ".local", "tools");
  await mkdir(directory, { recursive: true });
  const outfile = path.join(directory, `${name}.mjs`);
  await build({
    entryPoints: [path.join(project, entry)],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    logLevel: "silent",
  });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}
