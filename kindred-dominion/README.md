# Kindred Dominion

Version **0.4.0 · V1.3B/C — Owner Design V1**

A tactical card game with local practice, Developer Studio and PostgreSQL-backed accounts. New matches use the owner's **150-card Founding Kindreds**: Nature, Mythical, Arcane, Undead and Constructs, each with 30 permanently numbered cards and its exact supplied 15-card starter. Five mixed development decks are also included. Original V1.1, Cody's V1.2 library, temporary artwork experiment and V1.3A laboratory remain selectable development versions. Existing drafts and match snapshots are preserved.

## Start on Windows

Double-click **Start Kindred Dominion.cmd**, or open PowerShell:

```powershell
cd D:\kindereddominion\kindred-dominion
npm ci
npm run dev:all
```

Open **http://127.0.0.1:5173/**. Keep the terminal open; stop with Ctrl+C. Use Node.js 24+ and dedicated PostgreSQL DEV. Private configuration on this owner computer is initialized. Follow the [V1.3D owner guide](docs/V1.3D-OWNER-GUIDE.md) on another computer. `npm ci` needs internet; subsequent local play does not. Use the same browser and address for local saves. Port 5173 is fixed; stop another instance before starting.

Choose **Player account** for permanent collections, owned decks and server-validated matches across browsers. The initial screen remains unrestricted local practice; `npm run dev` starts practice alone.

## First test

1. Choose a starter and Classic or Domination. Begin against the computer, or choose local two-player. Custom decks are available through **Build deck**.
2. Keep or exchange your opening hand. Hand badges explain playable cards; select one to highlight legal positions. Select a position to review actual consequences and immediate score changes, then confirm.
3. Open **Learning and action playback** for Fast, Normal, Slow, Step through or Instant. Step/skip displays recorded resolution without changing the result.
4. Inspect a creature for printed/effective power, auras, dynamic effects and protection. Row summaries separate power from points; the scoreboard separates row, creature and card-bonus points.
5. Open **Card library** to inspect all 150 cards, search `N027`, or filter by Kindred, set, power, placement, classification and mechanics.
6. In **Developer Studio → Battlefield Sandbox**, choose one of nine OWNER experiments or 30 preserved LAB scenarios. **Content Versions and Backups** switches historical versions, creates checkpoints and exports complete backups.

Read the [owner guide](docs/V1.3BC-OWNER-GUIDE.md) for exact demo steps, publication, backup and restoration. The [Master Card Mechanics](docs/MASTER-CARD-MECHANICS.md) defines implemented rules. The [owner review](docs/V1.3BC-OWNER-REVIEW.md) records interpretations and the Phoenix prerequisite issue.

## Cards and artwork

Gameplay IDs, public numbers, definition revisions, editions and artwork revisions are separate. Editions share copy limits. The [permanent registry](src/content/collectible-registry.json) reserves numbers; future expansions append assignments rather than renumbering. Current cards are freely available for testing, with provisional statistics and rarity.

The [catalog](docs/v1.3bc/OWNER-CATALOG.json), [classifications](docs/v1.3bc/CLASSIFICATIONS.json), [evolution diagrams](docs/v1.3bc/EVOLUTION-RELATIONSHIPS.md) and [150-card artwork production manifest](docs/v1.3bc/ARTWORK-PRODUCTION-MANIFEST.json) are committed. All 150 owner illustrations are integrated in the `founding-kindreds-artwork-v1` release. Original PNG masters remain unchanged; optimized WebP files and revisioned references are packaged with the cards.

Official runtime artwork belongs in `public/assets/`; source masters stay in `artwork-source/`. Definitions use stable, portable, versioned references. Experimental Studio artwork remains local until explicitly approved and exported. Import a reviewed package with:

```powershell
node scripts/import-content.mjs "C:\path\package.kindred.zip" --validate-only
node scripts/import-content.mjs "C:\path\package.kindred.zip"
npm run validate:assets
```

Commit definitions, manifest, optimized artwork and source masters together. Checks detect missing/corrupt files, invalid references, unsafe SVG and duplicates. Historical revisions remain available. See [artwork publication and recovery](docs/V1.2-ARTWORK.md).

## Builds and validation

```powershell
npm test
npm run typecheck
npm run build
npm run build:player
```

`dist/` includes the local Developer Studio. `dist-player/` is the invited-tester build: all 150 owner cards, no Studio/laboratory/simulation worker or unpublished test artwork. It emits selected approved assets plus the existing neutral crest/fallback. Source masters are never served. Validation checks references, checksums and Git tracking.

Preview the player build:

```powershell
npx vite preview --host 127.0.0.1 --port 5174 --strictPort --outDir dist-player
```

For browser tests, install Chromium with `npx playwright install chromium`, separately serve the full production `dist/` on port 5175, then run:

```powershell
$env:KINDRED_PLAYER_URL = 'http://127.0.0.1:5174'
$env:KINDRED_CLEAN_URL = 'http://127.0.0.1:5175'
npm run test:browser
```

See [validation](docs/V1.3BC-VALIDATION.md) and [preliminary balance findings](docs/v1.3bc/PRELIMINARY-BALANCE.md). Reproduce owner runs with `npm run validate:owner -- --scoring=classic` and `npm run validate:owner -- --scoring=domination`; summarize saved evidence with `node scripts/summarize-owner.mjs`. Simulations never automatically rebalance cards.

## Permanent storage and deployment preparation

V1.3D adds Fastify/TypeScript, PostgreSQL, four migrations, persistent sessions/roles, atomic inventory, owned decks, authoritative single-player matches, verified history/statistics and private revisioned Studio. Existing local data remains; imports require preview/backup. Official content and approved artwork remain portable through Git.

- [Windows owner guide](docs/V1.3D-OWNER-GUIDE.md): configuration, accounts/roles, pgAdmin, publication, backup/restoration.
- [Architecture/schema](docs/V1.3D-ARCHITECTURE.md), [security/limits](docs/V1.3D-SECURITY.md), [validation](docs/V1.3D-VALIDATION.md), [baseline](docs/V1.3D-BASELINE.md), [brief](docs/V1.3D-BRIEF.md).
- [Future Ubuntu preparation](docs/V1.3D-DEPLOYMENT.md): separate frontend/backend, existing PostgreSQL, private configuration, update/rollback and backups.

**Docker execution remains pending owner validation. TEST/PROD and Ubuntu were not accessed or changed.** No remote multiplayer, commerce, economy or artwork generation is included. The owner/Ember illustrations are integrated through the existing publishing pipeline; the new collectible frame remains an isolated approval study.

Run real PostgreSQL integration only in the owned disposable instance:

```powershell
npm run db:create-test
$env:KINDRED_ENV_FILE = '.local/v1.3d/integration.env'
npm run test:database
```

Use `node scripts/pg-isolate.mjs resume` for an existing instance, or `create-db` for a fresh registered empty test database. The returned private env file identifies its target. Stop only this postmaster with `node scripts/pg-isolate.mjs stop`. Remove KINDRED_ENV_FILE from your terminal before returning to DEV.

## Development references

- [V1.3B/C architecture](docs/V1.3BC-ARCHITECTURE.md), [baseline checkpoint](docs/V1.3BC-BASELINE.md) and [authoritative brief](docs/V1.3BC-BRIEF.md)
- [V1.3A owner guide](docs/V1.3A-OWNER-GUIDE.md) and [validation](docs/V1.3A-VALIDATION.md)
- [V1.2 owner guide](docs/V1.2-OWNER-GUIDE.md), [architecture](docs/V1.2-ARCHITECTURE.md) and [validation](docs/V1.2-VALIDATION.md)
- [Original V1.1 rules](docs/RULES-AND-ARCHITECTURE.md)

## Founding artwork and card-design review

The complete [artwork roster](docs/FOUNDING-KINDREDS-ARTWORK.md), [inventory](docs/founding-artwork/INVENTORY.json) and [integration/verification report](docs/FOUNDING-ARTWORK-VERIFICATION.md) cover all five Kindreds. Fresh ordinary play and player builds use the illustrated owner release. Existing drafts, chosen historical versions and saved match snapshots remain recoverable. Begin a new match to use the new artwork.

For the owner's separate visual approval checkpoint, open **http://127.0.0.1:5173/card-design.html** while the development server is running. Seven actual cards demonstrate the latest **full-bleed 3:4 artwork-first design** with transparent permanent information at collection/inspection, hand and battlefield scales. The focused row is **http://127.0.0.1:5173/battlefield-design.html**: cards rest above separate tiles, with real evolution/replacement actions and current power outside the printed face. See the [study and review screenshots](docs/BATTLEFIELD-CARD-STUDY.md). This prototype is excluded from ordinary production builds. Rollout into collection, deck builder, hand and gameplay requires explicit owner approval under the [latest direction](docs/ARTWORK-FIRST-CARD-DIRECTION.md).

Re-export the complete collection as bounded packages, including its source masters:

```powershell
node scripts/export-content.mjs founding-kindreds-artwork-v1 .local/founding-artwork-backup --split
node scripts/import-founding-artwork.mjs .local/founding-artwork-backup/set.json --validate-only
```

The importer validates every ordinary Studio-format member and assembles one complete immutable release. Source/runtime package bounds remain unchanged. Use a new content ID for revised artwork; never overwrite an old release.
