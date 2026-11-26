import type { ContentPack } from "../content/types";
export const FALLBACK_ART = "assets/cards/fallback.svg";
export function portableAssetURL(path: string): string {
  return `${import.meta.env?.BASE_URL ?? "/"}${path}`;
}
export function cardArtwork(
  content: ContentPack,
  id: string,
): string | undefined {
  const metadata = content.metadata[id];
  if (!metadata) return;
  if (metadata.artworkRef) {
    const asset = content.assets?.find(
      (a) =>
        a.id === metadata.artworkRef!.id &&
        a.revision === metadata.artworkRef!.revision,
    );
    return asset
      ? portableAssetURL(asset.path)
      : portableAssetURL(FALLBACK_ART);
  }
  return metadata.artwork || undefined;
}
export function artworkMap(content: ContentPack): Record<string, string> {
  return Object.fromEntries(
    content.cards.flatMap((c) => {
      const url = cardArtwork(content, c.id);
      return url ? [[c.id, url]] : [];
    }),
  );
}
