import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import { project } from "./tooling.mjs";
import path from "node:path";
await mkdir(path.join(project, "tests/fixtures/artwork"), { recursive: true });
const source = await readFile(
  path.join(project, "artwork-source/validation/sprout-study.svg"),
);
await sharp(source)
  .png()
  .toFile(path.join(project, "tests/fixtures/artwork/test-sprout-source.png"));
console.log(
  "Created temporary validation illustration; no card text, statistics, borders or diagrams are baked into it.",
);
