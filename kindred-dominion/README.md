# Kindred Dominion

Version **0.7.0 - V1.5: Economy Integration and Sandbox Foundation**

A persistent tactical card game with 150 illustrated Founding Kindreds cards, custom decks and server-run computer battles. The main application is the player game. Card ownership, saved decks, account permissions, results and acquisition history live in PostgreSQL. The approved full-bleed 3:4 card renderer is shared across the catalog, collection, deck builder, hand, battlefield, inspection, pack opening and authorized Studio.

V1.6D adds [authoritative tactical placement previews](docs/V1.6D-VALIDATION.md), affected-tile numbers, ability/evolution explanations and explicit hidden/random uncertainty. Follow the [current startup and owner checklist](docs/V1.6D-OWNER-ACCEPTANCE.md). [Representative examples and screenshots](docs/V1.6D-VALIDATION.md#representative-examples-and-screenshots) show the original founding mechanics without changing card balance or artwork.

V1.6C adds [interactive player card pickup, dragging and battlefield placement](docs/V1.6C-VALIDATION.md), keyboard/touch controls, review/direct confirmation modes and larger tile numbers. Its [testing guide](docs/V1.6C-OWNER-ACCEPTANCE.md) includes the disclosed local DEV migration incident. [Visual evidence](docs/V1.6C-VALIDATION.md#visual-evidence) covers desktop, pending placement, tablet and touch layouts.

V1.6B completes [persistent player deck construction and battle selection](docs/V1.6B-VALIDATION.md), including recoverable working edits, legal duplicate copies, repair and responsive collection controls. [Interface screenshots](docs/V1.6B-VALIDATION.md#player-interface-and-screenshots) show the compiled desktop, tablet, mobile and custom-match journeys.

V1.6A prepares [forty-copy starter proposals](docs/V1.6A-STARTER-PROPOSALS.md), [balance evidence](docs/v1.6a/BALANCE.md), and a versioned, account-bound upgrade path. Read the [owner review and local acceptance checklist](docs/V1.6A-OWNER-ACCEPTANCE.md) before activation. Both starter grant flags default off; updating the application does not automatically backfill accounts.

For the first C-G upgrade, follow the [owner startup, backup and acceptance checklist](docs/V1.5-OWNER-ACCEPTANCE.md) before launching. The [integrated validation report](docs/V1.5G-VALIDATION.md) records implementation, tests, preservation, simulations and remaining owner-dependent acceptance. Genuine Stripe testing remains separate from simulations; live payments remain disabled.

On the owner's configured and upgraded Windows machine:

```powershell
cd D:\kindereddominion\kindred-dominion
npm ci
npm run dev:all
```

Open **http://127.0.0.1:5173/**. If the frontend and backend are already running, open that address directly. Stop an existing launcher with its own Ctrl+C before starting a second launcher on the same ports. PostgreSQL must be running; the launcher does not reset, migrate or seed databases.

Register with a unique username, valid email and a password of at least 15 characters. Choose one Kindred, confirm its 30-card starting collection, create a 15-card custom deck, select it for battle and open **Play**. Choose a computer formation and scoring variant, keep/exchange your opening hand and play to completion. Results, decks, ownership and preferred deck persist across logout and restart. The [owner guide](docs/V1.4-OWNER-GUIDE.md) includes first-time configuration, account promotion, recovery and the complete test path.

Hosted administrators open **Administration** at `/api/control/` using their existing account. Developers see **Development tools** there. See the [hosted control guide](docs/V1.5-HOSTED-CONTROL.md), [permanent operator installation and recovery](docs/V1.5-OPERATIONS.md), and [V1.5 validation](docs/V1.5-VALIDATION.md). The [viewport correction](docs/GAMEPLAY-VIEWPORT.md) keeps normal gameplay within the browser viewport at 100% zoom.

After the [one-time automatic updater installation](docs/V1.5-OPERATIONS.md#install-the-automatic-updater-once), normal hosted updates require only **`sudo kindred-update`**. For this private TEST environment it selects the latest main revision with successful exact-commit CI, verifies and updates its operator runtime, then performs the existing candidate validation, backups, restored-copy migration rehearsal, deployment and health checks. No routine SHA, fetch, checkout, reinstallation, GitHub login or manual approval is required. The [TEST policy](docs/V1.5A-TEST-RELEASE-POLICY.md) is bound to the TEST database; production still requires explicit approval and remains disabled.

Authorized developers use the same account and the restricted **Developer Studio** navigation in the full application. The separate player release excludes Studio, laboratory, simulation workers and unpublished artwork. Existing local practice remains at `practice.html`; browser-local practice and Studio simulations do not award ordinary player cards or verified results. Commercial sandbox accounts/assets remain explicitly isolated.

Build and check:

```powershell
npm test
npm run build
npm run build:player
npm run build:control
npm run backend:build
npm run validate:assets
npm run validate:backend-isolation
```

`dist/` is the full authenticated application; `dist-player/` is the player-only application; `dist-control/` is served only by the authorized backend route; `server-dist/` contains the compiled backend/CLI. A preview still needs the PostgreSQL backend. The [release acceptance report](docs/V1.4-VALIDATION.md) records exact milestones, test evidence, migration preservation and remaining operational limits. See [the implementation ledger](docs/V1.4-PROGRESS.md), [accounts](docs/V1.4-ACCOUNTS.md), [collections/acquisition](docs/V1.4-COLLECTIONS.md), and [battles](docs/V1.4-PLAY.md).

DEV local registration and the one-time testing sampler are explicit local-testing configuration. The sampler requires a verified normal match and defaults to A001, M001 and C001; it is disabled by default in the example and prohibited in hosted environments. No final pack pricing, currency, rarity probabilities, monetization or new balance decisions were introduced. Email delivery/address verification are not configured; local operator recovery is documented honestly.

All 150 high-resolution original PNGs and immutable revisioned WebP assets are committed beside executable card definitions. [Artwork publication, validation, backup and restoration](docs/V1.2-ARTWORK.md) uses the existing Studio exporter and repository importer:

```powershell
node scripts/import-content.mjs "C:\path\package.kindred.zip" --validate-only
node scripts/import-content.mjs "C:\path\package.kindred.zip"
npm run validate:assets
```

Commit the definitions, asset manifest, optimized illustrations and source masters together. Never overwrite historical published asset revisions or use a roster as executable definitions. The outstanding A016/A018 baked-in numeral artwork exceptions remain separate from renderer approval.

Existing [deployment preparation](docs/V1.3D-DEPLOYMENT.md), Docker and Ubuntu files are preserved. Docker execution and hosted deployment remain owner-pending; this assignment did not deploy or access TEST/PROD. The [Master Card Mechanics](docs/MASTER-CARD-MECHANICS.md) remains authoritative for the unchanged engine rules.
