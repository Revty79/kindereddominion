import fs from "node:fs/promises";
import {currentOwnerContent} from "../src/content/current";
import {DEFAULT_CONFIG} from "../src/engine/config";
import {runSimulation} from "../src/simulation/run";
import {studyDirectory} from "./study-output";
const content=currentOwnerContent(),reports=[];
for(const scoring of ["classic","domination"] as const){const report=await runSimulation({content,decks:content.decks.filter(d=>d.collection!=="mixed"),matches:40,seed:160120261,config:{...structuredClone(DEFAULT_CONFIG),scoring},maxActions:300,mirrored:true,retainExamples:false,pairings:"roundRobin"});if(report.faults||report.timeouts||report.invariants||report.loopSafeguards||report.completed!==report.attempted)throw Error("Legacy baseline failed validation");const {attempted,completed,draws,first,decks,matchups,actions,digest,faults,timeouts,invariants,loopSafeguards}=report;reports.push({scoring,attempted,completed,draws,first,decks,matchups,actions,digest,faults,timeouts,invariants,loopSafeguards});console.log(JSON.stringify({scoring,completed}));}
await fs.writeFile(`${await studyDirectory()}/LEGACY-BASELINE.json`,JSON.stringify({aiOnly:true,seed:160120261,matchesPerPairing:40,description:"Unchanged original official decks against each other, including mirrors, to distinguish inherited signals from proposed starter composition.",reports},null,2)+"\n");
