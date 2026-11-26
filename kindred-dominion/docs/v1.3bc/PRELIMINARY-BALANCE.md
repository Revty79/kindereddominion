# Preliminary owner-design balance findings

Source engine/catalog commit: `4281df90d77f3525092a8aad6fe4bfc47abc5253`. Seed: 1320261126. These are deterministic computer-policy observations, not human competitive balance or commercial approval. No supplied card, statistic or recommended starter was rebalanced.

Each scoring mode ran 2,430 matches: 1,500 primary pure matches (15 unordered pairings including self, 100 each), 550 pure/mixed round-robin matches, 150 extreme duplicate Free Play matches, 40 targeted death/generation matches, 160 collection-coverage matches and 30 separately labelled two-Firebird experimental matches. Starters alternate and pairings mirror. All 4,860 completed with zero faults, invariant failures, timeouts or loop-safeguard stops.

Full card/deck/matchup counters and reproducible requests are in [Classic](BALANCE-CLASSIC.json) and [Domination](BALANCE-DOMINATION.json). Individual execution and replay evidence covers all [150 cards](INDIVIDUAL-CARD-VALIDATION.json).

## classic

Primary sample: 1500 matches, 17 draws (1.13%). First-player wins: 802/1500 (53.47%, draws included in denominator). Second-player wins: 681/1500 (45.40%). Mean recorded actions: 20.71; range 9–86. Actions include mulligans and passes, not wall-clock presentation time.

| Kindred / supplied starter | Wins / appearances | Win rate | Draws | First-seat win rate | Second-seat win rate |
|---|---:|---:|---:|---:|---:|
| Nature — Wildwood Assembly | 345/600 | 57.50% | 6 | 61.00% | 54.00% |
| Mythical — Legendary Host | 385/600 | 64.17% | 5 | 67.67% | 60.67% |
| Arcane — Elemental Conclave | 270/600 | 45.00% | 8 | 46.67% | 43.33% |
| Undead — Restless Legion | 310/600 | 51.67% | 3 | 60.33% | 43.00% |
| Constructs — Iron Bastion | 173/600 | 28.83% | 12 | 31.67% | 26.00% |

Self matches contribute two deck appearances. Rates include draws. Pairing results below combine both orientations; self wins show the recorded two seats.

| Unordered pairing | Matches | First listed wins | Second listed wins | Draws |
|---|---:|---:|---:|---:|
| Nature / Nature | 100 | 52 | 47 | 1 |
| Nature / Mythical | 100 | 42 | 58 | 0 |
| Nature / Arcane | 100 | 60 | 37 | 3 |
| Nature / Undead | 100 | 59 | 40 | 1 |
| Nature / Constructs | 100 | 85 | 15 | 0 |
| Mythical / Mythical | 100 | 45 | 54 | 1 |
| Mythical / Arcane | 100 | 74 | 25 | 1 |
| Mythical / Undead | 100 | 69 | 31 | 0 |
| Mythical / Constructs | 100 | 85 | 13 | 2 |
| Arcane / Arcane | 100 | 49 | 50 | 1 |
| Arcane / Undead | 100 | 37 | 63 | 0 |
| Arcane / Constructs | 100 | 72 | 26 | 2 |
| Undead / Undead | 100 | 43 | 57 | 0 |
| Undead / Constructs | 100 | 76 | 22 | 2 |
| Constructs / Constructs | 100 | 50 | 47 | 3 |

### Opening reliability and evolution

Opening measurements below include all run categories in which each supplied starter appeared. A hand is reliable here if it has at least one actual legal opening placement on its own starting territory. The runner exchanges up to two cards during its mulligan; this is not an optimal mulligan policy.

| Supplied starter | Initial playable hands | After mulligan | Mean initially playable cards |
|---|---:|---:|---:|
| Nature | 738/742 (99.46%) | 742/742 | 2.71 |
| Mythical | 769/772 (99.61%) | 772/772 | 2.68 |
| Arcane | 736/742 (99.19%) | 742/742 | 2.61 |
| Undead | 728/742 (98.11%) | 742/742 | 2.68 |
| Constructs | 736/742 (99.19%) | 742/742 | 2.68 |

Across all categories, 4307/7360 unique drawn evolution instances were actually evolved (58.52%); 4310 total evolution actions were recorded. A generated evolution or repeat action can make action count differ from unique drawn instances.

### Effects and underused cards

Observed 13569 triggered-ability events (5.58 per match), 6325 permanent-power change events, 6168 continuous-power change events and 696 dynamic-power change events. These are resolved event counts, not an eligible-trigger success probability. Multiple events can describe the same creature.

Cards with no plays across the entire sample: N022 African Elephant, N029 Butterfly, M015 Griffin, M018 Pegasus, M021 Hydra, M022 Roc, A017 Illusion Beast, A018 Living Grimoire, A022 Astral Dragon, A023 Void Spirit, A029 Water Elemental, U019 Skeletal Horse, U021 Bone Dragon, U022 Undead Giant, U023 Headless Horseman, U028 Skeleton Champion, U029 Elder Vampire, C019 Repair Golem, C021 Stone Titan, C022 Clockwork Dragon. Every card was also exercised in its own prepared real-engine scenario.

The ten lowest primary play counts relative to deck inclusions follow. This measures policy usage, not card strength or the chance a drawn instance is playable. Draw counters include redraws and generated cards; subtracting them from plays would not measure unique unplayed instances.

| Card | Play actions / deck inclusions | Draw events |
|---|---:|---:|
| U020 Lich | 8/600 | 723 |
| C020 Iron Golem | 8/600 | 699 |
| A021 Storm Elemental | 9/600 | 752 |
| C017 Bronze Sentinel | 31/600 | 667 |
| M020 Dragon | 33/600 | 728 |
| N021 Rhinoceros | 39/600 | 703 |
| A016 Magical Ooze | 45/600 | 729 |
| C015 Ballista Automaton | 55/600 | 695 |
| A013 Air Elemental | 70/600 | 726 |
| U014 Banshee | 82/600 | 724 |

The separately labelled two-Firebird alternative won 16/30 (53.33%), drew 1, and lost 13 against the supplied Mythical starter. Phoenix recorded 0 destructions and 0 resurrections in that experiment. This small ordinary-game sample does not establish resurrection reliability; the supported and blocked prepared scenarios exercise both branches directly. The supplied starter remains unchanged.

## domination

Primary sample: 1500 matches, 27 draws (1.80%). First-player wins: 800/1500 (53.33%, draws included in denominator). Second-player wins: 673/1500 (44.87%). Mean recorded actions: 20.50; range 9–31. Actions include mulligans and passes, not wall-clock presentation time.

| Kindred / supplied starter | Wins / appearances | Win rate | Draws | First-seat win rate | Second-seat win rate |
|---|---:|---:|---:|---:|---:|
| Nature — Wildwood Assembly | 332/600 | 55.33% | 9 | 60.00% | 50.67% |
| Mythical — Legendary Host | 391/600 | 65.17% | 8 | 69.67% | 60.67% |
| Arcane — Elemental Conclave | 269/600 | 44.83% | 9 | 44.67% | 45.00% |
| Undead — Restless Legion | 308/600 | 51.33% | 9 | 60.33% | 42.33% |
| Constructs — Iron Bastion | 173/600 | 28.83% | 19 | 32.00% | 25.67% |

Self matches contribute two deck appearances. Rates include draws. Pairing results below combine both orientations; self wins show the recorded two seats.

| Unordered pairing | Matches | First listed wins | Second listed wins | Draws |
|---|---:|---:|---:|---:|
| Nature / Nature | 100 | 50 | 49 | 1 |
| Nature / Mythical | 100 | 41 | 57 | 2 |
| Nature / Arcane | 100 | 60 | 38 | 2 |
| Nature / Undead | 100 | 49 | 50 | 1 |
| Nature / Constructs | 100 | 83 | 15 | 2 |
| Mythical / Mythical | 100 | 43 | 56 | 1 |
| Mythical / Arcane | 100 | 76 | 23 | 1 |
| Mythical / Undead | 100 | 70 | 27 | 3 |
| Mythical / Constructs | 100 | 89 | 11 | 0 |
| Arcane / Arcane | 100 | 52 | 47 | 1 |
| Arcane / Undead | 100 | 39 | 60 | 1 |
| Arcane / Constructs | 100 | 70 | 27 | 3 |
| Undead / Undead | 100 | 43 | 56 | 1 |
| Undead / Constructs | 100 | 72 | 26 | 2 |
| Constructs / Constructs | 100 | 45 | 49 | 6 |

### Opening reliability and evolution

Opening measurements below include all run categories in which each supplied starter appeared. A hand is reliable here if it has at least one actual legal opening placement on its own starting territory. The runner exchanges up to two cards during its mulligan; this is not an optimal mulligan policy.

| Supplied starter | Initial playable hands | After mulligan | Mean initially playable cards |
|---|---:|---:|---:|
| Nature | 738/742 (99.46%) | 742/742 | 2.71 |
| Mythical | 769/772 (99.61%) | 772/772 | 2.68 |
| Arcane | 736/742 (99.19%) | 742/742 | 2.61 |
| Undead | 728/742 (98.11%) | 742/742 | 2.68 |
| Constructs | 736/742 (99.19%) | 742/742 | 2.68 |

Across all categories, 4155/7348 unique drawn evolution instances were actually evolved (56.55%); 4159 total evolution actions were recorded. A generated evolution or repeat action can make action count differ from unique drawn instances.

### Effects and underused cards

Observed 13454 triggered-ability events (5.54 per match), 6368 permanent-power change events, 5959 continuous-power change events and 489 dynamic-power change events. These are resolved event counts, not an eligible-trigger success probability. Multiple events can describe the same creature.

Cards with no plays across the entire sample: N022 African Elephant, N029 Butterfly, M015 Griffin, M018 Pegasus, M021 Hydra, M022 Roc, A017 Illusion Beast, A018 Living Grimoire, A022 Astral Dragon, A023 Void Spirit, A029 Water Elemental, U019 Skeletal Horse, U021 Bone Dragon, U022 Undead Giant, U023 Headless Horseman, U028 Skeleton Champion, U029 Elder Vampire, C014 Animated Armor, C019 Repair Golem, C021 Stone Titan, C022 Clockwork Dragon. Every card was also exercised in its own prepared real-engine scenario.

The ten lowest primary play counts relative to deck inclusions follow. This measures policy usage, not card strength or the chance a drawn instance is playable. Draw counters include redraws and generated cards; subtracting them from plays would not measure unique unplayed instances.

| Card | Play actions / deck inclusions | Draw events |
|---|---:|---:|
| U020 Lich | 7/600 | 717 |
| C020 Iron Golem | 8/600 | 706 |
| A021 Storm Elemental | 15/600 | 751 |
| N021 Rhinoceros | 29/600 | 705 |
| C017 Bronze Sentinel | 31/600 | 676 |
| M020 Dragon | 33/600 | 724 |
| A016 Magical Ooze | 45/600 | 725 |
| C015 Ballista Automaton | 55/600 | 695 |
| U014 Banshee | 72/600 | 713 |
| A013 Air Elemental | 73/600 | 727 |

The separately labelled two-Firebird alternative won 19/30 (63.33%), drew 0, and lost 11 against the supplied Mythical starter. Phoenix recorded 0 destructions and 0 resurrections in that experiment. This small ordinary-game sample does not establish resurrection reliability; the supported and blocked prepared scenarios exercise both branches directly. The supplied starter remains unchanged.

## Owner review priorities

Mythical led these starter-policy samples (64.17% Classic, 65.17% Domination); Constructs lagged (28.83% both). Inspect Elder Dragon progression and Nature Wolf/aura formations against fortification-heavy setups with human players before considering any numerical change. Low Rank III usage may reflect token development and the computer's immediate-action policy. Undead had a noticeable first-seat gap; review sacrifice timing and resurrection interactions with humans.

Continuous effects and dynamic combinations were observed without loop stops. Targeted duplicate Zombie/Grave Rat versus Web Spider fixtures finished within safeguards. Prepared scenarios separately verify Honeybee aura removal, Basilisk recovery, Lesser Mimic recalculation, Wolf evolution, sacrifice gifts, card-score separation, fortification protections and Phoenix prerequisites.

Phoenix consumes the starter's only Firebird when evolving. Its dead predecessor is not a living evolution host, so normal resurrection has no eligible Firebird in that unchanged starter. This is the requested rule interaction, not a missing resurrection implementation. A living second Firebird allows one resurrection; the prepared positive case proves it. See [owner review](../V1.3BC-OWNER-REVIEW.md).

No automated balance changes or new official alternative starter were made. Statistical uncertainty, shared seeds, correlated deck appearances, limited policy strength and small coverage/experimental samples constrain all conclusions.
