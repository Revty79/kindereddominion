import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { project } from "./tooling.mjs";
import { digest } from "./asset-package.mjs";
import { validateRepositoryAssets } from "./validate-assets.mjs";
try {
  const directory = path.resolve(project, process.argv[2] ?? "dist");
  const index = await readFile(path.join(directory, "index.html"), "utf8");
  if (index.includes("/src/main.tsx"))
    throw new Error("Expected compiled output, not development source.");
  await validateRepositoryAssets(project, {
    tracked: process.argv.includes("--tracked"),
  });
  const registry = JSON.parse(
    await readFile(path.join(project, "public/assets/manifest.json"), "utf8"),
  );
  for (const a of registry.assets)
    if (digest(await readFile(path.join(directory, a.path))) !== a.sha256)
      throw new Error(`Missing or corrupt compiled artwork: ${a.path}`);
  try {
    await access(path.join(directory, "artwork-source"));
    throw new Error(
      "Source masters must not be packaged into the browser output.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((e) =>
          e.isDirectory()
            ? walk(path.join(dir, e.name))
            : [path.join(dir, e.name)],
        ),
      )
    ).flat();
  }
  const scripts = (await walk(path.join(directory, "assets"))).filter((n) =>
    n.endsWith(".js"),
  );
  const developmentChunks = scripts.filter((n) =>
    /^(Studio-|worker-)/i.test(path.basename(n)),
  ).length;
  const playerOnly = process.argv.includes("--player");
  if (playerOnly) {
    if (developmentChunks)
      throw new Error(
        "Studio or simulation worker chunks were included in a player-only build.",
      );
    const text = (
      await Promise.all(scripts.map((n) => readFile(n, "utf8")))
    ).join("\n");
    if (text.includes("lab-bee") || text.includes("mechanics-laboratory-v1.3a"))
      throw new Error(
        "Development laboratory definitions were included in a player-only build.",
      );
  }
  console.log(
    JSON.stringify({
      artwork: registry.assets.length,
      checksumsMatch: true,
      sourceMastersIncluded: false,
      playerOnly,
      developmentChunks,
    }),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
