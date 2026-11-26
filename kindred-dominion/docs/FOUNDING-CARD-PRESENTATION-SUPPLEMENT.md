# Kindred Dominion — Artwork Integration Supplement: Collectible Card Presentation

This supplements the current Founding Artwork Integration and V1.3 Verification assignment. It does not replace the original assignment.

## 1. Current presentation problem

The current card interface treats creature illustrations as small thumbnails inside informational panels. This is not the intended presentation for Kindred Dominion.

Kindred Dominion is a collectible tactical card game. Its cards should look and feel like professionally designed collectible trading cards, not database entries or ordinary interface components.

The attached reference screenshot demonstrates the general presentation and information layout we are aiming for. Use it as inspiration, not as a design to directly copy.

## 2. Card design requirements

Create a reusable card presentation system with the following requirements:

- Consistent portrait-oriented card proportions.
- Large, prominent creature artwork that occupies a substantial portion of the card.
- Clearly identifiable creature name.
- Clearly visible placement rank and power.
- A graphical territory influence diagram representing the card's actual influence pattern.
- Readable special ability descriptions.
- Permanent collectible card number.
- Kindred identification.
- Distinctive identifiers for evolution and replacement cards.
- Professional decorative framing.
- Consistent positioning of gameplay information across all cards.

Use the original creature artwork we have supplied. Do not regenerate, distort, or permanently crop the master illustrations.

## 3. Kindred visual identities

Each Kindred should share the same fundamental card layout while maintaining its own recognizable visual identity.

| Kindred | Visual direction |
|---|---|
| Nature | Forest greens, leaves, vines, natural wood |
| Mythical | Gold, crimson, ornate legendary framing |
| Arcane | Violet, silver, magical energy and runes |
| Undead | Charcoal, bone ivory, spectral energy |
| Constructs | Bronze, iron, steel, gears and rivets |

These are proposed artistic directions. Final decorative designs remain subject to owner approval.

The cards should feel like members of the same game while remaining visually distinguishable by Kindred.

## 4. Universal card component

Do not independently design 150 individual card layouts.

Build a reusable, data-driven card presentation component capable of rendering every current and future card using:

- Creature artwork
- Card name and permanent ID
- Kindred
- Placement requirements
- Power
- Territory influence pattern
- Special abilities
- Evolution and replacement requirements
- Other applicable gameplay attributes

All displayed information must come from the actual card definition. Do not hardcode illustrative statistics or influence patterns.

The system must support future Kindreds and expansions without requiring a complete redesign.

## 5. Consistency throughout the game

The same fundamental card design should be used throughout:

- Card collection
- Deck builder
- Player hand
- Battlefield
- Card inspection
- Future pack-opening interface

Support appropriately scaled versions for different contexts.

Players should be able to inspect an enlarged, fully readable version of any card.

## 6. Separate gameplay indicators from permanent card design

Temporary gameplay information should not become part of the permanent collectible card layout.

Examples include:

- Legal placement indicators
- Selection highlights
- Temporary power modifications
- Targeting indicators
- Disabled or unavailable states
- Active ability effects

Display these using contextual overlays, highlights, badges, or surrounding interface elements without compromising the underlying card design.

## 7. Performance and future compatibility

The card presentation system must:

- Remain responsive on ordinary computers.
- Support future mobile screen sizes.
- Use optimized runtime artwork while preserving original masters.
- Maintain readable information at different display sizes.
- Avoid unnecessary image duplication.
- Preserve compatibility with the existing Developer Studio publishing pipeline.
- Allow future high-resolution rendering for potential physical card production.

## 8. Mandatory design approval checkpoint

Complete the artwork integration and verification already underway.

Before implementing the new card design throughout the entire application, create an isolated visual demonstration containing:

- One representative card from each of the five Kindreds.
- One evolution card.
- One replacement card.
- Examples at full inspection size, hand size, and battlefield size.

Use actual card artwork, statistics, abilities, and influence patterns.

Provide screenshots for owner review.

**Do not consider the visual design approved until the owner explicitly accepts it.**

Do not change gameplay mechanics, card balance, permanent collectible numbers, or existing evolution relationships as part of this visual redesign.

Our goal is for Kindred Dominion to have its own recognizable, professional collectible card identity from the beginning.