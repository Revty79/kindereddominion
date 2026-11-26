# Kindred Dominion

Version **0.4.0 · V1.3B/C — Owner Design V1**

A local tactical card game and Developer Studio. New matches use the owner's **150-card Founding Kindreds**: Nature, Mythical, Arcane, Undead and Constructs, each with 30 permanently numbered cards and its exact supplied 15-card starter. Five mixed development decks are also included. Original V1.1, Cody's V1.2 library, temporary artwork experiment and V1.3A laboratory remain selectable development versions. Existing drafts and match snapshots are preserved.

## Start on Windows

Double-click **Start Kindred Dominion.cmd**, or open PowerShell:

```powershell
cd D:\kindereddominion\kindred-dominion
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. Keep the terminal open; stop with Ctrl+C. Install Node.js 22.12+ (24 recommended) first. `npm ci` needs internet; subsequent local play does not. Use the same browser and address for local saves. Port 5173 is fixed; stop another instance before starting.

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

The [catalog](docs/v1.3bc/OWNER-CATALOG.json), [classifications](docs/v1.3bc/CLASSIFICATIONS.json), [evolution diagrams](docs/v1.3bc/EVOLUTION-RELATIONSHIPS.md) and [150-card artwork production manifest](docs/v1.3bc/ARTWORK-PRODUCTION-MANIFEST.json) are committed. Final illustrations await separate creation and approval.

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

## Server preparation and future storage

Docker/Compose files serve only the player build through digest-pinned unprivileged NGINX, with an explicit unused host port and loopback default. Follow [deployment preparation](docs/V1.3BC-DEPLOYMENT.md) for clean GitHub checkout, startup, health, update, shutdown, rollback and the acceptance script. **Docker execution remains pending owner validation by explicit instruction.** Actual home-server installation requires separate authorization.

The [PostgreSQL proposal](docs/V1.3BC-STORAGE.md) covers a dedicated database, restricted roles, atomic inventory transactions, migrations, backups and independent restoration. No database or migration is created.

Browser saves remain specific to device, browser and origin. Cross-device progression, server accounts, online multiplayer, purchases and final artwork are not implemented. Send feedback to the owner externally with version, mode, decks, seed, action/position and expected/observed result. Read the owner guide before sharing a developer replay containing both private hands.

## Development references

- [V1.3B/C architecture](docs/V1.3BC-ARCHITECTURE.md), [baseline checkpoint](docs/V1.3BC-BASELINE.md) and [authoritative brief](docs/V1.3BC-BRIEF.md)
- [V1.3A owner guide](docs/V1.3A-OWNER-GUIDE.md) and [validation](docs/V1.3A-VALIDATION.md)
- [V1.2 owner guide](docs/V1.2-OWNER-GUIDE.md), [architecture](docs/V1.2-ARCHITECTURE.md) and [validation](docs/V1.2-VALIDATION.md)
- [Original V1.1 rules](docs/RULES-AND-ARCHITECTURE.md)
