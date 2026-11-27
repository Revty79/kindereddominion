# Kindred Dominion

Version **0.6.0 - V1.4: Complete Player Experience**

A persistent tactical card game with 150 illustrated Founding Kindreds cards, custom decks and server-run computer battles. The main application is the player game. Card ownership, saved decks, account permissions, results and acquisition history live in PostgreSQL. The approved full-bleed 3:4 card renderer is shared across the catalog, collection, deck builder, hand, battlefield, inspection, pack opening and authorized Studio.

On the owner's configured Windows machine:

```powershell
cd D:\kindereddominion\kindred-dominion
npm ci
npm run dev:all
```

Open **http://127.0.0.1:5173/**. If the frontend and backend are already running, open that address directly. Stop an existing launcher with its own Ctrl+C before starting a second launcher on the same ports. PostgreSQL must be running; the launcher does not reset, migrate or seed databases.

Register with a unique username, valid email and a password of at least 15 characters. Choose one Kindred, confirm its 30-card starting collection, create a 15-card custom deck, select it for battle and open **Play**. Choose a computer formation and scoring variant, keep/exchange your opening hand and play to completion. Results, decks, ownership and preferred deck persist across logout and restart. The [owner guide](docs/V1.4-OWNER-GUIDE.md) includes first-time configuration, account promotion, recovery and the complete test path.

Authorized developers use the same account and the restricted **Developer Studio** navigation in the full application. The separate player release excludes Studio, laboratory, simulation workers and unpublished artwork. Existing local practice remains at `practice.html`; practice/sandbox does not award permanent cards or results.

Build and check:

```powershell
npm test
npm run build
npm run build:player
npm run backend:build
npm run validate:assets
npm run validate:backend-isolation
```

`dist/` is the full authenticated application; `dist-player/` is the player-only application; `server-dist/` contains the compiled backend/CLI. A preview still needs the PostgreSQL backend. The [release acceptance report](docs/V1.4-VALIDATION.md) records exact milestones, test evidence, migration preservation and remaining operational limits. See [the implementation ledger](docs/V1.4-PROGRESS.md), [accounts](docs/V1.4-ACCOUNTS.md), [collections/acquisition](docs/V1.4-COLLECTIONS.md), and [battles](docs/V1.4-PLAY.md).

DEV local registration and the one-time testing sampler are explicit local-testing configuration. The sampler requires a verified normal match and defaults to A001, M001 and C001; it is disabled by default in the example and prohibited in hosted environments. No final pack pricing, currency, rarity probabilities, monetization or new balance decisions were introduced. Email delivery/address verification are not configured; local operator recovery is documented honestly.

All 150 high-resolution original PNGs and immutable revisioned WebP assets are committed beside executable card definitions. [Artwork publication, validation, backup and restoration](docs/V1.2-ARTWORK.md) uses the existing Studio exporter and repository importer:

```powershell
node scripts/import-content.mjs "C:\path\package.kindred.zip" --validate-only
node scripts/import-content.mjs "C:\path\package.kindred.zip"
npm run validate:assets
```

Commit the definitions, asset manifest, optimized illustrations and source masters together. Never overwrite historical published asset revisions or use a roster as executable definitions. The outstanding A016/A018 baked-in numeral artwork exceptions remain separate from renderer approval.

Existing [deployment preparation](docs/V1.3D-DEPLOYMENT.md), Docker and Ubuntu files are preserved. Docker execution and hosted deployment remain owner-pending; this assignment did not deploy or access TEST/PROD. The [Master Card Mechanics](docs/MASTER-CARD-MECHANICS.md) remains authoritative for the unchanged engine rules.
