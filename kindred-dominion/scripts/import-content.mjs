import { mkdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { project } from "./tooling.mjs";
import { digest, readPackage } from "./asset-package.mjs";
export async function importPackage(
  file,
  options = {},
) {
  const bundle = await readPackage(path.resolve(file));
  return importValidatedBundle(bundle, options);
}
// Internal shared write/rollback path. Callers must first validate every package
// using readPackage; the bounded publication-set importer also checks assembly.
export async function importValidatedBundle(
  bundle,
  { root = project, replace = false, validateOnly = false } = {},
) {
  const destinations = new Map();
  for (const asset of bundle.manifest.assets)
    for (const name of [`public/${asset.path}`, asset.source.path])
      destinations.set(name, bundle.files[name]);
  const registryPath = path.join(root, "public/assets/manifest.json");
  let registry = {
    format: "kindred-dominion-asset-registry",
    schema: 1,
    assets: [],
  };
  try {
    registry = JSON.parse(await readFile(registryPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const asset of bundle.manifest.assets) {
    const duplicate = registry.assets.find(
      (a) => a.sha256 === asset.sha256 && a.id !== asset.id,
    );
    if (duplicate)
      throw new Error(
        `Duplicate artwork bytes already registered as ${duplicate.id}. Reuse that stable reference.`,
      );
    const existing = registry.assets.find(
      (a) => a.id === asset.id && a.revision === asset.revision,
    );
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset))
      throw new Error(
        "An existing immutable artwork revision has conflicting metadata.",
      );
    if (!existing) registry.assets.push(asset);
  }
  destinations.set(
    `src/content/published/${bundle.content.id}.json`,
    Buffer.from(JSON.stringify(bundle.content, null, 2) + "\n"),
  );
  destinations.set(
    "public/assets/manifest.json",
    Buffer.from(JSON.stringify(registry, null, 2) + "\n"),
  );
  for (const [relative, bytes] of destinations) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep))
      throw new Error("Asset escaped the repository.");
    try {
      const prior = await readFile(absolute);
      if (
        relative.startsWith("src/content/published/") &&
        JSON.stringify(JSON.parse(prior.toString("utf8"))) ===
          JSON.stringify(JSON.parse(Buffer.from(bytes).toString("utf8")))
      ) {
        destinations.set(relative, prior);
        continue;
      }
      if (
        digest(prior) !== digest(bytes) &&
        relative !== "public/assets/manifest.json" &&
        !replace
      )
        throw new Error(
          `${relative} already exists with different bytes. Publish a new content ID or use --replace after review; asset revision files are immutable.`,
        );
      if (
        ((relative.startsWith("public/assets/") &&
          relative !== "public/assets/manifest.json") ||
          relative.startsWith("artwork-source/")) &&
        digest(prior) !== digest(bytes)
      )
        throw new Error(
          "An immutable asset or source revision cannot be overwritten.",
        );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  if (validateOnly)
    return {
      content: bundle.content.id,
      assets: bundle.manifest.assets.length,
      files: [...destinations.keys()],
    };
  const staged = [];
  try {
    for (const [relative, bytes] of destinations) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.import-${process.pid}`;
      await writeFile(temp, bytes);
      staged.push({
        target,
        temp,
        prior: await readFile(target).catch((e) =>
          e.code === "ENOENT" ? null : Promise.reject(e),
        ),
      });
    }
    for (const entry of staged) await rename(entry.temp, entry.target);
  } catch (error) {
    for (const entry of staged) {
      if (entry.prior) await writeFile(entry.target, entry.prior);
      else {
        const { unlink } = await import("node:fs/promises");
        await unlink(entry.target).catch(() => {});
      }
      const { unlink } = await import("node:fs/promises");
      await unlink(entry.temp).catch(() => {});
    }
    throw error;
  }
  return {
    content: bundle.content.id,
    assets: bundle.manifest.assets.length,
    files: [...destinations.keys()],
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const file = process.argv[2];
    if (!file)
      throw new Error(
        "Usage: node scripts/import-content.mjs package.kindred.zip [--validate-only] [--replace]",
      );
    console.log(
      JSON.stringify(
        await importPackage(file, {
          replace: process.argv.includes("--replace"),
          validateOnly: process.argv.includes("--validate-only"),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
