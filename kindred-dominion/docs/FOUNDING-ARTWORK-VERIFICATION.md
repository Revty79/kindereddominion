# Founding artwork integration and V1.3 verification

## Outcome

All 150 founding creature illustrations are integrated in `founding-kindreds-artwork-v1`, using the existing Studio image conversion/publication code and repository importer. No permanent card identity, executable card definition, power value, ability, deck, classification or evolution relationship was changed. Engine version remains **1.3.1**.

Source baseline: `e03a6410477bd4c446a65bf4fc260b288a12f788`. Implementation: `a7eff9f04eca361cc61c989a4a32e1a8bbaa9c84`. [Verification receipt](founding-artwork/VERIFICATION.json). Final publication is awaiting the artwork-exception decision described below.

The separate collectible-card presentation supplement is implemented only as an isolated visual study. **Its framing has not been approved or applied throughout gameplay.**

## Artwork inventory

The owner supplied [FOUNDING-KINDREDS-ARTWORK.md](FOUNDING-KINDREDS-ARTWORK.md) from Downloads. Its 150 names, permanent numbers, filenames and predecessor relationships agree with the existing executable owner library and production manifest. The roster checks artwork associations; executable definitions still come from `src/content/owner.ts` and its approved input.

| Kindred | Permanent numbers | Validated illustrations |
| --- | --- | ---: |
| Nature | N001–N030 | 30 |
| Mythical | M001–M030 | 30 |
| Arcane | A001–A030 | 30 |
| Undead | U001–U030 | 30 |
| Constructs | C001–C030 | 30 |

Missing images, duplicate source/pixel content, mismatched names/IDs/filenames, invalid formats and corrupt decoded pixels: **zero**. All sources are PNG, under 10MB and 40 million pixels. Seventeen differ from the roster's preferred 3:4 aspect ratio; these are advisory composition differences, not invalid files. No source was cropped or stretched.

A visual review of all five contact sheets found two artwork-standard exceptions: [A016 Magical Ooze](../artwork-source/cards/arcane/A016.png) contains a visible **16** on a stone, and [A018 Living Grimoire](../artwork-source/cards/arcane/A018.png) contains **18** on its cover. These conflict with the roster's no-numbers standard. The originals are preserved; the owner's decision on retaining them for local playtesting versus holding them for replacement is pending. Technical image validation is not final artistic acceptance.

The originals total **449,761,648 bytes**. The optimized WebP illustrations total **44,274,150 bytes**, a **90.16% reduction**, bounded to 1024×1536 while preserving proportions. [INVENTORY.json](founding-artwork/INVENTORY.json) lists each original, dimensions, original/pixel checksums, runtime path, artwork revision and immutable source revision.

The original uppercase-numbered PNGs remain unchanged. The publishing contract also stores byte-identical, lowercase, checksum-named source revisions. These intentional archival copies preserve immutable historical references; Git reuses the original PNG blobs. Production uses lowercase revisioned WebP paths. Card IDs, artwork IDs, gameplay revisions and artwork revisions remain independent.

## Publication and preservation

The full collection exceeds the existing 60MB compressed / 150MB expanded single-package limits. Those bounds were retained. Fifteen ordinary Studio-format exports, ten illustrations each, were produced using the actual browser `importLocalArtwork` and `createPublication` functions. `import-founding-artwork.mjs` validates every member through the existing package validator, compares definitions with the executable owner catalog, verifies original source checksums and assembles exactly 150 unique associations through the existing importer/write/rollback path. Only the complete final release is added to published content; temporary members stay ignored.

Runtime and source files use checksum revisions, and the registry retains all three prior assets. Previously published files and libraries are preserved. Ordinary new local matches and default player builds select the illustrated owner release. Existing drafts, deliberate historical selections, custom-deck storage and saved match/replay snapshots remain retained. Existing matches continue using their original snapshots; start a new match for the new artwork.

One pre-existing WebP signature bug surfaced during bulk export: decoding RIFF's binary length as UTF-8 could shift the apparent `WEBP` marker. Signature detection now checks fixed byte positions; a regression case and validation of all published bitmaps cover this correction.

Re-export/restore the complete release without a single oversized ZIP:

```powershell
node scripts/export-content.mjs founding-kindreds-artwork-v1 .local/founding-artwork-backup --split
node scripts/import-founding-artwork.mjs .local/founding-artwork-backup/set.json --validate-only
node scripts/import-founding-artwork.mjs .local/founding-artwork-backup/set.json
```

The member files, set index and source masters form one portable backup. Re-export, validation and repeat import were demonstrated. Corrupt member checksums and altered executable gameplay definitions were rejected before publication. Larger browser exports direct the owner to bounded repository export. Revised artwork requires a new content ID; existing revisions cannot be overwritten.

To repeat source conversion from a reviewed roster while the local development server is running:

```powershell
node scripts/audit-founding-artwork.mjs
node scripts/publish-founding-artwork.mjs --url=http://127.0.0.1:5173 --approve-production-artwork
node scripts/import-founding-artwork.mjs .local/founding-artwork/publication/set.json --validate-only
```

The explicit approval flag applies to the selected artwork; draft images are not automatically published. `--resume` reuses exported members, all of which are revalidated against the numbered originals at import. No illustrations were generated during this work.

## Verified V1.3 status

| Area | Actual implementation and verification |
| --- | --- |
| V1.3A mechanics | Shared deterministic engine, advanced triggers/continuous effects/protection/resurrection/scoring, bounded resolution and replay validation remain implemented. Regression includes controlled execution of every owner card. No second rules engine or rebalancing was introduced. |
| V1.3B/C owner library | All 150 permanent identities, five exact 15-card starters, five mixed decks and 20 evolution definitions are preserved. Current artwork release's cards/decks/rulesets/collections deeply equal the original owner catalog. |
| Readability | Existing printed/effective power, row/column scoring, action previews, inspector, recorded-resolution playback and presentation speeds remain operational. New collectible framing is isolated pending approval. |
| V1.3D storage | Fastify/TypeScript/PostgreSQL accounts, sessions/roles, atomic inventories/starters, owned decks, authoritative computer matches, historical versions/replays/statistics and private Studio persistence are implemented. Four migrations remain applied with no pending migration. |

DEV was backed up before selecting the new artwork catalog. This was a content synchronization only: no schema migration/reset. Checksums over **14 player-data tables** confirmed unchanged accounts, quantities, acquisitions, decks, matches, completion markers and private Studio/import records. Historical catalog versions remain available. Database tests and synthetic account/browser workflows used a separately owned disposable PostgreSQL instance. No new validation accounts were created in owner DEV.

TEST/PROD, the Ubuntu host, unrelated applications, firewall and reverse proxy were not modified. Docker execution remains deferred under the owner's prior instruction.

## Validation

- **397 automated tests passed**, including the preserved regression suites and new artwork/upgrade/signature checks.
- **17 real PostgreSQL integration tests passed** against a fresh registered disposable database with the illustrated release present.
- **35 Chromium browser tests passed**: the original 28 plus library/builder/preview/fallback coverage, five complete computer matches and the isolated presentation study. Every completed Kindred match retained a valid deterministic replay.
- **Four persistent-account browser workflows passed** in isolation; the backup-restoration case was intentionally skipped because no new restoration workflow was required. The illustrated catalog was selected before account play. Original V1.3D restoration evidence remains committed.
- Frontend/backend strict TypeScript, full/player/backend builds, manifest/source/runtime checksums and Git tracking passed. Player output contains 150 illustrations plus fallback/branding, excludes source masters, Studio/laboratory and unpublished test art.
- Existing publication export/import and rejected-corruption checks passed. Full collection re-export/reimport remains bounded and idempotent.
- Clean Git worktree installation, full/player/backend builds, all 397 tests, complete source audit and bounded-package validation passed. A final targeted browser smoke run passed after normalizing JSON import attributes. The isolated study is absent from ordinary production output.
- Known private-value scan: zero matches in build output. Dependency audit reported zero vulnerabilities at verification time.

An initial browser harness assumed a fixed port and another read the intermediate computer turn as the next human turn; both checks were corrected to follow configured origin and completed action state. These failed/interrupted runs were not counted as acceptance. No gameplay rule was changed to make tests pass.

## Local launch and playtest

On this computer, DEV configuration and the illustrated catalog are initialized. If the earlier frontend terminal is still running, stop that terminal with Ctrl+C before starting the combined launcher:

```powershell
cd D:\kindereddominion\kindred-dominion
npm run dev:all
```

Open **http://127.0.0.1:5173/**. Alternatively double-click `Start Kindred Dominion.cmd`. Keep the terminal open; Ctrl+C stops its two owned app processes and leaves PostgreSQL running. `npm run dev` remains the offline-practice-only option.

1. Begin a new match with any of the five starters. Keep/exchange the opening hand, select a legal creature and position, review consequences, then confirm.
2. Complete a Classic or Domination game. Inspect printed/effective power, row points, recorded resolution and replay.
3. Check **Card library** and **Build deck** for all numbered illustrations. In a saved workspace using a deliberately selected older version, activate `founding-kindreds-artwork-v1` through Studio Content Versions for new matches.
4. Open **Player account** for permanent collection/decks and server-validated games. Ownership remains separate from unrestricted practice cards.

New development computers follow the [V1.3D owner guide](V1.3D-OWNER-GUIDE.md). For an already initialized database that has a deliberate active catalog, back up first, then explicitly synchronize/select the new release with:

```powershell
node node_modules/tsx/dist/cli.mjs server/cli.ts seed --file=src/content/published/founding-kindreds-artwork-v1.json --activate
```

This explicit step is already complete on the owner's DEV computer. Ordinary repeated seeding preserves an existing selected release.

## Presentation approval checkpoint and remaining items

The isolated development page is **http://127.0.0.1:5173/card-design.html**. It uses one data-driven component for Red Fox, Dragon, Crystal Elemental, Lich, Iron Golem, Grey Wolf (evolution) and Venus Flytrap (replacement), at inspection, hand and battlefield scales. The later [artwork-first clarification](ARTWORK-FIRST-CARD-DIRECTION.md) supersedes the original inset-picture layout: illustration now fills the entire 3:4 face, with permanent information in transparent overlays. No image files were modified. Temporary state remains separate from the printed face.

The [focused battlefield study](BATTLEFIELD-CARD-STUDY.md) is **http://127.0.0.1:5173/battlefield-design.html**. It demonstrates five cards resting on separate tiles, a selected evolution, a replacement, hover/keyboard inspection and actual engine-derived power/scoring. Its additional validation is recorded separately from the integration tests above.

Review screenshots: [collection](founding-artwork/review/collection.png), [full inspection](founding-artwork/review/full-inspection.png), [hand](founding-artwork/review/hand.png), [battlefield](founding-artwork/review/battlefield.png), [mobile](founding-artwork/review/mobile.png). The mobile study was checked at 390 pixels with no document overflow or page errors; this is emulation, not physical-device acceptance.

The [owner supplement](FOUNDING-CARD-PRESENTATION-SUPPLEMENT.md) states: “Do not consider the visual design approved until the owner explicitly accepts it.” No application-wide framing rollout will occur before that acceptance. The study is excluded from ordinary production builds.

Priorities:

1. **Complete local match blockers: none found.** All five founding starters completed actual computer games.
2. **Design rollout: awaiting explicit owner approval** of the full-bleed artwork-first prototype, overlay readability and card-on-tile examples.
3. **Artwork exceptions: A016 and A018 contain baked-in numerals.** Owner decision is required under the supplied roster before final artwork acceptance.
4. **Deployment: Docker execution and Ubuntu TEST deployment remain owner-deferred**, outside local-play acceptance.
5. **Advisory review:** 17 non-preferred aspect ratios; no automatic cropping. Phoenix's existing M003 resurrection prerequisite is preserved as documented, not silently bypassed. Physical-device acceptance remains future validation.
