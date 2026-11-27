import {describe,expect,it} from "vitest";
import {battlefieldStudyScene} from "../src/card-design/battlefield-scene";
import {currentOwnerContent} from "../src/content/current";
import {libraryOf} from "../src/content/validation";
import {replayAt,signature} from "../src/replay/record";

describe("isolated battlefield presentation position",()=>{
  it("resolves a real evolution and replacement and replays their current powers",()=>{
    const scene=battlefieldStudyScene();
    expect(scene.record.actions).toHaveLength(2);
    const cards=scene.row.map(cell=>scene.state.cards[cell.creature!]);
    expect(cards.map(card=>card.definitionId)).toEqual(["n003","a015","n027","n026","c020"]);
    expect(cards.map(card=>scene.powers[card.id].effective)).toEqual([3,3,5,4,7]);
    expect(cards.map(card=>scene.library[card.definitionId].power)).toEqual([2,3,4,2,7]);
    expect(cards[3].modifier).toBe(2);
    expect(scene.powers[cards[4].id].continuousProtections.map(p=>p.protection)).toEqual(expect.arrayContaining(["destruction","weakening"]));
    expect(signature(replayAt(scene.record,2).state)).toBe(signature(scene.state));
  });
  it("uses the existing scoring variants without changing published definitions",()=>{
    const before=libraryOf(currentOwnerContent()),classic=battlefieldStudyScene(),domination=battlefieldStudyScene("domination");
    expect(classic.score.rows[0].powers).toEqual([11,11]);
    expect(classic.score.rows[0].points).toEqual([0,0]);
    expect(classic.score.totals).toEqual([0,0]);
    expect(domination.score.totals).toEqual([3,2]);
    expect(classic.library).toEqual(before);
    expect(domination.library).toEqual(before);
    expect(libraryOf(currentOwnerContent())).toEqual(before);
  });
});
