# Rules and architecture — V1.1

## State and determinism

The engine is framework-independent TypeScript. A serializable `GameState` includes a seeded xorshift32 PRNG, configuration, separate player zones, individual instances, lineage records, board cells and an append-only event log. Randomness is supplied only through the match seed. The UI obtains a new seed from browser cryptographic randomness; rematches alternate the previous starting player and use a new seed.

No engine function depends on a wall clock, browser, network or external AI. `act` never mutates its input. Illegal voluntary actions throw before cloning; unexpected failures during resolution return a fault state, a clear log entry and **no match result**. All action chains finish synchronously before the next input is accepted.

Defaults are 3×5, 15 cards, five opening cards, token cap three and fortification cap three. `battlefield(rows, cols)` constructs edge starts; callers can supply arbitrary nonoverlapping starting coordinates, token values and fortification instead. The UI offers 3×5, 3×6, 4×5, 4×6 and 4×8. Configuration rejects malformed dimensions, unsafe numeric values, overlaps and oversized states (maximum 1,000 cells and configured card ceilings).

`SCORING_RULES` is an extensible registry with a scoring function and an optional completion predicate. Classic and Domination are implemented. No other scoring variant is advertised as functional.

## Zones and lineage

Every physical card has an instance ID and exactly one logical location: draw, hand, battlefield, graveyard, evolution stack, or exile. Duplicates receive independent IDs. `assertInvariants` checks that no instance is missing, duplicated between zones, on hostile territory, or occupying a cell with nonpositive power. It also checks token and fortification bounds.

A lineage follows a creature through evolution. The incoming evolution merges its existing restrictions into the predecessor's lineage; prior forms retain that lineage. Activation checks use **both** instance and lineage counters, so returning, re-evolving or resurrecting cannot launder restrictions. Replacement starts with the incoming card's own existing lineage; it does not inherit the sacrificed creature's modifiers, statuses, abilities or restrictions.

Destroying an evolved creature sends every form to its owner's graveyard, with only the active form producing its own death abilities. Other destruction observers see one destroyed creature, not one event per previous form. Evolution moves forms into the stack without death or sacrifice events. Return-to-hand returns every form as a separate hand instance; banishment exiles every form. Neither produces death abilities.

Existing instance power modifiers and granted protections persist through nonbattlefield movement. Therefore a creature reduced to zero by weakening may resurrect and immediately die again unless some other explicitly defined effect restores its power. Resurrection is not an implicit cleanse or heal.

## Territory and direction

Offsets are relative to the controller: positive x faces right for Jade and left for Amber. Positive y always means down; this is horizontal mirroring, not a 180-degree rotation. Out-of-bounds positions are ignored.

Each expansion point resolves individually. On friendly territory it adds one placement token, capped. On neutral territory it claims ownership with one token. On unoccupied enemy territory it removes one fortification, or, when there is no fortification, captures with one token. Removing the last fortification never also captures. Subsequent points reinforce the newly captured cell. Capture clears previous tokens and fortification.

Fortification only increases friendly fortification and never consumes tokens. Overthrow only captures **unoccupied enemy** territory; its strength establishes the new token count and clears old fortification. It does not claim neutral territory or reinforce friendly cells. Ordinary territorial effects never weaken or capture occupied enemy positions. They may reinforce friendly occupied positions. Starting territory has no special protection.

## Placement and turns

Standard placement requires an empty friendly cell and at least the card's rank in tokens. Tokens and fortification are never spent. Replacement and evolution require an eligible friendly occupant, rather than rank tokens; explicit prerequisites may constrain definitions, classifications or current power. Alternatives in a definition/tag list are OR; different prerequisite fields are AND.

Each turn permits one voluntary card placement or a pass. Replacement and evolution consume that action. Summons, ability replacements and ability evolutions are generated placements and do not consume a second action. Generated placements share generation/card ceilings and respect their own placement prerequisites. Summons require standard cards, friendly empty positions and sufficient rank tokens.

For replacement, remove the sacrificed creature, install the incoming creature, then completely resolve the sacrifice/death branch. Next apply the incoming creature's influence and its replacement and placement triggers if it is still on the field. Protection from direct destruction does not prevent sacrifice. For simultaneous ability replacements, all sacrificed creatures leave and all replacements enter before sacrifice abilities resolve.

Beginning-of-turn abilities resolve before drawing. Each player's first turn skips the ordinary draw; later turns draw one if available. Extra ability draws are separate and remain allowed. End-of-turn abilities resolve before scoring and completion. Turn-start/end abilities belong to the active player's creatures. Evolution emits its evolution trigger, not its ordinary placement trigger; replacement emits both replacement and placement. Other-placement observers may see standard placement, evolution, replacement and summoning.

If there are no legal placements, the UI labels the action **Confirm forced pass**. The explicit acknowledgement keeps private handoffs understandable; it is not a withdrawal. A card play resets consecutive passes, including a play that ultimately destroys its own creature. Two consecutive passes finish only after end effects resolve. Empty piles and full fields are never automatic defeats/completion conditions. Only the active player can surrender through the current local turn controls.

## Mulligan and private information

Both players draw five and complete one optional zero-to-five exchange. Selected instances are set aside; replacements are drawn from the existing pile **before** rejected instances are shuffled back. Public logs record completion without selected IDs or card names. Ordinary draw logs show counts only. Every local player handoff removes private hand-card elements from the DOM, conceals selection/previews, displays an opaque curtain and confines keyboard focus to the reveal button. Reloading a local match requires revealing again.

Screen privacy does not defend against browser developer tools, inspecting the disk save, or a development export. The basic computer evaluates candidates using the shared state (including complete state in memory); it is a deterministic development opponent, not a fairness-certified competitive opponent.

## Effects and ordering

Supported data effects: token/fortification modification, ordinary capture, overthrow, positive/negative power, direct destruction, protection grants, draw, generation, summon, replacement, evolution, resurrection, return and banishment. Conditions include friendly population, source power and friendly event ownership. Target selectors support self, triggering card, all positions, relative patterns, relationships, classifications and excluding the source. No rules inspect creature names.

Each multi-target power or destruction effect applies to the whole selected group before death abilities run. Observer eligibility is snapshotted when the batch is removed, including creatures destroyed in the same batch. They can trigger from simultaneous deaths, but self-target effects on an absent source have no battlefield target. Abilities within a simultaneous group resolve with active-player priority, then ascending row, ascending column, declaration order and event ID. Newly generated trigger batches append to the queue; a replacement's sacrifice branch resolves before its own influence. Effects within an ability execute in declaration order, and queued death abilities wait until that ability's current effects finish.

Basic protections are persistent immunity to direct destruction and immunity to negative power effects. Direct-destruction immunity does not stop sacrifice or nonpositive-power death. Weakening immunity does not prevent return, banishment or territory changes. Other protection categories, durations, targeting prompts and arbitrary scripted conditions are not implemented or shown as available mechanics.

## Safeguards

Every ability defaults to one activation per event. Definitions can also specify per-turn and per-match limits; counters persist per instance and lineage. Resurrection checks both individual and lineage resurrection counts against the effect limit and the universal cap. The default universal cap is two; supplied resurrection effects each allow one. Graveyard candidates and resurrection destinations use stable instance/coordinate order. An evolved form requires an eligible live predecessor unless the resurrection effect explicitly sets an override. Replacement-type resurrection uses an empty ranked friendly position and does not sacrifice another creature.

Resurrection applies influence, but placement/evolution and other-placement abilities caused by that resurrection are suppressed by default. An ability must explicitly allow resurrection-triggered activation. Death abilities may still resolve from a later destruction, subject to persistent counters. No death loop gains a fresh identity through resurrection.

At most 30 generated cards and 100 total instances are permitted by default. Generated summons, replacements and evolutions count toward the same ceilings. Reaching these ceilings prevents further generation and logs the safeguard; it does not invent an outcome. Each voluntary action has a shared maximum of 300 effect/trigger/influence resolution steps, including nested sacrifice chains and next-turn start effects. A chain exceeding this limit is treated as a possible infinite loop and halts the match with diagnostics and no result. The test suite exercises an actual recurring destruction/resurrection chain.

## Product limits and future decisions

This is the authorized playable foundation. The 30 cards and four decks demonstrate mechanics, not a certified balanced commercial library. The one-ply computer is intentionally basic. No final artwork, accounts, database, online play, collection ownership, payment, progression, ranking, tournament, public hosting or mobile package is present.

No blocking gameplay decision remains. The documented choices above should be reviewed during owner playtesting: horizontal-only mirroring; empty-cell resurrection of replacement cards; retained modifiers after death/return; returning all evolution forms to hand; suppression of resurrection placement triggers; acknowledgment of forced passes; the five provisional three-copy overrides. These are implemented, explicit assumptions rather than silently unresolved rules. Cross-device saves and rule-version migrations require future work. Capacitor can later host the static React output; no mobile platform files are introduced here.
