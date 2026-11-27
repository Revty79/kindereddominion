# Kindred Dominion — Mandatory Gameplay Viewport and Responsive Layout Correction

## Owner-reported problem

The newly deployed game requires excessive scrolling during normal gameplay.

The owner must scroll within the battlefield, scroll the outer webpage to access the player hand, and repeatedly reposition the screen to perform ordinary gameplay actions.

This is unacceptable for the intended game experience.

Kindred Dominion must behave like a dedicated game interface, not a long scrolling webpage.

## 1. Single-screen gameplay requirement

On an ordinary desktop or laptop display, the entire active match must fit within the available browser viewport at normal 100% browser zoom.

The player must simultaneously be able to see and interact with:

- The complete battlefield.
- All 15 battlefield tiles.
- Both players' scores.
- Row scoring information.
- Territory ownership.
- Placement tokens.
- Fortifications.
- Played creature cards.
- The player's complete hand.
- Turn information.
- Essential match controls.
- Placement and action confirmation controls when applicable.

The player must not need to scroll the page or battlefield to perform an ordinary turn.

## 2. Use the available screen space intelligently

Replace the current oversized, vertically stacked gameplay layout with a responsive game-oriented layout.

Requirements:

- Use the available viewport width and height.
- Keep the battlefield centered and prominent.
- Keep the player hand continuously accessible.
- Use horizontal space for scores and supplementary information where practical.
- Reduce unnecessary margins, padding, headers and oversized interface panels.
- Move nonessential information into collapsible panels, drawers or overlays.
- Calculate card and tile dimensions based on available viewport space.
- Preserve consistent card proportions.
- Recalculate the layout when the browser window is resized.

Do not solve the problem by requiring the owner to reduce browser zoom.

Do not simply hide overflowing content.

## 3. Eliminate nested gameplay scrolling

Desktop gameplay must not require:

- Outer webpage scrolling.
- Vertical battlefield scrolling.
- Horizontal battlefield scrolling.
- Scrolling to access the player hand.
- Scrolling to find action confirmation or turn controls.

Optional scrolling inside a battle log, rules inspector or expanded information drawer is acceptable.

Those panels must not resize or displace the primary battlefield and hand.

## 4. Preserve the approved card presentation

The full-bleed artwork-first card design is approved and must remain intact.

Do not return to thumbnails, text panels or generic creature icons to make the layout fit.

Use responsive scaling of the approved shared renderer.

Cards must continue to look like actual collectible cards placed on battlefield tiles.

Where complete ability text cannot be comfortably displayed at smaller sizes, provide enlarged inspection through hover, click, keyboard or touch.

Inspection should open as an overlay without moving the battlefield or hand.

## 5. Gameplay interaction

Selecting a card, selecting a tile, reviewing the action preview and confirming the action must all be possible without scrolling.

Keep the following immediately accessible:

- Legal placement highlights.
- Selected card indicators.
- Current effective power.
- Printed power.
- Tile ownership.
- Placement tokens and fortifications.
- Confirm and cancel controls.
- Pass turn.

Long ability descriptions, detailed action playback and battle history should be available without consuming excessive permanent screen space.

## 6. Responsive screen sizes

Validate desktop gameplay at a minimum of:

- 1920 × 1080
- 1600 × 900
- 1440 × 900
- 1366 × 768
- 1280 × 720

These are browser viewport test targets. Also test a normal non-fullscreen browser window with browser chrome reducing the usable height.

At these desktop viewport sizes, verify that the complete battlefield, player hand and essential controls remain visible and usable without page or battlefield scrolling.

Provide an optional fullscreen gameplay mode, but do not require fullscreen to make ordinary desktop gameplay usable.

For mobile:

- Provide a deliberate responsive layout.
- Prioritize landscape gameplay where appropriate.
- Keep essential controls and hand access available.
- Avoid nested scrolling whenever practical.
- Do not blindly shrink every element until it becomes unusable.

## 7. Actual acceptance testing

Test the actual PostgreSQL-backed player application, not merely an isolated visual prototype.

Complete a normal match at 100% browser zoom without scrolling the page or battlefield.

Verify:

- Opening hand and mulligan.
- Normal card selection.
- Legal tile selection.
- Action preview and confirmation.
- Evolution and replacement.
- Fortification visibility.
- Computer opponent actions.
- Enlarged card inspection.
- Passing and match completion.
- Browser resizing during a match.

Add automated browser regression checks that verify the battlefield, player hand and essential controls fit inside the viewport, remain visible, and are not clipped or dependent on nested scrolling.

Provide screenshots of actual matches at the required viewport sizes.

## 8. Restrictions

- Do not change gameplay mechanics.
- Do not alter card balance.
- Do not change database structures unnecessarily.
- Do not modify player collections or saved decks.
- Do not redesign the approved collectible cards.
- Preserve Developer Studio and administrative functionality.
- Preserve existing deployment compatibility.

This is a mandatory gameplay usability correction.

The owner must be able to sit down, see the complete game and play an entire match comfortably without constantly moving the screen.

Commit and push the validated correction for owner acceptance on the Ubuntu server.