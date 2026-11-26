# V1.1 validation and handoff

Completed locally on **November 26, 2026**. Application version **0.1.0**. Scope: the standalone project at `D:\kindereddominion\kindred-dominion`; no other application or project was changed.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | Passed, strict TypeScript |
| `npm test` | **50 passed** |
| Seeded engine match simulations | **24 complete matches** inside the integration suite, 12 per tactical ruleset, all finished without faults and with invariant checks after every action |
| `npm run build` | Passed; static production output in `dist/` |
| `npm run test:browser` | **7 passed**, Chromium, approximately 36.5 seconds on this machine |
| Production build browser smoke | Passed against `npm run preview` on port 5173: setup, both mulligans, computer turns, legal selection, influence preview, committed placement, surrender and final result |
| Production browser console | Zero errors, zero warnings on the fresh production page |
| External requests during gameplay | None in the complete human-versus-computer browser test |

The production smoke used the compiled `/assets/index-D_y8AvFd.js` bundle, not Vite's source modules. Its final result was Amber by surrender, 0–5. This verifies a real compiled application flow; complete matches to ordinary two-pass scoring are separately covered by the browser suite.

## Automated mechanics coverage

- Standard empty initialization, individual instances, configurable starts/caps, 3×6, 4×5, 4×6 and 4×8, and rejection of overlapping starts.
- All 30 cards and four supplied decks; exact 15-card size, duplicate defaults and overrides, Free Play, unknown IDs, single/mixed collections, no rank-distribution requirement.
- Zero/one/five-card mulligans, rejected-instance exclusion, opponent isolation, invalid selections, deterministic seeded shuffles, alternating rematches, opening-turn draw skips and later draws.
- Horizontal directional mirroring, out-of-bounds targets, empty friendly ranked placement, lower ranks on stronger positions, ordinary reinforcement and independent fortification.
- Sequential fortified capture, final-fortification boundary, overthrow, occupied hostile immunity and capturable starting territory.
- Replacement prerequisites, territory preservation, sacrifice buffs affecting the installed replacement, replacement of replacements, branching and multistage evolution, modifier/protection/lineage retention.
- Whole-stack destruction with only active-form death triggers, return, exile, simultaneous destruction, active-player/coordinate trigger order, conditional power, summons and generated placements.
- Direct-destruction and weakening protections, limited resurrection, resurrection trigger suppression, evolved resurrection prerequisites and explicit overrides, activation restrictions after movement.
- Turn/match activation caps, generation ceilings, a controlled low-resolution bound, and an actual repeating self-destruction/observer-resurrection chain that halts with a fault and no match result.
- Full-board actions, empty draw piles, pass recovery and reset, two-pass completion, both scoring rulesets, column counts, evolution counting, draws and surrender.

## Actual browser scenarios

1. **Complete local Domination match:** startup, a two-card mulligan, private handoffs, real hand/card/cell/preview/commit interactions through final scoring; reload/recover midmatch; invariant checks; rematch with alternating starter. No private hand-card elements exist while the curtain is displayed.
2. **Complete human-versus-computer match:** normal UI actions through a final result; the computer uses the shared validator. No external gameplay requests.
3. **Library and custom deck:** browse all 30 cards, type a multi-character search without losing focus, construct a legal 15-copy Free Play deck, enforce the 15-card ceiling and verify distinct instance IDs.
4. **Touch emulation:** Chromium with touch/mobile settings at 390×844; no document-wide horizontal overflow, intentionally scrollable battlefield, card and cell taps, readable preview, committed placement and surrender. This is emulation, not a physical Android/iOS acceptance claim.
5. **Full battlefield:** controlled saved-state fixture with 15 occupied positions; replacement and sacrifice, a subsequent evolution, stack retention and graveyard inspection, while ordinary completion remains inactive.
6. **Death and resurrection:** controlled saved-state fixtures; a Convergence preview and committed simultaneous removal of three creatures; direct destruction followed by a visible, once-limited Revenant resurrection.
7. **Larger board and unavailable storage:** select 4×8 in setup, render 32 playable cells, report disabled local storage and continue into playable turns.

The browser fixtures are created by the test code and loaded through the normal saved-match path. There is no debug mutation API or special gameplay bypass in the shipped UI. Ordinary complete-match tests start from the normal setup screen.

Rendered desktop and narrow-screen screens were also visually inspected. Local evidence (ignored generated artifacts):

- `.local/setup-desktop.png`
- `.local/match-desktop.png`
- `.local/browser-local-result.png`
- `.local/browser-mobile-preview.png`

## Implementation and review limits

This stage is technically playable and tested. Owner playtesting, artistic acceptance and a competitive balance assessment remain human review work. The 30 provisional definitions are not a completed 150-card commercial library, and the one-ply computer is a development opponent.

The effect engine implements the documented categories and basic conditions/protections. It does not provide arbitrary scripting, user-selected ability targets, timed statuses, online authority, physical-device packaging or an offline service-worker installation. Gameplay works without internet while the local server is running. Fresh dependency/browser installation needs internet once.

Local saves are browser/origin-specific and retain one match plus custom deck drafts. There is no cross-device account, encryption, autosave history or imported replay system. Development records include both hands. Save schema version 1 is checked; future incompatible rule changes will need an explicit migration policy.

There are no blocking unresolved gameplay decisions. Implemented assumptions, including persistent modifiers, resurrection behavior, trigger ordering and copy overrides, are listed in [RULES-AND-ARCHITECTURE.md](RULES-AND-ARCHITECTURE.md) for owner review. No later development stage or public release is implied by this validation.

## Owner run instructions

Double-click `Start Kindred Dominion.cmd`, or:

```powershell
cd D:\kindereddominion\kindred-dominion
npm run dev
```

Open **http://127.0.0.1:5173/**. Stop with **Ctrl+C** in that terminal, then **Y** if prompted. Test servers were stopped after validation so the preferred port is available for the owner's launcher. See [README.md](../README.md) for fresh-computer setup, production preview and the complete project structure.
