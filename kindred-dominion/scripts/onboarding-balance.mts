import fs from "node:fs/promises";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {currentOwnerContent} from "../src/content/current";
import {DEFAULT_STARTERS,starterDefinitionIssues} from "../server/starter-rules";
import {DEFAULT_CONFIG} from "../src/engine/config";
import {runSimulation} from "../src/simulation/run";
import {studyDirectory} from "./study-output";
const content=currentOwnerContent(),issues=starterDefinitionIssues(DEFAULT_STARTERS,content);if(issues.length)throw Error(issues.join("\n"));
const definitions=DEFAULT_STARTERS.definitions,decks=definitions.map(d=>({id:d.kindred.toLowerCase(),name:d.recommended.name,collection:d.kindred,subtitle:"Unchanged forty-copy starter recommendation",strategy:d.recommended.name,cards:d.recommended.cards})),constructs=decks.find(d=>d.collection==="Constructs")!,reports=[];
const seed=1614501,matches=40;
for(const scoring of["classic","domination"]as const)for(const other of decks.filter(d=>d!==constructs)){
 const result=await runSimulation({content,decks:[constructs,other],matches,seed,config:{...structuredClone(DEFAULT_CONFIG),scoring},maxActions:300,mirrored:true,retainExamples:false,pairings:"single"});
 if(result.faults||result.timeouts||result.invariants||result.loopSafeguards||result.completed!==result.attempted)throw Error("Balance reproduction failed engine acceptance");
 reports.push({scoring,opponent:other.collection,attempted:result.attempted,completed:result.completed,draws:result.draws,decks:result.decks,first:result.first,digest:result.digest,faults:result.faults,timeouts:result.timeouts,invariants:result.invariants,loopSafeguards:result.loopSafeguards});
 console.log(JSON.stringify({scoring,opponent:other.collection,completed:result.completed}));
}
const output=await studyDirectory("docs/v1.6i45/balance"),digest=(v:unknown)=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
await fs.writeFile(output+"/BALANCE.json",JSON.stringify({sourceCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),aiOnly:true,ownerAccepted:false,gameplayChanged:false,scope:"Bounded independent-seed Constructs cross-Kindred reproduction; descriptive AI evidence only",seed,matchesPerPairing:matches,mirrored:true,totalMatches:reports.reduce((n,r)=>n+r.attempted,0),cardDefinitionDigest:digest(content.cards),starterDefinitionDigest:digest(definitions),decks,reports},null,2)+"\n");
console.log(JSON.stringify({output:output+"/BALANCE.json",totalMatches:reports.reduce((n,r)=>n+r.attempted,0),gameplayChanged:false}));
