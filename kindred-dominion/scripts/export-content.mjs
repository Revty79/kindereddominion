import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { project } from "./tooling.mjs";
import { digest } from "./asset-package.mjs";
import { validateRepositoryAssets } from "./validate-assets.mjs";
try {
  const id = process.argv[2],
    output = process.argv[3];
  if (!id || !output || !/^[a-z][a-z0-9-]{0,79}$/.test(id))
    throw new Error(
      "Usage: node scripts/export-content.mjs content-id output.kindred.zip",
    );
  await validateRepositoryAssets();
  const content = JSON.parse(
    await readFile(
      path.join(project, `src/content/published/${id}.json`),
      "utf8",
    ),
  );
  const files = {};
  files["content.json"] = strToU8(JSON.stringify(content, null, 2));
  files["assets.json"] = strToU8(
    JSON.stringify(
      {
        format: "kindred-dominion-assets",
        schema: 1,
        contentId: id,
        assets: content.assets ?? [],
      },
      null,
      2,
    ),
  );
  for (const asset of content.assets ?? [])
    for (const name of [`public/${asset.path}`, asset.source.path])
      files[name] = new Uint8Array(await readFile(path.join(project, name)));
  files["publication.json"] = strToU8(
    JSON.stringify(
      {
        format: "kindred-dominion-publication",
        schema: 1,
        engineVersion: content.engineVersion,
        contentId: id,
        approval: content.assets?.some((a) => a.approval === "testing")
          ? "testing"
          : "production",
        files: Object.entries(files).map(([path, bytes]) => ({
          path,
          bytes: bytes.length,
          sha256: digest(bytes),
        })),
      },
      null,
      2,
    ),
  );
  await writeFile(path.resolve(output), zipSync(files, { level: 6 }));
  console.log(`Exported ${id} with separate source and production artwork.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
