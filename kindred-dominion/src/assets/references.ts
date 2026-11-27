import type { ContentPack } from "../content/types";
export const FALLBACK_ART = "assets/cards/fallback.svg";
export function portableAssetURL(path: string): string {
  return `${import.meta.env?.BASE_URL ?? "/"}${path}`;
}
export function cardArtwork(
  content: ContentPack,
  id: string,
  portable = false,
): string | undefined {
  const metadata = content.metadata[id];
  if (!metadata) return;
  if (metadata.artworkRef) {
    const asset = content.assets?.find(
      (a) =>
        a.id === metadata.artworkRef!.id &&
        a.revision === metadata.artworkRef!.revision,
    );
    const reference = asset?.path ?? FALLBACK_ART;
    return portable ? reference : portableAssetURL(reference);
  }
  return metadata.artwork || undefined;
}
export function artworkMap(content: ContentPack, portable = false): Record<string, string> {
  return Object.fromEntries(
    content.cards.flatMap((c) => {
      const url = cardArtwork(content, c.id, portable);
      return url ? [[c.id, url]] : [];
    }),
  );
}
// Stored replays must survive a move between the player root and protected
// Studio subpath. Resolve deployment-specific URLs only when rendering.
export const recordArtworkMap = (content: ContentPack) => artworkMap(content, true);
