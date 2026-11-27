# Artwork-first card and battlefield approval study

**Subsequent owner decision:** the [V1.4 directive](V1.4-BRIEF.md) explicitly approves this renderer. Production integration is tracked in [V1.4 progress](V1.4-PROGRESS.md). The original approval-study record below remains historical evidence; individual artwork exceptions remain separate.

November 26, 2026. **Awaiting owner visual approval.** This is an isolated prototype, excluded from ordinary production builds. The [latest direction](ARTWORK-FIRST-CARD-DIRECTION.md) supersedes the former inset-picture design. The [battlefield supplement](BATTLEFIELD-CARD-PRESENTATION-SUPPLEMENT.md) still governs the relationship between card and tile.

## Open the prototype

With the existing development server running:

- http://127.0.0.1:5173/card-design.html — collection, hand and battlefield scale controls; select a card for enlarged inspection.
- http://127.0.0.1:5173/battlefield-design.html — focused five-card row.

If no server is running:

```powershell
cd D:\kindereddominion\kindred-dominion
npm run dev
```

The study needs neither a backend nor browser-local imports. It uses the committed illustrated content directly and never writes a player's workspace, game or database.

## Three rendering layers

1. **Artwork:** `CollectibleCard` renders the revisioned original illustration across the entire 3:4 card face. There is no inset image window. CSS `object-fit: cover` preserves image proportions without stretching; the seven demonstrated illustrations have the preferred portrait ratio. No source or optimized artwork was edited. Non-3:4 portraits would use reversible viewport cropping, and need individual review before rollout.
2. **Permanent information:** a separate transparent overlay carries name, collectible ID, rank/special requirement, printed power, Kindred, actual influence diagram, ability classification/text, tags and a thin decorative border. Gradients support contrast without an opaque text panel. Influence at the creature's own position and multiple effects on one space remain represented. The component takes actual published definitions; it has no effective-power property.
3. **Gameplay state:** `BattlefieldStudy` renders ownership, selected outline/badge, current power and its delta, protection, territory/fortification and scoring outside the permanent card face. These values come from the existing engine. They are never painted into an artwork file or card definition.

The same `CollectibleCard` serves all three prototype scales and the collection examples. Hand text is compact; battlefield shows ability/type indicators; inspection shows the full text. Collection/deck-builder/hand/gameplay integration in the ordinary application remains gated on approval. Existing game components and rules were not changed.

## Prepared position, resolved by the engine

The five row-A tiles remain visually distinct board spaces, with margins around each card, independent edges, shadows, slight rotation, hover/focus lift and a selected outline. A3 begins selected. Click a card to select, double-click to inspect, or use its Inspect button with pointer/keyboard. Escape/backdrop/close dismisses inspection, keyboard focus returns to its opener, and modal focus stays inside the dialog. Mobile scrolls this row locally instead of compressing cards into thumbnails.

`battlefield-scene.ts` builds an explicitly prepared sandbox position, validates it, then executes two genuine actions through `act`: evolve Wolf Cub into Grey Wolf, and replace Lich with Venus Flytrap. It validates the resulting invariants and replay. No fixture power values are inserted into the UI.

| Space | Card | Owner | Printed | Current | Actual state |
|---|---|---|---:|---:|---|
| A1 | N003 Red Fox | Jade | 2 | 3 | Adjacent Crystal Elemental aura +1 |
| A2 | A015 Crystal Elemental | Jade | 3 | 3 | Power aura source |
| A3 | N027 Grey Wolf | Jade | 4 | 5 | Evolved from N002; adjacent aura +1; no other allied Wolf |
| A4 | N026 Venus Flytrap | Amber | 2 | 4 | Replaced U020; permanent growth +2 |
| A5 | C020 Iron Golem | Amber | 7 | 7 | Fully fortified space; continuous destruction/weakening protection |

The row's effective power is 11–11. Classic scores the tied row 0–0. Domination adds the existing survivor points, producing totals 3–2. The scoring toggle uses those existing rules and displays column survivor context.

## Owner review images

- [Full collection, all five Kindreds](founding-artwork/review/collection.png)
- [Hand scale](founding-artwork/review/hand.png)
- [Enlarged full-bleed card](founding-artwork/review/full-inspection.png)
- [Battlefield row with evolution, replacement and selected card](founding-artwork/review/battlefield-row.png)
- [Hovered battlefield card](founding-artwork/review/battlefield-hover.png)
- [Battlefield inspection with current state outside the face](founding-artwork/review/battlefield-inspect.png)
- [Mobile row](founding-artwork/review/battlefield-mobile.png) and [mobile inspection](founding-artwork/review/mobile.png)

Captured in Chromium at 1600×1050 desktop and 390×844 mobile emulation. Images were visually inspected. This is technical evidence and a visual proposal, not owner acceptance or physical-device validation.

## Validation

- **399 automated tests passed**, including two position/replay/scoring regression tests. The published definitions compare equal before and after both scoring variants.
- **Five focused Chromium browser tests passed:** full-bleed dimensions/layers; card/tile separation; printed versus effective power; evolution/replacement/protection; selection, hover, keyboard/modal focus; mobile local scrolling/inspection; all three scales; ordinary application's existing presentation preserved.
- Strict frontend TypeScript, full production build and player build passed. Asset checksums/Git tracking passed: 153 assets in the full output, 152 selected assets in the player output, with no source masters. Both outputs were scanned to confirm that the two prototype HTML entries and prototype CSS/JavaScript were absent.
- The two review pages were checked on the owner's already-running development server at port 5173, without restarting it. Automated browser checks used a separately owned test server on port 5190.
- No engine, balance, published card definitions, permanent IDs, evolution relationships, image bytes, PostgreSQL state, migration or service configuration changed in this pass.

Repeat the checks from the application directory (the normal Playwright configuration starts or reuses the development server):

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test tests/browser/card-design.spec.ts tests/browser/battlefield-design.spec.ts
npm run build
npm run build:player
```

The existing artwork A016/A018 acceptance questions remain separate from this visual checkpoint. At closeout, GitHub main already contained the earlier artwork integration and exception report (`7a8cc2d`). This isolated study is synchronized under the owner's standing Git instruction; that does not authorize application-wide design rollout or resolve those artwork exceptions. Docker/Ubuntu validation remains owner-deferred.
