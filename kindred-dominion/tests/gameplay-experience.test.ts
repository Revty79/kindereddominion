import {it,expect} from "vitest";
import {ownerCardScenario} from "./helpers/owner-scenarios";
import {ownerContent} from "../src/content/owner";
import {libraryOf} from "../src/content/validation";
import {removeInstance} from "../src/sandbox/scenario";
import {act,cellAt,assertInvariants} from "../src/engine/game";
import {powerTable} from "../src/engine/evaluation";
import {scoreGame} from "../src/engine/scoring";
import {tacticalPreview} from "../src/ui/tactical-preview";
import {resolutionBatch} from "../src/ui/resolution-presentation";
import {retainRecentMoves,expandRecentMove} from "../src/ui/recent-moves";
import type {DiagnosticStep} from "../src/engine/types";

// Translate the existing declared mechanical scenario; crop off-board subjects
// rather than wrapping influence around an edge or changing a card definition.
it.each(ownerContent().cards.map(c=>[c.id,c.name]))("%s %s keeps preview, accepted effects and stored history consistent at edges/corners",id=>{
 for(const target of[{row:0,col:0},{row:0,col:4},{row:2,col:0},{row:2,col:4},{row:0,col:2},{row:2,col:2}]){
  const setup=ownerCardScenario(id),library=libraryOf(setup.scenario.content),dr=target.row-1,dc=target.col-1;let state=setup.scenario.state;
  for(const cell of state.board){const row=cell.row+dr,col=cell.col+dc;if(cell.creature&&(row<0||row>=3||col<0||col>=5))state=removeInstance(state,cell.creature);}
  const translated=state.board.map(cell=>({...cell,row:cell.row+dr,col:cell.col+dc}));state.board=state.board.map(cell=>({row:cell.row,col:cell.col,owner:null,tokens:0,fortification:0,creature:null}));
  for(const cell of translated){const destination=cellAt(state,cell.row,cell.col);if(destination)Object.assign(destination,cell);}
  assertInvariants(state,library);const before=JSON.stringify(state),preview=tacticalPreview(state,library,0,setup.source,target.row,target.col);expect(preview.fault).toBe(false);expect(tacticalPreview(state,library,0,setup.source,target.row,target.col)).toEqual(preview);expect(JSON.stringify(state)).toBe(before);
  const steps:DiagnosticStep[]=[],action={type:"play"as const,player:0 as const,card:setup.source,...target},after=act(state,action,library,{captureStates:true,onStep:step=>steps.push(step)});expect(after.fault).toBeNull();assertInvariants(after,library);
  const known=preview.complete?after:steps.find(step=>["before-private-draw","before-private-generate","before-random"].includes(step.kind))?.state;
  if(known){expect(preview.scoreAfter).toEqual(scoreGame(known,library).totals);const powers=powerTable(known,library);for(const tile of preview.tiles){const actual=cellAt(known,tile.row,tile.col)!;expect(tile.after.owner).toBe(actual.owner);expect(tile.after.tokens).toBe(actual.tokens);expect(tile.after.fortification).toBe(actual.fortification);expect(tile.after.creature?.power??null).toBe(actual.creature?powers[actual.creature].effective:null);}}else expect(preview.uncertainty).toBeTruthy();
  const batch=resolutionBatch("declared-edge-"+id,0,1,[{action,sequence:1,before:state,after,steps}],library),history=retainRecentMoves(undefined,batch,[{id:"declared-edge-"+id+":1",actor:0,sequence:1,type:"play"}]);
  if(history.moves[0].available)expect(expandRecentMove(history.moves[0])).toEqual(batch.events);else expect(history.moves[0].reason).toBeTruthy();expect(JSON.stringify(state)).toBe(before);
  expect(JSON.stringify({preview,history})).not.toMatch(/"(?:seed|rng|players|hand|draw|lineages|activations|context|details)":/);
 }
});
