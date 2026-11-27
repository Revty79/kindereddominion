# Kindred Dominion — Battlefield Card Presentation Supplement

This is a visual presentation correction and supplements all prior instructions.

## Core correction

The game is playing in a promising direction, but the battlefield currently looks like a grid of information panels rather than a collectible card game.

**The battlefield must visually present actual cards being played onto tiles.**

We do **not** want creatures displayed primarily as small thumbnails inside large rectangular UI boxes.  
We **do** want the battlefield to look like real portrait cards resting on board spaces.

## Required battlefield presentation change

Rework the battlefield so that each occupied tile displays a **full card-style object** rather than a panel.

Each card on the battlefield should:

- Look like a real collectible card.
- Preserve consistent portrait card proportions.
- Show the decorative Kindred frame.
- Show prominent card artwork.
- Show the permanent card number.
- Show creature name.
- Show Kindred identity.
- Show printed power clearly.
- Show territory/influence information in a visually integrated way.
- Show ability classification or important card type markers where appropriate.
- Clearly distinguish standard creatures, evolutions, and replacement cards.

The card should feel like a physical or digital trading card placed on a board tile.

## Relationship between board tile and card

The board tile is the play space.  
The card is the object occupying that play space.

Visually:

- The tile should remain part of the battlefield grid.
- The card should appear placed within or atop that tile.
- The card should have proper spacing, margins, and visual separation from the tile.
- Use subtle depth cues such as shadow, lift, layering, or slight inset/outset treatment so the card feels like a played object rather than a flat tile background.

Do not make the tile itself become the card.  
Do not make the card disappear into a plain panel.

## Information hierarchy

The card itself should carry the permanent collectible information.

That means the card face should visually prioritize:

1. Artwork
2. Name
3. Printed power
4. Kindred / card number
5. Core card identity markers
6. Influence / territory diagram
7. Important ability text or indicators, depending on scale

Temporary state information should be separate or overlaid cleanly.

## Temporary and contextual gameplay information

Temporary gameplay indicators should **not** replace the card design.

Examples:

- owner/player color
- selected state
- valid target state
- legal placement preview
- buffs/debuffs
- disabled status
- row scoring context
- triggered effects
- hover/focus state

These should appear as:

- glow
- outline
- border highlight
- small badges
- subtle corner markers
- compact overlays
- adjacent UI callouts

The permanent card face should remain recognizable underneath.

## Player ownership display

Ownership should be shown clearly but elegantly, without turning the card into a plain colored panel.

Possible acceptable approaches include:

- a colored accent ring or outline
- a top banner or corner crest
- a faction/owner marker
- a subtle colored glow or trim
- a battlefield-side ownership indicator tied to the card

Avoid drowning the card in flat owner-color rectangles.

## Size and readability

Cards on the battlefield do not need to show every line of text at full detail at all times, but they must still read like cards.

Support at least three presentation levels:

1. **Battlefield size** — compact but clearly recognizable as a full card.
2. **Hand / deckbuilder size** — readable card with more visible detail.
3. **Inspect / zoom size** — fully readable large card.

Hovering, clicking, or focusing a battlefield card should allow the player to inspect a larger version easily.

## Card realism and tactile feel

Aim for the feeling that players are laying cards onto spaces.

The presentation should feel closer to:

- a digital tabletop card game
- collectible cards placed on a tactical board
- physical cards represented in a polished digital form

It should feel less like:

- dashboards
- stat panels
- admin boxes
- list entries
- generic tiles with thumbnails

## Preserve gameplay clarity

Do not reduce board readability in the pursuit of visual polish.

The battlefield still needs to clearly communicate:

- who controls a tile
- which card is present
- current effective power
- row/column relevance where applicable
- scoring context
- available actions

If needed, split information between:

- the card face
- unobtrusive overlays
- side panels
- hover/inspect states

## Mandatory mockup checkpoint

Before rolling this new presentation through the full battlefield, produce a focused demonstration showing:

1. A battlefield row with multiple cards in place.
2. At least one Nature card and one non-Nature card.
3. One evolution card.
4. One replacement card.
5. One selected card state.
6. One hovered or enlarged inspect state.

Provide screenshots for owner review before full implementation approval.

## Restrictions

- Do not change gameplay rules or balance.
- Do not change permanent card numbering.
- Do not regenerate artwork.
- Do not discard the reusable card component plan.
- Do not collapse the design back into text-heavy panels.

The goal is for Kindred Dominion to look like a real collectible card game being played on a battlefield, not a stats interface with image thumbnails.