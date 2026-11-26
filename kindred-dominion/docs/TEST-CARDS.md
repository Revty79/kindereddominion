# Provisional test library

There are exactly 30 development definitions, six per Founding Kindred. Every card is available without collection ownership. These are not approved commercial cards. The authoritative complete text, patterns, prerequisites and limits live in `src/data/cards.ts` and the in-game Card library.

Ahead means one column toward the opponent; diagonal means ahead and one row up/down. Replacement/evolution rank is metadata and the rank used for empty-cell resurrection; normal replacement/evolution instead checks its predecessor. Influence is applied before ordinary placement abilities.

| Kindred | Card ID / name | Rank · base power | Placement | Main test purpose |
|---|---|---|---|---|
| Nature | `sprout` / Briar Sprout | I · 1 | Standard | Forward/vertical expansion, reinforcements; three-copy override |
| Nature | `leafguard` / Leafguard | I · 3 | Standard | Forward expansion, basic power and evolution predecessor |
| Nature | `grove-tender` / Grove Tender | II · 3 | Standard | Diagonal expansion, conditional population enhancement |
| Nature | `brood-bough` / Brood Bough | II · 2 | Standard | Diagonal expansion then legal generated summons |
| Nature | `elderroot` / Elderroot | II · 5 | Evolution | Briar Sprout OR Leafguard, inherited modifiers, evolution enhancement |
| Nature | `wildcrown` / Wildcrown | III · 8 | Evolution | Multistage Elderroot chain, broad expansion, beginning-turn draw |
| Mythical | `embercub` / Embercub | I · 3 | Standard | Basic forward expansion; three-copy override |
| Mythical | `dawnwing` / Dawnwing | II · 5 | Evolution | Embercub branch, evolution enhancement |
| Mythical | `stormwyrm` / Stormwyrm | III · 8 | Standard | Simultaneous weakening of all enemy creatures |
| Mythical | `ashen-phoenix` / Ashen Phoenix | II · 4 | Standard | Death-triggered, limited self-resurrection |
| Mythical | `rift-titan` / Rift Titan | III · 7 | Replacement | Minimum-power sacrifice prerequisite, direct destruction ahead |
| Mythical | `sunlance` / Sunlance | II · 4 | Standard | Direct destruction two positions ahead |
| Arcane | `rune-initiate` / Rune Initiate | I · 2 | Standard | Self token reinforcement, forward expansion, generation; three-copy override |
| Arcane | `mirror-adept` / Mirror Adept | I · 1 | Standard | Diagonal expansion, placement draw |
| Arcane | `hex-weaver` / Hex Weaver | II · 3 | Standard | Pattern-based simultaneous weakening |
| Arcane | `transmuter` / Transmuter | II · 4 | Replacement | Sacrifice then return an enemy to hand without death triggers |
| Arcane | `void-seer` / Void Seer | III · 5 | Standard | Banishment including evolution stacks |
| Arcane | `convergence` / Convergence | II · 2 | Standard | Simultaneous weakening of all creatures, including itself |
| Undead | `bone-thrall` / Bone Thrall | I · 2 | Standard | Sacrifice enhancement benefiting the incoming replacement; three-copy override |
| Undead | `grave-acolyte` / Grave Acolyte | I · 1 | Standard | Other-death trigger, friendly-event condition, turn/match activation caps |
| Undead | `crypt-harvester` / Crypt Harvester | II · 4 | Replacement | Any friendly sacrifice, replacement draw |
| Undead | `revenant` / Oathbound Revenant | II · 4 | Standard | Limited self-resurrection, persistent lineage restrictions |
| Undead | `death-shepherd` / Death Shepherd | III · 5 | Standard | Recall first eligible friendly graveyard card, evolution prerequisites |
| Undead | `ossuary-monarch` / Ossuary Monarch | III · 7 | Evolution | Crypt Harvester OR Revenant predecessor, active-form death sweep |
| Constructs | `brass-scout` / Brass Scout | I · 2 | Standard | Self fortification plus expansion; three-copy override |
| Constructs | `bastion` / Walking Bastion | II · 4 | Standard | Fortify self and friendly vertical neighbors |
| Constructs | `siege-walker` / Siege Walker | II · 3 | Standard | Overthrow ignoring fortification, establish two tokens |
| Constructs | `aegis-core` / Aegis Core | II · 3 | Standard | Direct-destruction immunity and grant weakening immunity |
| Constructs | `iron-colossus` / Iron Colossus | III · 7 | Replacement | Construct classification prerequisite, strong fortification |
| Constructs | `watchwork` / Watchwork | I · 1 | Standard | Beginning-turn growth, end-turn tokens, persistent activation limits |

Unless explicitly overridden above, Standard permits two copies; Free Play permits 15. Ability limits are shown in full card text. The universal generation and resurrection limits are always active.

## Supplied legal decks

Exact instance-independent deck lists are in `src/data/decks.ts`; all four contain exactly 15 cards and pass Standard mixed-collection validation.

| Deck | Collections | Purpose |
|---|---|---|
| Verdant Bulwark | Nature / Constructs | Expansion, fortification, summoning, multistage evolution and overthrow |
| Ashen Covenant | Undead / Mythical | Sacrifice, replacement, resurrection and branching predecessors |
| Prism Engine | Arcane / Constructs | Token reinforcement, generation, simultaneous destruction, return, exile and protection |
| Dawn March | Mythical / Nature | Strong basics, rank growth, evolution and targeted destruction |

The tests also create dedicated data-only definitions to exercise ability-generated replacement/evolution, actual recurring resurrection chains, resurrection overrides, trigger ordering and suppression. These synthetic definitions are fixtures, not additional library cards or nonfunctional UI placeholders.
