import fs from "node:fs";
import path from "node:path";
import {currentOwnerContent} from "../src/content/current";
import {battlefield,DEFAULT_CONFIG} from "../src/engine/config";
import {runSimulation} from "../src/simulation/run";
import {createMatch,act,legalPlays,assertInvariants} from "../src/engine/game";
import {libraryOf} from "../src/content/validation";
import {tacticalPreview} from "../src/ui/tactical-preview";
const output=process.argv.find(a=>a.startsWith("--output="))?.slice(9)??".local/v1.6i69/capacity",content=currentOwnerContent(),library=libraryOf(content),decks=[content.decks.find(d=>d.collection==="Nature")!,content.decks.find(d=>d.collection==="Constructs")!],results:any[]=[];
fs.mkdirSync(output,{recursive:true});
for(const [rows,cols]of [[3,5],[3,7],[5,7],[5,9],[10,10]])for(const scoring of["classic","domination"]){
 const config={...structuredClone(DEFAULT_CONFIG),battlefield:battlefield(rows,cols),scoring},start=performance.now();
 const report=await runSimulation({content,decks,pairings:"single",matches:4,seed:1690528,config,maxActions:200,mirrored:true,retainExamples:false});
 let state=createMatch(decks.map(d=>d.cards) as [string[],string[]],library,config,1690528,0);state=act(state,{type:"mulligan",player:0,cards:[]},library);state=act(state,{type:"mulligan",player:1,cards:[]},library);const play=legalPlays(state,library,0)[0],previewStart=performance.now();if(!play)throw Error("Capacity fixture needs an executable opening placement");const preview=tacticalPreview(state,library,0,play.card,play.row,play.col),previewMs=performance.now()-previewStart;state=act(state,play,library);assertInvariants(state,library);
 const result={rows,cols,tiles:rows*cols,scoring,matches:report.attempted,completed:report.completed,timeouts:report.timeouts,faults:report.faults,invariants:report.invariants,loopSafeguards:report.loopSafeguards,elapsedMs:Math.round(performance.now()-start),boundedOpeningPreviewMs:Math.round(previewMs*100)/100,knownPreviewTiles:preview.tiles.length,acceptedActionCount:report.actions.sum};results.push(result);console.log(JSON.stringify(result));if(report.completed!==4||report.faults||report.invariants||report.timeouts)process.exitCode=1;
}
fs.writeFileSync(path.join(output,"CAPACITY.json"),JSON.stringify({scope:"Isolated deterministic AI/engine capacity evidence; not production or human multiplayer readiness",sourceCardsUnchanged:true,seed:1690528,startingPositionsMirrored:true,baselineDeckSize:15,engineParticipants:2,results},null,2));
