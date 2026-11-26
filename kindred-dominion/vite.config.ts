import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { selectedPlayerContent, selectedPlayerAssets } from "./scripts/player-content";
const playerOnly = process.env.VITE_STUDIO === "0";
const root = process.cwd();
export default defineConfig({
  base: "./",
  publicDir: playerOnly ? false : "public",
  server: { fs:{deny:["**/.env","**/.env.*","**/*.{crt,pem,key}","**/.git/**","**/.local/**","**/server/**","**/server-dist/**","**/backups/**","**/*.{dump,backup,private}"]}, proxy: {"/api":{target:process.env.KINDRED_API_TARGET??"http://127.0.0.1:3001",changeOrigin:false}}, watch: { ignored: ["**/.local/**", "**/artwork-source/**", "**/docs/**", "**/server-dist/**", "**/dist/**", "**/dist-player/**", "**/test-results/**", "**/playwright-report/**"] } },
  preview:{proxy:{"/api":{target:process.env.KINDRED_API_TARGET??"http://127.0.0.1:3001",changeOrigin:false}}},
  plugins: [
    react(),
    {
      name: "kindred-approved-player-content",
      resolveId(id) { if (id === "virtual:kindred-player-content") return "\0kindred-player-content"; },
      async load(id) { if (id === "\0kindred-player-content") return `export default ${JSON.stringify(await selectedPlayerContent(root))};`; },
      async generateBundle() {
        if (!playerOnly) return;
        const content = await selectedPlayerContent(root);
        const assets = await selectedPlayerAssets(root, content);
        for (const asset of assets) this.emitFile({ type: "asset", fileName: asset.path, source: await readFile(path.join(root, "public", asset.path)) });
        this.emitFile({ type: "asset", fileName: "assets/manifest.json", source: JSON.stringify({ format: "kindred-dominion-player-assets", schema: 1, contentVersion: content.id, assets }, null, 2) });
      },
    },
    {
      name: "kindred-local-artwork-masters",
      apply: "serve",
      configureServer(server) {
        if (playerOnly) return;
        server.middlewares.use(
          "/__studio/artwork-source/",
          async (request, response) => {
            try {
              if (request.method !== "GET") {
                response.statusCode = 405;
                response.end();
                return;
              }
              const relative = decodeURIComponent(
                (request.url ?? "").split("?")[0],
              ).replace(/^\//, "");
              if (
                !/^([a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|webp|svg)$/.test(
                  relative,
                ) ||
                relative.split("/").includes("..")
              )
                throw new Error("Invalid source path.");
              const root = await realpath(path.resolve("artwork-source")),
                file = await realpath(path.resolve(root, relative)),
                within = path.relative(root, file);
              if (within.startsWith("..") || path.isAbsolute(within))
                throw new Error("Source path escaped its root.");
              const bytes = await readFile(file);
              response.setHeader("Content-Type", "application/octet-stream");
              response.setHeader("Cache-Control", "no-store");
              response.end(bytes);
            } catch {
              response.statusCode = 404;
              response.end("Artwork source is unavailable.");
            }
          },
        );
      },
    },
  ],
  test: { include: ["tests/**/*.test.ts"] },
});
