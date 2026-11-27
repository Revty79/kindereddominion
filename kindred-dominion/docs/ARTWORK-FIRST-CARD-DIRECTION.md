# Kindred Dominion — Original Card Design Direction Clarification

Owner direction received November 26, 2026. This supersedes earlier visual instructions that place artwork inside a separate image window.

We need to return to our original artwork-first card presentation concept.

The creature illustration itself is the entire card face.

Do not place the artwork inside a separate picture box, thumbnail container, or traditional text-heavy card layout.

## Required architecture

Each playable card consists of three independently rendered layers:

**Layer 1 — Artwork**

- Full-bleed creature illustration.
- Occupies 100% of the card face.
- Preserves our original 3:4 portrait proportions.

**Layer 2 — Permanent card information**

- Transparent or semi-transparent information overlays.
- Creature name.
- Permanent collectible ID.
- Placement rank or special placement requirement.
- Printed power.
- Territory influence diagram.
- Ability information.
- Kindred identification.
- Optional thin decorative Kindred border.

The artwork must remain the dominant visual element.

**Layer 3 — Dynamic gameplay state**

- Current effective power.
- Ownership.
- Selection.
- Legal placement.
- Buffs and debuffs.
- Evolution and other temporary gameplay indicators.

## Battlefield presentation

When a card is played, place this actual portrait card onto the battlefield tile.

The tile and card must remain visually separate objects.

Use the same underlying artwork-first card component for the collection, deck builder, player hand, battlefield, and enlarged card inspection.

Scale the component appropriately rather than replacing it with thumbnail-based information panels.

## Approval checkpoint

Create an isolated visual prototype using our actual artwork and card data.

Demonstrate the full-bleed artwork with transparent information overlays at hand, battlefield, and inspection sizes.

Provide screenshots for owner approval before implementing the design throughout the game.

This clarification supersedes any previous visual instructions that imply placing the artwork inside a separate image window.

Do not modify gameplay mechanics or balance.
