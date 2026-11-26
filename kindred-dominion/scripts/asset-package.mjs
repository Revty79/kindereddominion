import { unzipSync } from "fflate";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadTS } from "./tooling.mjs";
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
let artworkHelpers;
export function safePath(value) {
  if (
    typeof value !== "string" ||
    !/^([a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/.test(value) ||
    value.split("/").some((p) => p === ".." || p === ".") ||
    path.isAbsolute(value) ||
    value.includes("\\")
  )
    throw new Error(`Unsafe or case-inconsistent asset path: ${value}`);
  return value;
}
export async function validateImage(bytes, mime, filename) {
  if (filename) {
    const extensions = {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
      "image/svg+xml": [".svg"],
    };
    if (!extensions[mime]?.includes(path.extname(filename)))
      throw new Error(
        "Image filename extension does not match its media type.",
      );
  }
  const { identifyImage, sanitizeSVG } = await (artworkHelpers ??= loadTS(
    "src/assets/artwork.ts",
    "asset-sniff",
  ));
  const actual = identifyImage(bytes);
  if (actual !== mime)
    throw new Error("Image format does not match its declared media type.");
  if (mime === "image/svg+xml")
    sanitizeSVG(Buffer.from(bytes).toString("utf8"));
  const image = sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 });
  const meta = await image.metadata();
  await image.clone().raw().toBuffer();
  if (!meta.width || !meta.height)
    throw new Error("Artwork dimensions are missing.");
  return { width: meta.width, height: meta.height };
}
export async function readPackage(file) {
  const zipped = await readFile(file);
  if (zipped.length > 60 * 1024 * 1024)
    throw new Error("Content package exceeds 60 MB compressed.");
  let expanded = 0;
  const archiveNames = new Set();
  const files = unzipSync(zipped, {
    filter: (entry) => {
      safePath(entry.name);
      expanded += entry.originalSize;
      if (
        archiveNames.has(entry.name) ||
        entry.originalSize > 30 * 1024 * 1024 ||
        expanded > 150 * 1024 * 1024 ||
        archiveNames.size >= 2000
      )
        throw new Error(
          "Duplicate archive entry or expanded size ceiling exceeded.",
        );
      archiveNames.add(entry.name);
      return true;
    },
  });
  if (
    Object.values(files).reduce((sum, b) => sum + b.length, 0) >
    150 * 1024 * 1024
  )
    throw new Error("Content package exceeds the 150 MB expanded ceiling.");
  const json = (name) => {
    if (!files[name]) throw new Error(`Package is missing ${name}.`);
    return JSON.parse(Buffer.from(files[name]).toString("utf8"));
  };
  const publication = json("publication.json"),
    manifest = json("assets.json"),
    content = json("content.json");
  if (
    publication.format !== "kindred-dominion-publication" ||
    publication.schema !== 1 ||
    manifest.format !== "kindred-dominion-assets" ||
    manifest.schema !== 1 ||
    publication.contentId !== content.id ||
    manifest.contentId !== content.id ||
    !["testing", "production"].includes(publication.approval) ||
    !Array.isArray(manifest.assets) ||
    !Array.isArray(publication.files)
  )
    throw new Error("Incompatible package or manifest.");
  const { validatePack } = await loadTS(
    "src/content/validation.ts",
    "content-validation",
  );
  const errors = validatePack(content).filter((i) => i.severity === "error");
  if (errors.length)
    throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(content.id))
    throw new Error("Published content ID must be lowercase and portable.");
  const listed = new Set();
  for (const entry of publication.files) {
    safePath(entry.path);
    if (
      listed.has(entry.path) ||
      !files[entry.path] ||
      files[entry.path].length !== entry.bytes ||
      digest(files[entry.path]) !== entry.sha256
    )
      throw new Error(
        `Missing, duplicate or corrupt package file: ${entry.path}`,
      );
    listed.add(entry.path);
  }
  for (const name of Object.keys(files))
    if (name !== "publication.json" && !listed.has(name))
      throw new Error(`Unlisted package file: ${name}`);
  const ids = new Set(),
    paths = new Set(),
    hashes = new Set();
  for (const asset of manifest.assets) {
    if (
      !/^[a-z][a-z0-9-]{0,79}$/.test(asset.id) ||
      !new RegExp(`^${asset.sha256?.slice(0, 16)}$`).test(asset.revision) ||
      !asset.path.startsWith("assets/") ||
      !asset.source?.path.startsWith("artwork-source/")
    )
      throw new Error("Invalid stable asset identifier or revision.");
    const key = `${asset.id}@${asset.revision}`;
    if (ids.has(key) || paths.has(asset.path) || hashes.has(asset.sha256))
      throw new Error(
        "Duplicate artwork identifier, path or byte-identical asset. Share a single asset reference instead.",
      );
    ids.add(key);
    paths.add(asset.path);
    hashes.add(asset.sha256);
    safePath(asset.path);
    safePath(asset.source.path);
    for (const [name, hash, size, mime] of [
      [`public/${asset.path}`, asset.sha256, asset.bytes, asset.mime],
      [
        asset.source.path,
        asset.source.sha256,
        asset.source.bytes,
        asset.source.mime,
      ],
    ]) {
      if (
        !files[name] ||
        digest(files[name]) !== hash ||
        files[name].length !== size
      )
        throw new Error(`Missing or corrupt artwork: ${name}`);
      const dimensions = await validateImage(files[name], mime, name);
      if (
        name.startsWith("public/") &&
        (dimensions.width !== asset.width || dimensions.height !== asset.height)
      )
        throw new Error("Artwork dimensions do not match the asset manifest.");
    }
    if (
      asset.approval !== publication.approval &&
      !(publication.approval === "testing" && asset.approval === "production")
    )
      throw new Error(
        "Unapproved artwork cannot be published at this approval level.",
      );
  }
  if (JSON.stringify(content.assets ?? []) !== JSON.stringify(manifest.assets))
    throw new Error(
      "Definition artwork manifest differs from the packaged manifest.",
    );
  for (const [id, metadata] of Object.entries(content.metadata)) {
    if (metadata.artwork || metadata.sourceArtwork)
      throw new Error("Published definitions may not embed base64 artwork.");
    if (
      metadata.artworkRef &&
      !ids.has(`${metadata.artworkRef.id}@${metadata.artworkRef.revision}`)
    )
      throw new Error(`Broken artwork reference on ${id}.`);
  }
  const allowed = new Set([
    "content.json",
    "assets.json",
    "publication.json",
    ...manifest.assets.flatMap((a) => [`public/${a.path}`, a.source.path]),
  ]);
  for (const name of Object.keys(files))
    if (!allowed.has(name))
      throw new Error(`Unexpected archive content: ${name}`);
  return { files, publication, manifest, content };
}
