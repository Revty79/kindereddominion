import { ownerContent } from "./owner";
import { addInstance, addStackForm, emptyScenario } from "../sandbox/scenario";
import { DEFAULT_CONFIG } from "../engine/config";
import type { Scenario } from "./types";
import type { Player } from "../engine/types";

// Prepared owner-card experiments only. The player entry point does not import this module.
export function ownerReadabilityScenarios(): Scenario[] {
  const content = ownerContent(), scenarios: Scenario[] = [];
  const make = (id: string, name: string, description: string) => {
    const s = emptyScenario(content, structuredClone(DEFAULT_CONFIG), `OWNER · ${name}`);
    s.id = `owner-demo-${id}`; s.savedAt = "2026-11-26T00:00:00Z"; s.description = description; scenarios.push(s); return s;
  };
  const territory = (s: Scenario, row: number, col: number, player: Player, tokens = 1, fortification = 0) => {
    const c = s.state.board.find(c => c.row === row && c.col === col)!;
    Object.assign(c, { owner: player, tokens, fortification });
  };
  const add = (s: Scenario, id: string, player: Player, row?: number, col?: number, modifier = 0) => {
    s.state = addInstance(s.state, id, player, row === undefined ? "hand" : "battlefield", row === undefined ? undefined : { row, col: col! });
    const instance = `c${s.state.nextCard - 1}`; s.state.cards[instance].modifier = modifier; return instance;
  };
  const bees = make("honeybee", "Honeybee · a living source and a disappearing aura", "Execute Honeybee at A1. Wolf Cub at B1 gains one continuous power. Player Two then plays Air Elemental at A2: Honeybee returns to hand and the Wolf loses its aura. A2 starts fortified so Honeybee's influence does not capture it.");
  add(bees, "n002", 0, 1, 0); add(bees, "n005", 0); add(bees, "a013", 1); territory(bees, 0, 1, 1, 2, 2);
  const wolves = make("wolves", "Wolf lineage · dynamic population and evolution", "Evolve the Wolf Cub at B1 into Grey Wolf. Its bonus counts the other Wolf Cub at A1. After Player Two passes, evolve Grey Wolf into Alpha Wolf. Alpha's own power excludes its grant; the other Wolf gains two continuous power. Evolution needs the predecessor, not extra placement tokens.");
  add(wolves, "n002", 0, 0, 0); add(wolves, "n002", 0, 1, 0); add(wolves, "n027", 0); add(wolves, "n028", 0);
  const basilisk = make("basilisk", "Basilisk · replacement removes continuous weakening", "Replace Basilisk at B1 with Venus Flytrap. The enemy Cyclops at B2 regains two power when the aura disappears. Flytrap gains half the captured Basilisk power, rounded down. Inspect the separate permanent modifier and the resulting row score.");
  add(basilisk, "m016", 0, 1, 0); add(basilisk, "m019", 1, 1, 1); add(basilisk, "n026", 0); territory(basilisk, 1, 1, 1, 2);
  const score = make("score", "Pegasus and Sphinx · power and score are different", "Pegasus wins row B and adds two bonus points. Replace it with Sphinx at B1, then expand Score breakdown. Sphinx's row power is four and its separate winning-row bonus is three. Bonuses do not change row winners.");
  add(score, "m018", 0, 1, 0); add(score, "m001", 1, 1, 4); add(score, "m025", 0);
  const mimic = make("mimic", "Lesser Mimic · a dynamic bonus can shrink", "The enhanced Red Fox at B1 has six intrinsic power; Lesser Mimic at B2 copies half, capped at three. Replace Red Fox with Venus Flytrap at B1. Flytrap reaches five, so Mimic's dynamic bonus falls to two. The Mimic's permanent modifier stays zero.");
  add(mimic, "n003", 0, 1, 0, 4); add(mimic, "a010", 0, 1, 1); add(mimic, "n026", 0); territory(mimic, 1, 1, 0);
  const death = make("bone-gift", "Bone Hound · sacrifice gifts and captured power", "Replace Bone Hound at B1 with Corpse Amalgam. Bone Hound grants the actual incoming replacement one power, Amalgam gains its captured two power, and Ghoul reacts once to the allied death. The sacrifice counts as one historical death.");
  add(death, "u008", 0, 0, 0); add(death, "u006", 0, 1, 0); add(death, "u024", 0);
  const shield = make("shield", "Living Shield · protection and counterplay", "Player Two plays Crocodile at A2. Living Shield at A1 has two fortification and resists direct destruction. Player One can still replace the protected Shield with Venus Flytrap. Protection does not prevent sacrifice.");
  add(shield, "c007", 0, 0, 0); add(shield, "n018", 1); add(shield, "n026", 0); territory(shield, 0, 0, 0, 1, 2); territory(shield, 0, 1, 1, 2); shield.state.active = 1; shield.state.startingPlayer = 1;
  for (const extra of [false, true]) {
    const phoenix = make(`phoenix-${extra ? "supported" : "blocked"}`, `Phoenix · ${extra ? "another living Firebird permits resurrection" : "a missing living predecessor blocks resurrection"}`, `Player Two replaces its Dragon Whelp at A2 with Cerberus. Phoenix at A1 has four effective power after a prepared permanent weakening and is destroyed. ${extra ? "A second living Firebird at B1 lets Phoenix evolve back once, retaining the weakening and lineage limits." : "Its former Firebird stage is in the graveyard, so resurrection cannot find a living predecessor. This is the supplied rule; no override is invented."}`);
    const id = add(phoenix, "m027", 0, 0, 0, -1); phoenix.state = addStackForm(phoenix.state, id, "m003");
    if (extra) add(phoenix, "m003", 0, 1, 0);
    add(phoenix, "m001", 1, 0, 1); add(phoenix, "m026", 1); territory(phoenix, 0, 1, 1); phoenix.state.active = 1; phoenix.state.startingPlayer = 1;
  }
  return scenarios;
}
