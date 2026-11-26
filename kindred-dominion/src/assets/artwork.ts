import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
const tags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "title",
  "desc",
]);
const attrs = new Set([
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "id",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "clip-path",
  "fill-rule",
  "clip-rule",
  "preserveAspectRatio",
  "fx",
  "fy",
]);
export function sanitizeSVG(text: string): string {
  if (
    text.length > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)
  )
    throw new Error(
      "SVG entities, document types and external styles are forbidden.",
    );
  const document = new DOMParser({
    onError: () => {
      throw new Error("Malformed SVG document.");
    },
  }).parseFromString(text, "image/svg+xml");
  if (document.documentElement?.tagName !== "svg")
    throw new Error("SVG root element is missing.");
  const walk = (element: Element) => {
    if (!tags.has(element.tagName))
      throw new Error(`SVG element ${element.tagName} is not permitted.`);
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === "xmlns") {
        if (attr.value !== "http://www.w3.org/2000/svg")
          throw new Error("SVG namespace is invalid.");
        continue;
      }
      if (
        !attrs.has(attr.name) ||
        /javascript:|data:|https?:|file:|expression\(|[<>]/i.test(attr.value) ||
        (/url\(/i.test(attr.value) &&
          !/^url\(#[a-zA-Z][\w-]*\)$/.test(attr.value))
      )
        throw new Error(`Unsafe SVG attribute ${attr.name}.`);
    }
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === 1) walk(node as Element);
      else if (![3, 8].includes(node.nodeType))
        throw new Error("Unsupported SVG node.");
    }
  };
  walk(document.documentElement as unknown as Element);
  document.documentElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(document);
}
export function identifyImage(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml" {
  if (bytes.length < 12) throw new Error("Image data is truncated.");
  const head = new TextDecoder().decode(bytes.slice(0, 1000));
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")
    return "image/webp";
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    sanitizeSVG(new TextDecoder().decode(bytes));
    return "image/svg+xml";
  }
  throw new Error(
    "Unsupported or corrupt image. Use PNG, JPEG, WebP or a safe geometric SVG.",
  );
}
export function fromDataURL(data: string): { bytes: Uint8Array; mime: string } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match) throw new Error("Artwork data URL is invalid.");
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  const mime = identifyImage(bytes);
  if (mime !== match[1])
    throw new Error("Artwork MIME type does not match its bytes.");
  return { bytes, mime };
}
export function toDataURL(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
export async function importLocalArtwork(
  file: File,
): Promise<{ sourceArtwork: string; artwork: string }> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Source artwork exceeds the 10 MB limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = identifyImage(bytes);
  const decoded = await decodeImage(bytes, mime);
  const scale = Math.min(1, 1024 / decoded.width, 1536 / decoded.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(decoded.width * scale));
  canvas.height = Math.max(1, Math.round(decoded.height * scale));
  canvas
    .getContext("2d")!
    .drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
  decoded.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("WebP optimization failed."))),
      "image/webp",
      0.85,
    ),
  );
  if (blob.type !== "image/webp")
    throw new Error("This browser cannot produce WebP artwork.");
  return {
    sourceArtwork: toDataURL(bytes, mime),
    artwork: toDataURL(new Uint8Array(await blob.arrayBuffer()), "image/webp"),
  };
}
export async function decodeImage(
  bytes: Uint8Array,
  mime: string,
): Promise<{
  image: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (mime === "image/svg+xml") {
    sanitizeSVG(new TextDecoder().decode(bytes));
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: mime }),
    );
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("SVG pixels could not be decoded.");
    }
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40_000_000
    ) {
      URL.revokeObjectURL(url);
      throw new Error("SVG dimensions exceed supported bounds.");
    }
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  }
  const image = await createImageBitmap(
    new Blob([bytes as BlobPart], { type: mime }),
  ).catch(() => {
    throw new Error(
      "Image pixels could not be decoded. The file may be corrupt.",
    );
  });
  if (
    !image.width ||
    !image.height ||
    image.width * image.height > 40_000_000
  ) {
    image.close();
    throw new Error("Image dimensions exceed supported bounds.");
  }
  return {
    image,
    width: image.width,
    height: image.height,
    close: () => image.close(),
  };
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
