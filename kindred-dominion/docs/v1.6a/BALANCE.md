# V1.6A starter balance evidence

These are seeded computer-opponent results, not human playtesting or owner acceptance. The recipe remains inactive. The main study used seed `160120261`, 100 matches per primary pairing, mirrors, and both starting positions in Classic and Domination. It completed 4,616 matches across primary, alternatives, legacy comparisons and repeated determinism checks. A separate 240-match active-turn observer matched 30 unchanged simulation-runner signatures. All completed without faults, timeouts, invariant failures or loop safeguards.

Exact proposal digest: `6420f2e5ee092fed9e09f7d7efcd81cfd9608b3e24fea8e5b4be2e0e9023cee3`. The JSON artifact includes the full studied proposal; its `sourceCommit` identifies the unchanged engine parent, while `workingTreeProposal` explicitly identifies the then-uncommitted new deck input. No card mechanics or proposal definitions changed during this study.

## Recommended decks against other Kindreds

Mirror matches are excluded from these rates; each deck has 400 cross-Kindred games per scoring mode. Wins, losses and draws divide by all 400 games. These are descriptive estimates from one AI and seed schedule, not independent human skill samples.

| Kindred | Classic W / L / D | Classic win rate | Domination W / L / D | Domination win rate |
| --- | --- | --- | --- | --- |
| Nature | 215 / 179 / 6 | 53.75% | 216 / 180 / 4 | 54.00% |
| Mythical | 256 / 140 / 4 | 64.00% | 248 / 148 / 4 | 62.00% |
| Arcane | 231 / 162 / 7 | 57.75% | 228 / 167 / 5 | 57.00% |
| Undead | 205 / 191 / 4 | 51.25% | 216 / 178 / 6 | 54.00% |
| Constructs | 79 / 314 / 7 | 19.75% | 80 / 315 / 5 | 20.00% |

**Balance concern requiring owner review:** Constructs wins about one fifth of cross-Kindred matches; Mythical leads. The proposal is legal and playable, but the results do not establish balanced matchups. No gameplay values or limits were changed to equalize the table.

## Starts, opening hands and match length

| Mode | First-player wins / matches | First-player win rate | Draws | Mean actions |
| --- | --- | --- | --- | --- |
| Classic | 812 / 1500 | 54.13% | 22 | 22.64 |
| Domination | 824 / 1500 | 54.93% | 19 | 22.76 |

First-player totals include mirrors. Actions include both opening mulligans and any passes; they are not elapsed seconds or full rounds.

Each mode observed 600 hands per Kindred, across both positions. Nature and Undead had 600/600 initially playable hands. Mythical, Arcane and Constructs had 598/600. **All five reached 600/600 after the actual AI mulligan** in each mode. These finite samples do not guarantee every possible opening hand.

## Actual placement development and conditional hands

The separate active-turn observer uses seed `160120262`, eight games per pairing and both positions. Metrics include late, crowded boards. A currently unplayable hand instance can become legal later. It is not a permanently dead card or a failed match.

| Mode / Kindred | Hand instances without a legal placement | Turns without a legal play | Mean available coordinates | Mean owned rank-two-or-higher sites | Evolution instances currently unplayable |
| --- | --- | --- | --- | --- | --- |
| Classic / Nature | 35.3% | 9.8% | 2.79 | 2.18 | 69.8% |
| Classic / Mythical | 39.8% | 12.8% | 2.50 | 1.40 | 70.9% |
| Classic / Arcane | 45.9% | 13.7% | 2.86 | 1.97 | 65.4% |
| Classic / Undead | 25.6% | 6.3% | 2.80 | 1.95 | 62.9% |
| Classic / Constructs | 42.3% | 11.5% | 2.69 | 0.94 | 42.5% |
| Domination / Nature | 35.9% | 9.1% | 2.75 | 2.21 | 69.2% |
| Domination / Mythical | 40.9% | 13.8% | 2.49 | 1.37 | 67.9% |
| Domination / Arcane | 46.9% | 13.8% | 2.76 | 2.05 | 60.0% |
| Domination / Undead | 27.2% | 5.5% | 2.84 | 1.87 | 60.3% |
| Domination / Constructs | 45.1% | 11.6% | 2.76 | 1.10 | 30.1% |

Across the main Classic study, 5,413 of 7,315 drawn evolution instances ended in played locations (74.0%); Domination recorded 5,309 of 7,334 (72.4%). This final-location proxy can include destruction or stacking, and can miss cards returned to hand. It is not an evolution-action count. Explicit predecessor inclusion is independently validated in every proposed deck.

Drawn-minus-played instances were 21,890/48,070 (45.5%) in Classic and 21,748/48,088 (45.2%) in Domination. These include deliberately held cards and final-hand cards; use the actual legal-placement table above when assessing dead-hand risk.

## Alternatives and unchanged starter comparisons

Two distinct legal alternatives per Kindred are included in the proposal. Each three-deck within-Kindred study used 20 games per pairing including mirrors: 120 matches per Kindred per mode. They demonstrate legal alternative strategies, not proof of superior competitive performance.

The primary-versus-original comparison used 40 mirrored games per Kindred per mode:

| Kindred | Proposed vs original, Classic W / L / D | Proposed vs original, Domination W / L / D |
| --- | --- | --- |
| Nature | 18 / 20 / 2 | 22 / 18 / 0 |
| Mythical | 26 / 14 / 0 | 25 / 15 / 0 |
| Arcane | 32 / 8 / 0 | 28 / 11 / 1 |
| Undead | 24 / 16 / 0 | 24 / 16 / 0 |
| Constructs | 24 / 15 / 1 | 26 / 13 / 1 |

Nature is not a demonstrated straight upgrade over its original deck in this small head-to-head sample. Constructs improves against its own original starter while remaining weak against the other proposed Kindreds. Salvage battery slightly exceeds Forged advance in the small Domination alternative study (43/36/1 vs 39/39/2 across 80 appearances including mirrors), while Forged advance leads the small Classic study (45/35/0 vs 43/35/2). Neither alternative study establishes a cross-Kindred solution.

## Tactical findings and abuse checks

- Nature: accessible low-power founders support growth, but higher stages still depend on controlled predecessors and surviving positions. Test canopy and scavenger alternatives with humans before selecting a final beginner deck.
- Mythical: strongest cross-Kindred results warrant owner scrutiny of existing power/scoring efficiency. The study does not isolate a particular card or prove a new duplicate exploit.
- Arcane: support and formation dependence produces the highest share of currently unplayable hand instances (about 46-47%). Legal opening hands do not eliminate later staging constraints.
- Undead: lowest observed unavailable-hand share and passing frequency. Existing death, replacement and return effects retain their lineage activation bounds.
- Constructs: fewest accumulated rank-two-or-higher positions and weakest cross-Kindred results. Fortification and direct-destruction protection do not by themselves establish offensive parity.

All proposed decks preserve existing per-card and standard-mode copy limits. No simulator match hit a resolution loop safeguard. Repeated death/return, protection and adjacent effects remain governed by existing executable rules and their regression tests. Absence of a detected loop is not proof against every adversarial human combination.

## Unchanged official deck baseline

The original official five decks were also run against one another, without adopting any proposed deck or extra copies: 40 mirrored games per pairing, 600 matches per mode (1,200 total), including mirrors. Cross-Kindred rates below exclude mirrors (160 games per deck per mode).

| Kindred | Original Classic W / L / D | Original Domination W / L / D |
| --- | --- | --- |
| owner-nature-wildwood | 83 / 76 / 1 (51.9% wins) | 84 / 71 / 5 (52.5% wins) |
| owner-mythical-host | 125 / 34 / 1 (78.1% wins) | 122 / 36 / 2 (76.2% wins) |
| owner-arcane-conclave | 82 / 75 / 3 (51.2% wins) | 80 / 78 / 2 (50.0% wins) |
| owner-undead-legion | 73 / 86 / 1 (45.6% wins) | 75 / 83 / 2 (46.9% wins) |
| owner-constructs-bastion | 34 / 126 / 0 (21.2% wins) | 33 / 126 / 1 (20.6% wins) |

Original Constructs remains weak (21.25% / 20.63% cross-Kindred wins) and original Mythical leads (78.13% / 76.25%). This repeats the direction of the imbalance in unchanged official decks. The baseline is a separate seed schedule sample with fewer games. Compare signals, not an exact causal treatment effect. The proposed starter composition and inherited Kindred mechanics both require human review before any claim of competitive parity.

## Reproduction

From the application directory after `npm ci`:

```powershell
node node_modules/tsx/dist/cli.mjs scripts/starter-analysis.mts --matches=100
node node_modules/tsx/dist/cli.mjs scripts/starter-metrics.mts
node node_modules/tsx/dist/cli.mjs scripts/starter-legacy-baseline.mts
node node_modules/tsx/dist/cli.mjs scripts/starter-proposal-report.mts
```

These commands regenerate proposal evidence in `docs/v1.6a`; inspect the resulting Git diff. They use the actual engine and current executable definitions and do not write to a player database. Hardware and human playstyle can affect practical experience; the deterministic simulation results themselves must repeat with the same code, definitions and seeds.
