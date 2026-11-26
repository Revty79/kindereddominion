import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { project, loadTS } from "./tooling.mjs";
import { digest, safePath, validateImage } from "./asset-package.mjs";
export async function validateRepositoryAssets(
  root = project,
  { tracked = false } = {},
) {
  const registry = JSON.parse(
    await readFile(path.join(root, "public/assets/manifest.json"), "utf8"),
  );
  if (
    registry.format !== "kindred-dominion-asset-registry" ||
    registry.schema !== 1 ||
    !Array.isArray(registry.assets)
  )
    throw new Error("Invalid repository asset registry.");
  const paths = new Set(),
    ids = new Set(),
    hashes = new Set();
  for (const asset of registry.assets) {
    const key = `${asset.id}@${asset.revision}`;
    if (ids.has(key) || paths.has(asset.path) || hashes.has(asset.sha256))
      throw new Error(
        "Duplicate asset identity or path in repository registry.",
      );
    ids.add(key);
    paths.add(asset.path);
    hashes.add(asset.sha256);
    for (const [relative, sha, size, mime] of [
      [`public/${asset.path}`, asset.sha256, asset.bytes, asset.mime],
      [
        asset.source.path,
        asset.source.sha256,
        asset.source.bytes,
        asset.source.mime,
      ],
    ]) {
      safePath(relative);
      const bytes = await readFile(path.join(root, relative));
      if (digest(bytes) !== sha || bytes.length !== size)
        throw new Error(`Asset checksum mismatch: ${relative}`);
      await validateImage(bytes, mime, relative);
      if (tracked)
        execFileSync("git", ["ls-files", "--error-unmatch", "--", relative], {
          cwd: root,
          stdio: "pipe",
        });
    }
  }
  const { validatePack } = await loadTS(
    "src/content/validation.ts",
    "content-validation",
  );
  const directory = path.join(root, "src/content/published");
  const names = await readdir(directory).catch(() => []);
  let contents = 0;
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const content = JSON.parse(
      await readFile(path.join(directory, name), "utf8"),
    );
    const errors = validatePack(content).filter((i) => i.severity === "error");
    if (errors.length)
      throw new Error(
        `Invalid packaged content: ${name}: ${errors.map((i) => i.message).join("; ")}`,
      );
    for (const meta of Object.values(content.metadata)) {
      if (meta.artwork || meta.sourceArtwork)
        throw new Error(`Embedded artwork in ${name}`);
      if (
        meta.artworkRef &&
        !ids.has(`${meta.artworkRef.id}@${meta.artworkRef.revision}`)
      )
        throw new Error(`Broken artwork reference in ${name}`);
    }
    for (const asset of content.assets ?? []) {
      const registered = registry.assets.find(
        (a) => a.id === asset.id && a.revision === asset.revision,
      );
      if (JSON.stringify(registered) !== JSON.stringify(asset))
        throw new Error(`Historical artwork manifest changed for ${asset.id}.`);
    }
    contents++;
    if (tracked)
      execFileSync(
        "git",
        ["ls-files", "--error-unmatch", "--", `src/content/published/${name}`],
        { cwd: root, stdio: "pipe" },
      );
  }
  return {
    assets: registry.assets.length,
    publishedContents: contents,
    tracked,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        await validateRepositoryAssets(project, {
          tracked: process.argv.includes("--tracked"),
        }),
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
