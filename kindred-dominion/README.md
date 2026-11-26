# Kindred Dominion

Version **0.3.0** · **V1.3A — Advanced Mechanics and Rules Engine Completion**

A standalone, local tactical card game with a real-engine design environment. Play the original V1.1 game, or explicitly activate the **150-card provisional Founding Kindreds** library: five 30-card collections, five pure starting decks and five mixed test decks. No accounts, database server, external AI or paid services are required.

V1.3A adds continuous auras and protection, dynamic power, reactive events, condition transitions, variable magnitudes, historical counters and separate card scoring. The original libraries remain intact. The separate **45-card mechanics laboratory** includes **30 ready-made sandbox scenarios**.

Read the authoritative [Master Card Mechanics](docs/MASTER-CARD-MECHANICS.md), [V1.3A owner guide](docs/V1.3A-OWNER-GUIDE.md) and [validation report](docs/V1.3A-VALIDATION.md). No final commercial cards, illustrations or V1.3B interface redesign are included.

## Try V1.3A

Open **Developer Studio → Battlefield Sandbox → Load saved scenario** and select a LAB example. Execute its prepared action and inspect the effective-power breakdown, score breakdown and resolution snapshots. **Content Versions and Backups** contains **V1.3A · mechanics laboratory**: restore it as a new working draft to edit fixtures, or activate it for new ordinary matches. Export a complete backup before larger experiments.

## Start and stop on Windows

Double-click **`Start Kindred Dominion.cmd`**, or open PowerShell:

```powershell
cd D:\kindereddominion\kindred-dominion
npm run dev
```

Open **http://127.0.0.1:5173/**. Keep the terminal open while playing. Stop with **Ctrl+C**; press **Y** if Windows asks to terminate the batch job.

For a fresh checkout, or after pulling changed dependencies, install Node.js 22.12+ (24 recommended) and run `npm ci` in the application folder first. Dependency installation needs internet once. Gameplay and Studio tools run locally without internet. Use the same browser and address for local saves; `localhost` and `127.0.0.1` are different storage origins. Port 5173 is fixed: stop another instance before starting this one.

## Morning test: where to begin

1. Open **Developer Studio** below Begin match on the home screen.
2. **Card Library** browses all 150 working definitions. Inspect a card, edit it, or duplicate it as a template.
3. To play the five new Kindreds, open **Content Versions and Backups**, find **Founding Kindreds · 150 provisional cards**, and click **Activate for new matches**. Return to game and choose the pure or mixed starting decks. The original V1.1 version remains available in the same table.
4. For the temporary artwork example, activate **Founding Kindreds · temporary artwork validation** instead. It has the same 150 definitions, with a temporary Briar Sprout illustration. Restore it as a working draft to inspect/edit its packaged image in the Studio library. This is testing artwork, not final commercial art.
5. Use **Battlefield Sandbox** to construct a scenario, execute a legal placement, then select a diagnostic step to inspect what happened. Construction and execution are separate.
6. Create a checkpoint and download **Export complete Studio backup** before larger experiments.

New ordinary matches default to the original V1.1 library until a testing version is explicitly activated. Existing matches retain their own definitions and artwork references. Existing owner drafts are preserved when bundled content is added; the new library is available as a saved version even when an older working draft is retained.

## Play

Choose Classic or Domination, computer or local two-player, and two legal decks. Draw five, then keep or exchange up to five cards. Select a hand card, select an illuminated position, review the preview and confirm placement. Standard cards require empty friendly territory with enough rank tokens. Replacement sacrifices an eligible friendly creature; evolution needs its predecessor. Tokens and fortification remain underneath creatures.

Passing is temporary. A card play resets the pass counter; two consecutive passes end the match after effects resolve. Full fields and empty draw piles do not automatically end games. Classic scores full power in winning rows; tied rows award zero. Domination adds one point per surviving creature. Local handoffs conceal private hands.

## Developer Studio

The ten sections cover Overview, Card Library, Card Editor, Collection Manager, Deck Builder and Tester, Battlefield Sandbox, Tactical Ruleset Editor, Match Simulator, Match Replay and Diagnostics, and Content Versions and Backups.

The form-based editor exposes the actual engine registry: all nine triggers, 15 effect variants (including positive/negative power), relative targeting, supported conditions, prerequisites, protection and persistent activation limits. Influence patterns preview both player orientations. Unsupported mechanics are identified, not presented as functioning controls.

Simulation runs in a Web Worker, supports reproducible seeds, alternating starters, mirrored comparisons and round robin pairings, and preserves partial results on cancellation. Normal completed games, sandbox experiments and sampled simulations can be replayed using immutable definition snapshots. Studio data and experimental artwork persist in IndexedDB with conflict protection and a previous-transaction recovery snapshot.

Read the practical [V1.2 owner guide](docs/V1.2-OWNER-GUIDE.md) for complete workflows and [V1.2 architecture](docs/V1.2-ARCHITECTURE.md) for formats, assumptions and limits.

## Artwork portability

Official runtime assets live in **`public/assets/`**; source masters live separately in **`artwork-source/`**. Published definitions contain stable references to immutable, checksummed asset revisions. They contain no embedded source images. Vite copies runtime assets into `dist/`, including for a future mobile wrapper. A Git pull retrieves committed definitions, original sources, optimized WebP artwork and the manifest together.

The Studio can keep experimental artwork locally, generate optimized previews and export approved testing/production packages. It never silently approves an image. Import a reviewed package into the repository with:

```powershell
node scripts/import-content.mjs "C:\path\package.kindred.zip" --validate-only
node scripts/import-content.mjs "C:\path\package.kindred.zip"
npm run validate:assets
```

The importer validates references, checksums, actual image decoding, safe SVG, duplicates and portable filenames before writing. It preserves older asset revisions. Commit the content JSON, manifest, optimized artwork and source masters together. See [artwork publishing and recovery](docs/V1.2-ARTWORK.md).

## Project structure

```text
public/assets/         Runtime cards, card backs, battlefields, icons,
                       animations, audio, branding and asset manifest
artwork-source/        Original source masters and temporary validation study
src/
  engine/              Deterministic rules, scoring, AI, capability registry
  data/                Unchanged original V1.1 cards and decks
  content/             Drafts, validation, versions, imports, IndexedDB,
                       Founding Kindreds and committed published content
  assets/              Image validation, SVG safety, portable references,
                       approved publishing package creation
  studio/              Ten separate owner/developer tool sections
  sandbox/             Controlled scenario construction and validation
  simulation/          Real-engine runner, statistics and worker
  replay/              Immutable recording, reconstruction and diagnostics
  ui/                  Preserved player application and content host
scripts/               Asset import/export/validation and balance runner
tests/                 Engine, content, assets and actual browser workflows
docs/balance/          All 150 definitions, evolution diagrams, decks,
                       matchup CSV, statistics and preliminary findings
```

## Validation and production build

```powershell
npm run typecheck
npm test
npm run test:browser
npm run build
```

On a fresh test machine, run `npx playwright install chromium` before browser tests. Build output is `dist/`. To play that build, stop the dev server and run `npm run preview` on the same address. `prebuild` validates every registered runtime/source asset and published content reference.

To build without the Developer Studio controls:

```powershell
$env:VITE_STUDIO = "0"
npm run build
Remove-Item Env:\VITE_STUDIO
```

To reproduce the full preliminary balance run: `npm run balance`. Full temporary replay reports go to ignored `.local/balance/`; concise JSON, CSV and Markdown evidence goes to `docs/balance/`. The completed run tested **4,720 matches**, with zero engine faults, invariant failures or simulation timeouts. Results are advisory; the current computer is not an expert-play model. See [preliminary balance findings](docs/balance/V1.2-PRELIMINARY-BALANCE.md).

See [V1.2 validation](docs/V1.2-VALIDATION.md) for test receipts, clean-checkout artwork acceptance and known limitations. The original [V1.1 documentation](docs/RULES-AND-ARCHITECTURE.md), [baseline receipt](docs/V1.2-BASELINE.md) and [infrastructure checkpoint](docs/V1.2-INFRASTRUCTURE-CHECKPOINT.md) remain available. No public hosting or V1.3 commercial approval is included.
