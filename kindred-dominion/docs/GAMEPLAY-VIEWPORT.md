# Gameplay viewport correction

Owner directive: [mandatory viewport brief](GAMEPLAY-VIEWPORT-BRIEF.md). This is a gameplay presentation correction layered onto V1.4. It introduces no migration, card, artwork, engine, balance, ownership or deck-rule change. The V1.5 administration/operator work remains a separate milestone.

## Player behavior

The active PostgreSQL-backed match occupies the available browser viewport at 100% zoom. A compact score/control header sits above a centered 5-by-3 battlefield and a continuously accessible hand/command area. All 15 tiles and three row-score summaries are present together. Grid rows and card dimensions follow the available viewport size; resizing does not require a reload.

Desktop has no outer page, battlefield or hand scrolling. Each card remains the approved shared full-bleed 3:4 face, placed as a distinct portrait object on its tile. Ownership, legal destinations, tokens, fortifications and current/printed power remain independently visible. The hand uses two columns, with row count following the actual hand size. Keep/exchange, pass, placement confirmation and cancellation stay in a fixed command dock.

Long consequences, playback, graveyard/draw counts, history and surrender live in a focus-managed overlay. Opening/closing inspection or a details panel leaves the battlefield's position unchanged. The main dock retains the immediate placement summary and confirm/cancel actions; its consequences button opens the full explanation. Fullscreen is optional. It is never needed to fit the required desktop sizes.

Mobile keeps the complete board visible and provides a single deliberate horizontal hand swipe rail. There is no vertical battlefield/hand nesting or outer-page turn navigation. Portrait gives a compact overview; landscape gives more space. In short landscape windows, enlarged inspection pairs the unchanged portrait face with readable ability/prerequisite/current-power text in an overlay. Small-screen selection, placement and confirmation were exercised with actual touch events. Optional overlay text/log scrolling does not displace the board.

## Actual acceptance

The application was exercised with newly registered synthetic accounts in the separately owned PostgreSQL instance, using normal 30-card starting collections and existing saved starter decks. No authentication stubs, injected battlefield states, seeded private RNG, fabricated results or owner account/deck changes were used.

| Browser viewport | Complete board, hand and essential controls | Scrolling required |
|---|---|---|
| [1920 x 1080](viewport/match-1920x1080.png) | Pass | None |
| [1600 x 900](viewport/match-1600x900.png) | Pass | None |
| [1440 x 900](viewport/match-1440x900.png) | Pass | None |
| [1366 x 768](viewport/match-1366x768.png) | Pass | None |
| [1280 x 720](viewport/match-1280x720.png) | Pass | None |
| [Normal browser window](viewport/normal-browser-window.png): outer 1366 x 768, usable 1350 x 673 | Pass, browser chrome present, fullscreen false | None |
| [Mobile portrait 390 x 844](viewport/mobile-390x844.png) | Complete board/turn controls; accessible hand rail | Horizontal hand swipe only |
| [Mobile landscape 844 x 390](viewport/mobile-844x390.png) | Complete board/turn controls; accessible hand rail | Horizontal hand swipe only |

The desktop journey covered opening hand, inspection, all five resizes during a match, legal selection, immediate preview, confirmation/cancellation, optional consequence overlay, optional fullscreen and a legitimate complete normal match. Instrumentation recorded **zero primary scrolling events**. A touch-enabled mobile journey also completed normally and retained the final board/result after rotating back to portrait. Real server actions demonstrated evolution, replacement and [visible fortification](viewport/fortification-visible.png), using the existing owned Nature starter. Deterministic saved records were verified by the existing replay validator. [Opening hand](viewport/opening-1280x720.png), [confirmation dock](viewport/placement-confirmation.png), [landscape inspection](viewport/mobile-landscape-inspection.png), [mobile result](viewport/mobile-result.png).

The browser regressions check document and battlefield scroll extents/positions, all tile/score/ownership/resource bounds, every desktop hand card/control, preserved card/artwork proportions, hit-testing of essential action buttons, readable short-landscape inspection and unchanged board bounds under overlays. A real non-fullscreen Chromium window was launched rather than estimating browser-chrome height. This case requires a desktop or Xvfb on Linux; its Windows acceptance was run, not skipped.

Four dedicated viewport cases and the existing collection/custom-deck/full Classic/acquisition plus exchange/resume/full Domination browser journeys passed. Frontend/backend typechecks, automated engine/content tests and compiled builds are recorded in the accompanying acceptance receipt. Initial test iterations caught narrow-phone resource labels extending outside a tile, the inherited headed-browser scale-factor fixture option and a legacy inspection font override. These were corrected and rerun; no gameplay gate or engine limit was relaxed.

## Reproduce

The normal owner launcher remains unchanged:

```powershell
cd D:\kindereddominion\kindred-dominion
npm run dev:all
```

Do not start a second launcher over existing listeners. Start a normal match from **Play**. No browser zoom adjustment is needed. This frontend correction is compatible with the deployed V1.4 backend and needs no database migration. The owner and Ember will install the reviewed correction on Ubuntu; this work did not connect to or modify that live server, its tunnel or its existing player data.

To repeat the automated test on this prepared isolated Windows environment, serve the application through the matching API proxy and use its private configuration:

```powershell
$env:KINDRED_ENV_FILE='.local/v1.5/acceptance.env'
$env:KINDRED_ACCOUNT_URL='http://127.0.0.1:5210'
node node_modules/@playwright/test/cli.js test --config server/playwright.config.ts viewport.spec.ts collections.spec.ts matches.spec.ts
Remove-Item Env:KINDRED_ENV_FILE
Remove-Item Env:KINDRED_ACCOUNT_URL
```

The test refuses owner DEV/TEST/PROD. Its accounts, snapshots and logs remain private/ignored; only curated screenshots and aggregate acceptance evidence are committed. Visual and physical-device acceptance by the owner remain separate from this technical/browser verification.
