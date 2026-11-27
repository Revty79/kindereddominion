import {describe,it,expect} from "vitest";
import {ownerCardScenario} from "./helpers/owner-scenarios";
import {ownerContent} from "../src/content/owner";
import {libraryOf} from "../src/content/validation";
import {act,cellAt,placementError,placementIssue} from "../src/engine/game";
import {powerTable} from "../src/engine/evaluation";
import {scoreGame} from "../src/engine/scoring";
import {tacticalPreview,placementDestinations} from "../src/ui/tactical-preview";
import {floatingPosition} from "../src/player/placement-input";
import type {DiagnosticStep} from "../src/engine/types";
import {addInstance} from "../src/sandbox/scenario";

describe("authoritative founding tactical previews",()=>{
  it.each(ownerContent().cards.map(c=>[c.id,c.name]))("%s %s preserves state and agrees with actual visible resolution",(id)=>{
    const {scenario,source}=ownerCardScenario(id),state=scenario.state,library=libraryOf(scenario.content),before=JSON.stringify(state),p=tacticalPreview(state,library,0,source,1,1);
    expect(JSON.stringify(state)).toBe(before);expect(p.fault).toBe(false);expect(p.card).toBe(source);expect(p.tiles.some(t=>t.row===1&&t.col===1)).toBe(true);
    const steps:DiagnosticStep[]=[],actual=act(state,{type:"play",player:0,card:source,row:1,col:1},library,{captureStates:true,onStep:s=>steps.push(s)});expect(actual.fault).toBeNull();
    const expected=p.complete?actual:steps.find(s=>["before-private-draw","before-private-generate","before-random"].includes(s.kind))?.state;
    if(expected){expect(p.scoreAfter).toEqual(scoreGame(expected,library).totals);const powers=powerTable(expected,library);for(const tile of p.tiles){const cell=cellAt(expected,tile.row,tile.col)!;expect(tile.after.tokens).toBe(cell.tokens);expect(tile.after.owner).toBe(cell.owner);expect(tile.after.fortification).toBe(cell.fortification);expect(tile.after.creature?.power??null).toBe(cell.creature?powers[cell.creature].effective:null);}}
    else expect(p.uncertainty).toBeTruthy();
    const text=JSON.stringify(p);expect(text).not.toMatch(/"(?:seed|rng|state|players|hand|draw|activations|lineages)":/);
  });
});
it("uses the same validator for each invalid, occupied, opponent, insufficient and special evolution destination",()=>{
  const {scenario,source}=ownerCardScenario("n027"),library=libraryOf(scenario.content),state=scenario.state;cellAt(state,1,1)!.tokens=0;
  const destinations=placementDestinations(state,library,0,source);for(const d of destinations){expect(d.legal).toBe(placementError(state,library,0,source,d.row,d.col)===null);expect(d.code).toBe(placementIssue(state,library,0,source,d.row,d.col)?.code??"legal");}
  expect(destinations.find(d=>d.row===1&&d.col===1)).toMatchObject({legal:true,kind:"evolution"});const p=tacticalPreview(state,library,0,source,1,1);expect(p.tiles.some(t=>t.effects.some(e=>e.category==="evolution"))).toBe(true);
  expect(destinations.some(d=>d.code==="opponent")).toBe(true);expect(destinations.some(d=>d.code==="host")).toBe(true);
});
it("stops before private draws and is identical across hidden draw order and repeated requests",()=>{
  const {scenario,source}=ownerCardScenario("a002"),library=libraryOf(scenario.content),before=JSON.stringify(scenario.state),p=tacticalPreview(scenario.state,library,0,source,1,1),variant=structuredClone(scenario.state);variant.rng=8573;variant.seed=918;for(const player of variant.players){player.draw.reverse();for(const id of player.draw)variant.cards[id].definitionId="m029";}
  expect(p.complete).toBe(false);expect(p.uncertainty).toContain("private draw");for(let n=0;n<5;n++)expect(tacticalPreview(variant,library,0,source,1,1)).toEqual(p);expect(JSON.stringify(scenario.state)).toBe(before);
});
it("stops before random target selection instead of exposing a seeded hypothetical outcome",()=>{
  const {scenario,source}=ownerCardScenario("n001"),library=libraryOf(scenario.content);library.n001.abilities=[{id:"fixture-random",trigger:"placement",effects:[{type:"power",amount:-1,target:{kind:"all",relation:"enemy",order:"random",maxTargets:1}}]}];const a=structuredClone(scenario.state),b=structuredClone(a);b.rng=777;b.seed=6;const before=JSON.stringify(a),p=tacticalPreview(a,library,0,source,1,1);expect(p.uncertainty).toContain("Random target");expect(p.complete).toBe(false);expect(tacticalPreview(b,library,0,source,1,1)).toEqual(p);expect(JSON.stringify(a)).toBe(before);
});
it("does not evaluate conditions that could probe private draw history",()=>{
  const {scenario,source}=ownerCardScenario("n001"),library=libraryOf(scenario.content);library.n001.abilities=[{id:"private-condition-fixture",trigger:"placement",condition:{kind:"compare",left:{kind:"history",event:"drawn",filter:{relation:"enemy",definitions:["m029"]}},operator:"gt",right:0},effects:[{type:"power",amount:20,target:{kind:"self"}}]}];const a=scenario.state,b=structuredClone(a);b.mechanics!.history.push({event:"drawn",player:1,definitionId:"m029",tags:[],kindred:"Mythical",cause:"draw",count:5});const p=tacticalPreview(a,library,0,source,1,1);expect(p.uncertainty).toContain("private draw or generation history");expect(p.abilities).toEqual([]);expect(tacticalPreview(b,library,0,source,1,1)).toEqual(p);
});
it("reports numerical token losses, multiple effects and prevented weakening as distinct effects",()=>{
  const {scenario,source,enemy}=ownerCardScenario("n001"),library=libraryOf(scenario.content);scenario.state.cards[enemy].statuses.push("weakening");library.n001.abilities=[{id:"numeric-fixture",trigger:"placement",effects:[{type:"tokens",amount:-1,target:{kind:"self"}},{type:"power",amount:-2,target:{kind:"all",relation:"enemy"}}]}];const p=tacticalPreview(scenario.state,library,0,source,1,1);expect(p.tiles.some(t=>t.effects.some(e=>e.label==="T-1"))).toBe(true);expect(p.tiles.some(t=>t.effects.some(e=>e.category==="protection"))).toBe(true);expect(p.tiles.some(t=>t.effects.some(e=>e.category==="power"&&e.label.startsWith("P-"))||t.effects.some(e=>e.category==="destruction"))).toBe(true);
});
it("bounds complex evaluation without converting its stop into a gameplay fault",()=>{
  const {scenario,source}=ownerCardScenario("n001"),library=libraryOf(scenario.content);library.n001.abilities=[{id:"long-fixture",trigger:"placement",effects:Array.from({length:70},()=>({type:"power" as const,amount:1,target:{kind:"self" as const}}))}];const before=JSON.stringify(scenario.state),p=tacticalPreview(scenario.state,library,0,source,1,1);expect(p.complete).toBe(false);expect(p.uncertaintyCode).toBe("budget");expect(p.uncertainty).toContain("cannot be fully previewed");expect(p.fault).toBe(false);expect(JSON.stringify(scenario.state)).toBe(before);expect(act(scenario.state,{type:"play",player:0,card:source,row:1,col:1},library).fault).toBeNull();
});
it("positions a floating portrait outside a whole affected row, including its caption",()=>{
  const affected=[{left:10,top:100,right:340,bottom:500}],pos=floatingPosition({x:120,y:250},92,152,{width:390,height:844},{left:90,top:100,right:150,bottom:230},affected);expect(pos.y>=500||pos.x>=340||pos.x+92<=10||pos.y+152<=100).toBe(true);
});
it("uses actual engine orientation at all corners and supports a full-board replacement",()=>{
  for(const player of [0,1] as const)for(const [row,col]of [[0,0],[0,4],[2,0],[2,4]]){const {scenario,source}=ownerCardScenario("n001"),library=libraryOf(scenario.content),state=scenario.state;state.players[0].hand=state.players[0].hand.filter(id=>id!==source);state.players[player].hand.push(source);state.cards[source].owner=player;state.active=player;const destination=cellAt(state,row,col)!;if(destination.creature){const id=destination.creature;state.cards[id].location="graveyard";state.players[state.cards[id].owner].graveyard.push(id);destination.creature=null;}destination.owner=player;destination.tokens=3;const p=tacticalPreview(state,library,player,source,row,col),actual=act(state,{type:"play",player,card:source,row,col},library);expect(actual.fault).toBeNull();if(p.complete)expect(p.scoreAfter).toEqual(scoreGame(actual,library).totals);expect(p.tiles.every(t=>t.row>=0&&t.row<3&&t.col>=0&&t.col<5)).toBe(true);}
  const {scenario,source}=ownerCardScenario("n026"),library=libraryOf(scenario.content);for(const cell of [...scenario.state.board])if(!cell.creature)scenario.state=addInstance(scenario.state,"n003",cell.owner??0,"battlefield",cell);const p=tacticalPreview(scenario.state,library,0,source,1,1);expect(p.tiles.some(t=>t.effects.some(e=>e.category==="replacement"))).toBe(true);expect(act(scenario.state,{type:"play",player:0,card:source,row:1,col:1},library).fault).toBeNull();
});
it("explains satisfied and failed conditions and one-point fortification consumption",()=>{
  const {scenario,source}=ownerCardScenario("n001"),library=libraryOf(scenario.content);library.n001.abilities=[{id:"public-condition-fixture",trigger:"placement",condition:{kind:"friendlyCount",atLeast:3},effects:[{type:"power",amount:2,target:{kind:"self"}}]}];const p=tacticalPreview(scenario.state,library,0,source,1,1);expect(p.abilities.some(a=>a.conditions.some(c=>c.includes("passed")))).toBe(true);library.n001.abilities[0].condition={kind:"friendlyCount",atLeast:100};const failed=tacticalPreview(scenario.state,library,0,source,1,1);expect(failed.abilities.some(a=>a.conditions.some(c=>c.includes("did not pass")))).toBe(true);
  library.n001.influence=[{x:1,y:0,mechanic:"expansion",amount:1}];const cell=cellAt(scenario.state,1,2)!;if(cell.creature){scenario.state.cards[cell.creature].location="graveyard";scenario.state.players[1].graveyard.push(cell.creature);cell.creature=null;}cell.owner=1;cell.tokens=2;cell.fortification=2;const fortified=tacticalPreview(scenario.state,library,0,source,1,1).tiles.find(t=>t.row===1&&t.col===2)!;expect(fortified.after).toMatchObject({owner:1,tokens:2,fortification:1});expect(fortified.effects.some(e=>e.label==="F-1")).toBe(true);
});
it.each(["n005","n027","m026"])("fully visible %s resolution matches execution with no future private draw",id=>{const {scenario,source}=ownerCardScenario(id),library=libraryOf(scenario.content),state=scenario.state;for(const id of state.players[1].draw){state.cards[id].location="exile";state.players[1].exile.push(id);}state.players[1].draw=[];const p=tacticalPreview(state,library,0,source,1,1),actual=act(state,{type:"play",player:0,card:source,row:1,col:1},library);expect(p.complete).toBe(true);expect(p.scoreAfter).toEqual(scoreGame(actual,library).totals);});
