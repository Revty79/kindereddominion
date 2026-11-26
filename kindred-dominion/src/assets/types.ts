export type OfficialAsset = {
  id: string;
  revision: string;
  path: string;
  sha256: string;
  mime: "image/webp" | "image/png" | "image/jpeg" | "image/svg+xml";
  bytes: number;
  width: number;
  height: number;
  category:
    | "cards"
    | "card-backs"
    | "battlefields"
    | "icons"
    | "animations"
    | "branding";
  source: { path: string; sha256: string; mime: string; bytes: number };
  approval: "testing" | "production";
};
export type AssetManifest = {
  format: "kindred-dominion-assets";
  schema: 1;
  contentId: string;
  assets: OfficialAsset[];
};
export type PublicationManifest = {
  format: "kindred-dominion-publication";
  schema: 1;
  contentId: string;
  engineVersion: string;
  approval: "testing" | "production";
  files: { path: string; sha256: string; bytes: number }[];
};
