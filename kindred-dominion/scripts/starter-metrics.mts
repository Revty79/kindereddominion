import fs from "node:fs/promises";
import {currentOwnerContent} from "../src/content/current";
import {DEFAULT_STARTERS} from "../server/starter-rules";
import {DEFAULT_CONFIG} from "../src/engine/config";
import {act,assertInvariants,createMatch,legalPlays} from "../src/engine/game";
import {chooseComputerAction,computerMulligan} from "../src/engine/ai";
import {runOne} from "../src/simulation/run";
import {signature} from "../src/replay/record";
import {libraryOf} from "../src/content/validation";
import type {Player} from "../src/engine/types";
import {studyDirectory} from "./study-output";
const content=currentOwnerContent(),lib=libraryOf(content),decks=DEFAULT_STARTERS.definitions.map(d=>({id:d.kindred,name:d.recommended.name,subtitle:"DEV proposal",strategy:d.recommended.name,collection:d.kindred,cards:d.recommended.cards}));const samples:any[]=[];let checked=0;
for(const scoring of ["classic","domination"]as const){const request={content,decks,matches:8,seed:160120262,config:{...structuredClone(DEFAULT_CONFIG),scoring},maxActions:300,mirrored:true,retainExamples:false,pairings:"roundRobin"as const};let pairIndex=0;const metrics:any={};for(let first=0;first<5;first++)for(let second=first;second<5;second++,pairIndex++)for(let index=0;index<8;index++){
 const swap=Math.floor(index/2)%2===1,selected=swap?[decks[second],decks[first]]:[decks[first],decks[second]],seed=(request.seed+Math.imul(pairIndex+1,0x9e3779b9)+Math.imul(index+1,0x85ebca6b))>>>0;let state=createMatch([selected[0].cards,selected[1].cards],lib,request.config,seed,(index%2)as Player),actions=0;
 while(["playing","mulligan"].includes(state.phase)&&actions<300){const p=state.phase==="mulligan"?(!state.players[0].mulliganDone?0:1):state.active;
 if(state.phase==="playing"){const m=metrics[selected[p].id]??={turns:0,handSlots:0,noLegalPlacementSlots:0,turnsWithoutLegalAction:0,availableCoordinates:0,ownPositions:0,rankTwoPositions:0,evolutionInHand:0,unplayableEvolution:0};const legal=legalPlays(state,lib,p),playable=new Set(legal.map(a=>a.card));m.turns++;m.handSlots+=state.players[p].hand.length;m.noLegalPlacementSlots+=state.players[p].hand.filter(id=>!playable.has(id)).length;m.turnsWithoutLegalAction+=Number(!legal.length);m.availableCoordinates+=new Set(legal.map(a=>`${a.row},${a.col}`)).size;m.ownPositions+=state.board.filter(c=>c.owner===p).length;m.rankTwoPositions+=state.board.filter(c=>c.owner===p&&c.tokens>=2).length;for(const id of state.players[p].hand)if(lib[state.cards[id].definitionId].type==="evolution"){m.evolutionInHand++;if(!playable.has(id))m.unplayableEvolution++;}}
 const action=state.phase==="mulligan"?{type:"mulligan"as const,player:p,cards:computerMulligan(state,lib,p)}:chooseComputerAction(state,lib);state=act(state,action,lib);assertInvariants(state,lib);actions++;
 }
 if(state.phase!=="finished"||state.fault)throw Error("Detailed starter metrics failed an actual engine match");if(index===0){const comparison=runOne(request,[first,second],index,pairIndex);if(comparison.summary.signature!==signature(state))throw Error("Diagnostic observer changed simulation semantics");checked++;}
 }samples.push({scoring,matches:120,metrics});console.log(JSON.stringify({scoring,observedMatches:120,unchangedSimulationSignatures:checked}));}
await fs.writeFile(`${await studyDirectory()}/DEVELOPMENT-METRICS.json`,JSON.stringify({aiOnly:true,matches:240,existingRunnerSignaturesMatched:checked,definitions:{noLegalPlacementSlots:"An instance in the active player's hand had no legal engine placement on that turn. It may become playable later; not all such instances are permanently dead.",availableCoordinates:"Mean distinct coordinates with at least one legal action before each AI turn.",rankTwoPositions:"Controlled board positions currently at two or more placement tokens before the active turn."},samples},null,2)+"\n");
