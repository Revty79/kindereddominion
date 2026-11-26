# Master Card Mechanics — V1.3A

This is the implemented rules reference for designing Kindred Dominion cards. It describes engine **1.3.0**, advanced content schema **2**, and the preserved engine **1.1.0** compatibility path. It does not approve any commercial card or change either preserved Founding library. The executable registry and validators live in `src/engine/registry.ts`, `advanced-validation.ts` and `src/content/validation.ts`.

## 1. Permanent identities and card properties

A definition has a permanent identifier, display name, Kindred, classifications, printed power, placement rank I–III, placement type, influence, triggered abilities and optional permanent protections/copy limit. Description, flavor, rarity, notes and artwork are metadata. They do not execute rules. A display name or illustration can change without renaming a card.

Kinds of executable rules are distinct:

| Definition field | Lifetime and purpose |
|---|---|
| `influence` | One-time territorial effects when the creature is placed, evolved or resurrected |
| `abilities` | Ordered triggered effects, with conditions and persistent activation limits |
| `protections` | Printed permanent destruction/weakening immunity |
| `continuous` | Live source-dependent power or protection grants; never stored as permanent modifiers |
| `scaling` | Live dynamic power calculations, evaluated after auras |
| `scoring` | Pure, nonnegative card bonus points, independently of row power |

There is no arbitrary card script, formula evaluator or executable user code. Different cards can share artwork without sharing identity, statistics or lineage.

## 2. Placement and territory

Standard placement requires an empty friendly position with at least the printed rank in tokens. Tokens are requirements, not spent currency. Replacement requires an eligible friendly creature; evolution additionally requires its explicit configured predecessor criteria. Named predecessors are alternatives; classifications are alternatives; different categories combine with AND. Minimum predecessor power uses authoritative effective power.

Replacement is sacrifice. The incoming creature is present before the sacrificed creature's death/sacrifice branch resolves. Evolution is neither destruction nor sacrifice: previous forms enter a stack, permanent modifiers/protections and lineage restrictions persist, and the incoming form becomes active. Previous forms do not keep their auras, scaling or scoring rules active.

| Influence | Exact behavior |
|---|---|
| Expansion | Each strength point reinforces friendly tokens, removes one hostile fortification, or captures an unfortified empty hostile/neutral position. One point performs one of those operations, never two. Capture resets old tokens/fortification. |
| Fortification | Adds fortification to friendly positions up to the selected ruleset cap. |
| Overthrow | Captures an unoccupied enemy-owned position immediately, clearing fortification and setting tokens to the bounded strength. It does not capture neutral or occupied hostile positions. |

Occupied hostile territory resists ordinary influence. Creature removal does not change its territory, tokens or fortification. Horizontal offsets mirror for Player Two; vertical offsets do not. Positions outside the battlefield are ignored. Existing Classic/Domination defaults remain 3×5, 15-card decks and five opening cards. Larger fields and alternate layouts require explicit selection.

## 3. Authoritative power and dependency rules

Every prerequisite, targeting query, destruction check, score, AI evaluation, real-engine preview, simulation and replay uses the centralized calculation. There is no separate preview or simulator rules model.

```text
intrinsic power   = printed base + permanent net modifier
pre-dynamic power = intrinsic power + eligible continuous power
effective power   = pre-dynamic power + eligible dynamic scaling
```

The inspector separately reports printed power, permanent enhancement, permanent weakening, their net modifier, every active aura source, scaling entries, permanent/continuous protection and effective power. New permanent changes retain positive/negative contributions. Legacy saves or manually prepared snapshots that contain only a net modifier cannot reconstruct unrecorded prior applications; the UI says so.

Calculation layers are deliberately acyclic:

1. Establish intrinsic power and permanent protection.
2. Qualify continuous protection using structural state and **intrinsic** power.
3. Qualify auras and calculate their magnitudes using structural state, safe history and **intrinsic** power.
4. Establish pre-dynamic power and enhanced/weakened classification.
5. Qualify and calculate dynamic scaling using structural state, safe history and **pre-dynamic** power.
6. Add scaling to produce authoritative effective power.

An aura's condition/target power tests read intrinsic power. A dynamic rule's condition/target power tests read pre-dynamic power. Triggered effects and scoring read final effective power. This is an explicit qualification rule, not a search for an oscillating equilibrium. Numerical aura expressions may name base/intrinsic power; dynamic expressions may also name pre-dynamic power. Requests to read effective power recursively from those expressions are rejected before activation/publication. Random queries are forbidden in pure continuous, scaling, condition and scoring calculations.

Enhanced means pre-dynamic power exceeds printed power; weakened means it is lower. Dynamic contributions never cause creatures to recursively classify one another as enhanced or weakened. Aura eligibility uses its earlier intrinsic layer for the same reason.

Multiple eligible auras add. Sources must be active battlefield creatures. A grant disappears immediately when its source leaves, is sacrificed/replaced, evolves into another definition, stops meeting its condition, or no longer targets the recipient. Newly entering eligible creatures receive live grants. Aura values never accumulate into `modifier` merely because a recalculation occurred.

After relevant changes, all nonpositive effective-power creatures are removed as one simultaneous batch. Removing their auras can create another batch. This cascade finishes before another voluntary action. Losing a positive aura can kill a creature even if it has weakening immunity: removing a grant is not applying a negative power effect. Each cascade pass removes creatures; passive calculations themselves do not iterate toward a fixed point.

## 4. Triggered effects — complete list

Effects within an ability execute in declaration order. Each effect selects its target group before mutation. Variable magnitudes and destruction/weakening immunity are captured for that group, preventing earlier targets from changing later targets' amounts. Generated replacement/evolution eligibility is also captured before installing the group. Summoning preserves its original ordered destination checks: earlier summons' influence can affect a later selected destination's rank eligibility, while triggered abilities remain queued until the effect finishes.

| Effect key | Behavior |
|---|---|
| `power` | Apply a signed permanent modifier. Negative changes respect weakening immunity. Zero computed changes do not produce successful-change reactions. |
| `tokens` | Modify friendly placement tokens, clamped to the ruleset cap and zero. |
| `fortify` | Modify friendly fortification, clamped to its cap and zero. Actual increases/reductions produce corresponding events. |
| `capture` | Apply expansion semantics to selected positions. Variable strengths are bounded to 0–100 influence points. |
| `overthrow` | Apply overthrow semantics, with the same bounded strength. |
| `destroy` | Simultaneously destroy eligible creatures that lack direct-destruction protection. Protection is captured for the group before removing a protective source. |
| `summon` | Generate/place the referenced Standard definition into eligible empty friendly territory with sufficient rank. Generation safeguards apply. |
| `replace` | Generate the referenced Replacement definition and perform real simultaneous replacement/sacrifice branches. Prerequisites and generation safeguards apply. |
| `evolve` | Generate the referenced Evolution definition, applying prerequisites, inheritance and lineage rules. |
| `resurrect` | Restore self or the first eligible friendly graveyard instance. Instance, lineage and universal resurrection limits all apply. Evolution requires an eligible predecessor unless explicitly overridden. |
| `draw` | Draw actual available cards. Empty draw piles do not lose the game and do not invent draw events. |
| `generate` | Create the referenced definition in hand, subject to generation/card ceilings. Each instance has its own identity. |
| `protect` | Permanently grant direct-destruction or weakening immunity. |
| `return` | Move the active creature and its stack to the owner's hand without death/sacrifice triggers. |
| `banish` | Move the active creature and its stack to exile without death/sacrifice triggers. |

Resurrection retains permanent modifiers, statuses and match/lineage restrictions. It cannot reset once-per-match abilities. A returning creature can immediately die from persistent nonpositive power; its real resurrection and later destruction are counted. Ordinary resurrection placement/evolution events suppress abilities unless `allowOnResurrect` is explicit. The explicit `resurrected` trigger remains available without that placement opt-in.

When an evolution stack is destroyed, all stages change zone, but it counts as destruction of **one active creature**. Only the active form's own death abilities activate. Eligible other-destruction watchers are captured before the simultaneous batch, including watchers that die in that batch.

## 5. Complete trigger registry

| Trigger | Event scope |
|---|---|
| `placement` | Source Standard/Replacement placement; replacement also has its dedicated trigger |
| `replacement` | Source replaces another creature |
| `evolution` | Source becomes the active evolved form |
| `destruction` | Source dies, including power death and sacrifice |
| `sacrifice` | Source is sacrificed |
| `turnStart` | Beginning of the source owner's turn |
| `turnEnd` | End of the source owner's turn |
| `otherPlacement` | Another creature is placed/evolved; existing resurrection suppression applies |
| `otherDestruction` | Another active creature dies |
| `enhanced` / `weakened` | The source's effective power actually increases/decreases |
| `otherEnhanced` / `otherWeakened` | Another creature's effective power actually increases/decreases |
| `firstEnhanced` / `firstWeakened` | Source's first qualifying increase/decrease during this match/lineage |
| `powerThreshold` | Source crosses a configured value upward, downward or either direction |
| `condition` | A structured condition changes false → true |
| `territoryClaimed` | Neutral territory becomes owned |
| `territoryCaptured` | One player's empty territory becomes the other player's territory |
| `territoryLost` | The prior owner loses territory; event player is that prior owner |
| `territoryFortified` | Fortification actually increases |
| `fortificationReduced` | Fortification actually decreases, including capture clearing it |
| `resurrected` | A creature actually returns from the graveyard to the battlefield |
| `banished` | A creature actually enters exile from the battlefield |
| `returned` | A creature actually returns from the battlefield to hand |
| `drawn` | An available card is actually drawn; initial pre-game dealing is not a reactive battlefield event |
| `generated` | A new hand card is actually generated |

There are 27 trigger keys: slash-paired rows above represent separate keys. General lifecycle/territory/card-change triggers are observed by active battlefield creatures; banished/returned participants can also resolve their own queued departure reactions. Relationship, classification, exact definition, Kindred, cause and source-exclusion filters are available where applicable.

Enhancement/weakening reactions default to explicit permanent-power changes. Aura/dynamic reactions require opt-in. A mixed change can have several contributing kinds, and a matching ability reacts once to that event. Power crossings default to all actual effective-power transitions; their filters can restrict causes/kinds. Generic condition transitions independently observe their evaluated conditions.

First-change flags persist by lineage and change kind. Evolution, resurrection and returning to hand do not reset match-long history. First-change and threshold/condition abilities default to once per match. Explicit `repeatable` permits later false-to-true/crossing transitions; other configured limits still apply.

## 6. Structured power events and captured participants

An effective power-change event records event ID, affected instance, previous/new **effective** power, net amount, source, cause, primary kind, permanent/aura/dynamic flags and each numerical component. One recalculation produces one real transition per affected creature, rather than presenting intermediate arithmetic as fictitious battlefield states. If contributions cancel and effective power is unchanged, no successful-change event is emitted.

The primary kind prefers permanent, then aura, then dynamic. Flags/components retain mixed contributions. Reaction direction follows the actual net effective change. `source` identifies the causal source supplied by the resolving action/effect; current aura contributions additionally identify every granting creature and rule in the power inspector. Prevented effects and capped fortification do not create successful-change reactions. Diagnostic snapshots explain prevention.

Replacement, evolution, sacrifice and destruction preserve immutable participant records: identity/definition, owner, classifications, Kindred, printed/effective power, permanent modifier, protections, stack depth, former position and cause. Incoming replacement/evolution identity is retained where applicable. Simultaneously removed watchers retain their own prior power/stack context. Event values can therefore be used after zone changes without consulting an unrelated incoming creature or losing an aura-dependent sacrifice value.

Live targeting and captured context are different. `event`, `incoming`, `sacrificed` and `destroyed` select the exact captured instance **if it is currently on the battlefield**. They never target a replacement merely because it occupies the former square. A later resurrection within the same chain can make that exact instance a live target again; laboratory fixtures demonstrate this. Captured numerical values remain available even while the participant is off-field. Unavailable event-specific numeric values evaluate to zero.

## 7. Numerical expressions

Supported expressions are fixed safe integers; named values; battlefield aggregates; historical counts; addition; subtraction; multiplication/division by a configured constant; and a minimum/maximum clamp. Expressions nest at most eight levels. Intermediate numerical results and power layers are bounded to ±100,000. Unsupported kinds, invalid references, unsafe dependencies, nonfinite constants, zero divisors and excessive nesting are rejected.

| Named value | Meaning |
|---|---|
| `sourceBase` / `targetBase` | Printed definition power |
| `sourcePower` / `targetPower` | Authoritative effective power for triggered effects/scoring; a departed event source uses captured power |
| `sourceIntrinsic` / `targetIntrinsic` | Printed plus permanent power |
| `sourcePreDynamic` / `targetPreDynamic` | Power after auras and before scaling |
| `eventPower` | Frozen event participant effective power |
| `sacrificedPower` | Frozen sacrificed participant power, only for a sacrifice context |
| `destroyedPower` | Frozen active participant power for destruction, power death or sacrifice |
| `incomingPower` | Frozen incoming participant power at the capture point |
| `stackDepth` | Active form plus its prior stages; departed sources retain captured depth |

Aggregates can count creatures/positions, sum tokens/fortification, or sum eligible creature power. The same target/filter builder selects their scope. For scaling, summed powers are pre-dynamic; for auras they are intrinsic. These queries cannot read their own final contribution.

Division rounding is explicit: `floor` (default), `ceil`, `nearest` (ties toward positive infinity), or `truncate` (toward zero). Multiplication and other fractional intermediate results truncate toward zero when converted to an integer. Constants must be finite with magnitude at most 100; divisor magnitude must be at least 0.001. Use clamps for designer-specific bonus limits.

Examples available through forms:

- Half a captured sacrifice's power, rounded down.
- Two power per other friendly Wolf, capped at six.
- One power per weakened enemy, using pre-dynamic classification.
- Half the eligible pre-dynamic power in a column.
- Historical enemy destructions, capped at four.
- One bonus point per fortified friendly position, capped at three.

## 8. Structured conditions

| Condition kind | Exact test |
|---|---|
| `friendlyCount` | At least a specified friendly live population |
| `sourcePower` | Source power at least a threshold, in the permitted calculation layer |
| `eventFriendly` | The event's affected player is the source owner |
| `compare` | Compare two supported numerical expressions using ≥, >, ≤, <, = or ≠ |
| `position` | Source row and/or column, optionally an edge; coordinates are zero based |
| `evolutionStage` | Required stack depth and named/classified stages, on the source or an explicitly selected live population |
| `and` / `or` | All/any of 1–16 nested conditions |
| `not` | Negate a nested condition |

Presence, owned territory, token/fortification thresholds, occupied/empty cells, enhanced/weakened population and row/column tests use numerical aggregates plus comparisons. Event ownership/participant expressions are unavailable in passive/scoring calculations. Conditions nest at most eight levels. No free-form executable formulas exist.

Condition triggers store prior truth by lineage/ability. Remaining true does not repeatedly activate them. Construction is not fabricated gameplay history: a condition already true in a constructed scenario is first observed at execution, whereas existing constructed aura contributions are simply part of that starting state.

## 9. Complete target selection and filtering

Target kinds: `self`, `event`, `incoming`, `sacrificed`, `destroyed`, `all`, `pattern`, `adjacent` (eight neighbors), `orthogonal`, `diagonal`, `row` and `column`.

Filters combine with AND. Alternatives within a classification, Kindred or definition list combine with OR. Available filters:

- Friendly/enemy/any creature or position relationship; exclude source.
- Exact active definition, classifications and Kindreds.
- Friendly/enemy/neutral/any territory ownership, independently of creature relationships.
- Occupied or empty positions.
- Explicit zero-based row/column.
- Minimum/maximum tokens, fortification and permitted-layer power.
- Enhanced/weakened status before dynamic scaling (intrinsic during aura qualification).
- Maximum target count and coordinate, reverse or seeded-random ordering.

Rows/columns default to the source's row/column unless explicitly selected. Relative patterns retain horizontal player mirroring. Coordinate order is top to bottom, left to right. Original legacy pattern effects retain their declared offset order unless new ordering/caps are explicitly supplied. Random selection uses the match RNG and is only supported for effects. Pure conditions/aggregates/scoring/auras cannot consume randomness. Interactive player-selected ability targets remain unsupported.

Creature effects require live creatures. Territory effects operate on positions according to their existing ownership restrictions. A filter cannot bypass sacrifice, rank, generation or evolution safeguards.

## 10. Protection

Permanent protection comes from printed definitions or `protect` effects. Continuous protection comes from eligible live `continuous` rules and is listed separately with its source. Conditions use the acyclic qualification layer described above.

Destruction immunity prevents direct destruction only. Weakening immunity prevents negative permanent power effects and negative continuous/scaling grants. Neither protection prevents sacrifice, evolution, return, banishment, zero-power death or loss of a positive aura. There is no implicit indestructibility or protection against every removal type.

## 11. Historical counters

Supported event categories: `played`, `destroyed`, `sacrificed`, `resurrected`, `evolved`, `replaced`, `enhanced`, `weakened`, `generated`, `drawn`, `claimed`, `captured`, `lost`, `fortified`, `fortificationReduced`, `banished`, `returned`.

Counters are aggregated by event, affected player, active definition/classifications/Kindred where applicable, and cause. Filters can query those dimensions together. Current population and lifetime history are separate. Territory categories identify the acting definition when one exists; `lost` uses the prior territory owner's player identity.

`played` counts successful normal/ability placements and incoming replacement/evolution forms; resurrection has its own category. A destroyed evolution stack counts once for its active form. `enhanced`/`weakened` history counts successful **permanent modifier applications** (sign of that modifier), not repeated passive recalculation. An effective-power reaction separately requires a real net transition; this distinction avoids feeding derived recalculation back into its own historical count. Initial pre-game dealing is not reconstructed as an in-match draw history. No unavailable pre-save history is invented for old states.

Typical causes include `placement`, `replacement`, `evolution`, `resurrection`, `powerEffect`, `destruction`, `sacrifice`, `power`, `return`, `banish`, `draw`, `generate` and `influence`; the actual immutable event/inspector record is authoritative. History has a 4,096-bucket ceiling and bounded integer counts. It persists through deterministic actions and replay.

## 12. Scoring

1. Compute effective live power and ordinary row winners. Ties win neither side.
2. Classic awards the full power of each winning row. Domination adds one point per surviving creature.
3. Evaluate eligible surviving card bonuses without changing row/column winner decisions.
4. Add separate card bonuses to the tactical result.

Bonus requirements are `survives`, `rowWon`, or `columnWon`. Column winning compares effective creature power, not prior bonus points. Additional structured conditions can test position, row/column population, controlled/fortified territory, history and other supported values. Amount expressions provide configurable caps.

Card bonuses are nonnegative: a negative calculated amount contributes zero. They are not a new tactical scoring system or a way to make a tied row win itself. A bonus never changes the conditions that awarded it. The UI separates ordinary winning-row points, tactical ruleset points, bonus sources and final totals. Scoring is pure: it consumes no RNG, changes no state/counters and creates no actions/events. Score arithmetic has an additional bounded aggregate ceiling derived from the maximum card count.

## 13. Resolution sequence and safeguards

Actions validate against the original committed state, then resolve on a private copy. The approved replacement sequence remains: capture predecessor, sacrifice/remove its active stack, install incoming creature, resolve the sacrifice branch with that creature already present, then incoming influence/placement abilities.

For advanced mutations:

1. Capture relevant participants, target group, variable amounts and protection decisions.
2. Apply placement/influence or the declared permanent effect.
3. Recalculate continuous protection, aura power, dynamic power and effective power in their fixed layers.
4. Record real net power transitions and their components.
5. Remove nonpositive creatures simultaneously; repeat only when removing sources creates another death batch.
6. Observe condition transitions and enqueue eligible reactions.
7. Drain automatic ability chains, recalculating after each mutating effect.
8. Finish ordinary turn-end/turn-start/draw flow and calculate final scores when normal completion applies.

Event waves remain FIFO. Each enqueued batch uses active-player priority, then battlefield row/column, declaration order and event identifier. Newly generated work appends to the queue; influence-generated reactions can therefore precede the later placement-trigger batch. Existing sacrifice/death branch ordering is preserved. Queued departure/death watchers use captured positions and participants even if they have since left play.

Safeguards remain active in Standard and Free Play:

- Persistent instance/lineage per-event, per-turn, per-match and resurrection limits.
- A causal lineage/ability chain prevents a reaction from reentering itself indirectly.
- Explicit transition truth prevents repeated activation while a condition stays true.
- Acyclic passive power layers; unsupported recursive reads and pure random queries are rejected.
- Bounded expressions, power layers, history, card generation, live card count and resolution work.
- Existing configurable simulation action limits remain separate from legitimate game completion.

An unexpected advanced resolution fault rolls the action's state back, halts the match, records clear diagnostics and awards no competitive result. Partial diagnostic snapshots remain read-only evidence. Ordinary passing still ends the match only after two consecutive passes after automatic effects; playing resets that counter. Empty decks/full fields do not silently add new completion rules.

## 14. Compatibility and owner workflow

The original 30 cards, the 150 provisional definitions, their decks/artwork and default rules are preserved. Libraries without advanced mechanics retain the legacy state/signature path. Recorded engine-1.1.0 matches reject advanced definitions and continue reconstructing from their immutable snapshots. Engine-1.3.0 records explicitly retain advanced state/counters, exact definitions, actions, signatures and artwork. Unknown versions/divergence are reported; historical matches are never silently rewritten.

Advanced cards require content schema 2 / engine 1.3.0. Saving/importing an advanced card upgrades the working draft, not immutable baseline versions. Workspace, transfer and replay envelopes remain schema 1 with explicit supported engine versions; advanced game state has a version-2 mechanics block. Old transfers remain readable. Old executables will reject advanced content rather than interpreting it as ordinary cards.

Use Card Editor's continuous/scaling/scoring sections, recursive condition/expression builders and reactive filters. Create a checkpoint, explicitly activate it for new ordinary matches, or use Sandbox/Simulator snapshots. See [owner instructions](V1.3A-OWNER-GUIDE.md).

The separate laboratory contains 45 development fixtures, four valid decks and 30 ready-made scenarios. It does not add cards to either Founding library or auto-activate itself. Bundled lab data is excluded from a clean `VITE_STUDIO=0` build; an existing owner's local stored experiments are preserved. Approved artwork remains separately versioned, portable and packaged through the existing publication process.

## 15. Unsupported and deferred

No arbitrary scripts/formulas, recursive final-power aura/scaling dependencies, pure-calculation random targeting, interactive ability-target prompts, timed poison/status duration system, new complete tactical rulesets, advanced AI, final commercial card design/artwork, online services or mobile platform projects are implemented. Auras/scaling are continuous calculations, not a general duration/status engine. V1.3B's player-interface redesign requires separate owner review and authorization.
