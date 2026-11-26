import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "kindred-local-artwork-masters",
      apply: "serve",
      configureServer(server) {
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
