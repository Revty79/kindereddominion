import { expect, it } from "vitest";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
import { identifyImage, sanitizeSVG } from "../src/assets/artwork";
import { baselineContent } from "../src/content/baseline";
import { validatePack } from "../src/content/validation";
// Node-only command modules are deliberately separate from browser TypeScript.
// @ts-ignore JavaScript CLI module
import { readPackage, safePath } from "../scripts/asset-package.mjs";
// @ts-ignore JavaScript CLI module
import { importPackage } from "../scripts/import-content.mjs";
// @ts-ignore JavaScript CLI module
import { validateRepositoryAssets } from "../scripts/validate-assets.mjs";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function fixture(change?: (data: any) => void) {
  const source = new Uint8Array(
    await readFile("tests/fixtures/artwork/test-sprout-source.png"),
  );
  const production = new Uint8Array(
    await sharp(source).webp({ quality: 85 }).toBuffer(),
  );
  const sha = hash(production),
    sourceSha = hash(source);
  const asset = {
    id: "test-sprout",
    revision: sha.slice(0, 16),
    path: `assets/cards/nature/test-sprout-${sha.slice(0, 16)}.webp`,
    sha256: sha,
    mime: "image/webp",
    bytes: production.length,
    width: 240,
    height: 320,
    category: "cards",
    source: {
      path: `artwork-source/cards/nature/test-sprout-${sourceSha.slice(0, 16)}.png`,
      sha256: sourceSha,
      mime: "image/png",
      bytes: source.length,
    },
    approval: "testing",
  };
  const content: any = baselineContent();
  content.id = "asset-test-v1";
  content.name = "Temporary artwork package";
  content.kind = "testing";
  content.assets = [asset];
  content.metadata.sprout.artworkRef = {
    id: asset.id,
    revision: asset.revision,
  };
  const data = {
    content,
    asset,
    source,
    production,
    extra: {} as Record<string, Uint8Array>,
  };
  await change?.(data);
  const files: Record<string, Uint8Array> = {
    "content.json": strToU8(JSON.stringify(data.content)),
    "assets.json": strToU8(
      JSON.stringify({
        format: "kindred-dominion-assets",
        schema: 1,
        contentId: content.id,
        assets: content.assets,
      }),
    ),
    [`public/${asset.path}`]: data.production,
    [asset.source.path]: data.source,
    ...data.extra,
  };
  files["publication.json"] = strToU8(
    JSON.stringify({
      format: "kindred-dominion-publication",
      schema: 1,
      contentId: content.id,
      engineVersion: content.engineVersion,
      approval: "testing",
      files: Object.entries(files).map(([path, bytes]) => ({
        path,
        sha256: hash(bytes),
        bytes: bytes.length,
      })),
    }),
  );
  await mkdir(".local/asset-tests", { recursive: true });
  const directory = await mkdtemp(path.resolve(".local/asset-tests/run-"));
  const file = path.join(directory, "test.kindred.zip");
  await writeFile(file, zipSync(files));
  return { file, directory, content, asset, files };
}
it("validates genuine PNG, JPEG, WebP and safe geometric SVG; rejects unsupported data", async () => {
  const png = await readFile("tests/fixtures/artwork/test-sprout-source.png");
  expect(identifyImage(png)).toBe("image/png");
  expect(identifyImage(await sharp(png).jpeg().toBuffer())).toBe("image/jpeg");
  expect(identifyImage(await sharp(png).webp().toBuffer())).toBe("image/webp");
  const svg = await readFile(
    "artwork-source/validation/sprout-study.svg",
    "utf8",
  );
  expect(sanitizeSVG(svg)).toContain("<svg");
  expect(identifyImage(new TextEncoder().encode(svg))).toBe("image/svg+xml");
  expect(() => identifyImage(new Uint8Array(20))).toThrow();
});
it.each([
  "<script>alert(1)</script>",
  "<foreignObject/>",
  '<path onload="alert(1)"/>',
  '<image href="https://example.com/image.png"/>',
  '<rect style="fill:url(https://example.com)"/>',
])("rejects unsafe SVG content: %s", (element) =>
  expect(() =>
    sanitizeSVG(
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">${element}</svg>`,
    ),
  ).toThrow(),
);
it("rejects SVG entity declarations and invalid namespaces", () => {
  expect(() =>
    sanitizeSVG('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg/>'),
  ).toThrow();
  expect(() => sanitizeSVG('<svg xmlns="https://example.com/"/>')).toThrow();
});
it("exports a complete portable package with separate sources and immutable asset references", async () => {
  const f = await fixture();
  const validated = await readPackage(f.file);
  expect(validated.content.cards).toHaveLength(30);
  expect(validated.content.metadata.sprout.artwork).toBe("");
  expect(validated.manifest.assets[0].path).toMatch(/\.webp$/);
  expect(Object.keys(validated.files)).toContain(f.asset.source.path);
  expect(
    validatePack(validated.content).filter((i) => i.severity === "error"),
  ).toEqual([]);
});
it("imports validated content, artwork and registry repeatably without touching unrelated files", async () => {
  const f = await fixture(),
    root = path.join(f.directory, "repository");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "owner.txt"), "preserve me");
  const first = await importPackage(f.file, { root });
  expect(first.assets).toBe(1);
  const before = await readFile(
    path.join(root, "public/assets/manifest.json"),
    "utf8",
  );
  await importPackage(f.file, { root });
  expect(
    await readFile(path.join(root, "public/assets/manifest.json"), "utf8"),
  ).toBe(before);
  expect(await readFile(path.join(root, "owner.txt"), "utf8")).toBe(
    "preserve me",
  );
  expect(await validateRepositoryAssets(root)).toMatchObject({
    assets: 1,
    publishedContents: 1,
  });
});
it("detects missing assets, corrupt pixels, wrong references and duplicate assets before any repository write", async () => {
  const variants = [
    (d: any) => {
      d.production = d.production.slice(0, 20);
      d.asset.bytes = d.production.length;
      d.asset.sha256 = hash(d.production);
      d.asset.revision = d.asset.sha256.slice(0, 16);
    },
    (d: any) => {
      d.content.metadata.sprout.artworkRef.id = "missing-art";
    },
    (d: any) => {
      d.content.assets.push({ ...d.asset });
    },
    (d: any) => {
      d.asset.mime = "image/png";
    },
  ];
  for (const change of variants) {
    const f = await fixture(change);
    const root = path.join(f.directory, "untouched");
    await expect(importPackage(f.file, { root })).rejects.toThrow();
    await expect(
      readFile(path.join(root, "public/assets/manifest.json")),
    ).rejects.toThrow();
  }
});
it("rejects external, traversal, uppercase and duplicate archive paths", async () => {
  for (const p of [
    "../escape.png",
    "/assets/a.png",
    "assets/Cards/a.png",
    "assets/cards/a\\b.png",
  ])
    expect(() => safePath(p)).toThrow();
  const f = await fixture((d) => {
    d.extra["../escape.png"] = new Uint8Array([1, 2, 3]);
  });
  await expect(readPackage(f.file)).rejects.toThrow();
});
it("retains older artwork when a card receives a new immutable revision", async () => {
  const f = await fixture();
  const root = path.join(f.directory, "repository");
  await importPackage(f.file, { root });
  const g = await fixture(async (d) => {
    d.content.id = "asset-test-v2";
    d.production = new Uint8Array(
      await sharp(d.source)
        .modulate({ brightness: 0.8 })
        .webp({ quality: 85 })
        .toBuffer(),
    );
    d.asset.sha256 = hash(d.production);
    d.asset.bytes = d.production.length;
    d.asset.revision = d.asset.sha256.slice(0, 16);
    d.asset.path = `assets/cards/nature/test-sprout-${d.asset.revision}.webp`;
    d.content.metadata.sprout.artworkRef.revision = d.asset.revision;
  });
  await importPackage(g.file, { root });
  expect(
    (await readFile(path.join(root, `public/${f.asset.path}`))).length,
  ).toBe(f.asset.bytes);
  expect(
    (await readFile(path.join(root, `public/${g.asset.path}`))).length,
  ).toBe(g.asset.bytes);
});
