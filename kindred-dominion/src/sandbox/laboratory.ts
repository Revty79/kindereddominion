import {scoreGame} from "../engine/scoring";
import {safeTree} from "../content/transfer";
import type {Action,GameConfig,GameState,Player} from "../engine/types";
import type {ContentPack,Scenario,ScenarioLaboratory,RulesetVersion} from "../content/types";
import {createMatch,act,validateDeck} from "../engine/game";
import {chooseComputerAction} from "../engine/ai";
import {libraryOf} from "../content/validation";
import {sameRules,validateRulesetVersion} from "../content/rulesets";
import {validateScenario} from "./scenario";
import {newRecord,appendRecord,signature} from "../replay/record";
import {battleView} from "../ui/battle-view";
import {placementDestinations,tacticalPreview} from "../ui/tactical-preview";
import {resolutionBatch,resolutionCapture,type ResolutionBatch,type AcceptedResolution} from "../ui/resolution-presentation";
import {retainRecentMoves,type RecentMoves} from "../ui/recent-moves";
import {DEFAULT_PRESENTATION,normalizePresentation} from "../player/presentation-preferences";

export const laboratoryMetadata=(content:ContentPack,seed=1,workspaceRevision?:number):ScenarioLaboratory=>({classification:"artificial",opponent:"manual",seed,contentRevision:{id:content.id,createdAt:content.createdAt,engineVersion:content.engineVersion,...(workspaceRevision===undefined?{}:{workspaceRevision})},reference:""});
export function representativeScenario(content:ContentPack,ruleset:RulesetVersion,decks:[string[],string[]],seed:number,startingPlayer:Player):Scenario{
 validateRulesetVersion(ruleset);const state=createMatch(decks,libraryOf(content),ruleset.config,seed,startingPlayer);
 return {id:"scenario-"+crypto.randomUUID(),name:"Production-representative battle",description:"Starts from real deck validation, shuffle and opening hand; no constructed state.",content:structuredClone(content),state,savedAt:new Date().toISOString(),laboratory:{...laboratoryMetadata(content,seed),classification:"production-representative",opponent:"computer",decks:structuredClone(decks),ruleset:structuredClone(ruleset)}};
}
export function regressionResult(scenario:Scenario){
 const errors=validateScenario(scenario).filter(i=>i.severity==="error");if(errors.length)throw Error(errors.map(e=>e.message).join("\n"));
 const action=scenario.laboratory?.intendedAction;if(!action)throw Error("Select a legal intended action first.");
 const state=act(scenario.state,action,libraryOf(scenario.content)),view=battleView({id:scenario.id,revision:0,decks:[[],[]],testing_access:true},scenario.content,state),expected=scenario.laboratory?.expected;
 return {passed:!expected||(!expected.stateSignature||signature(state)===expected.stateSignature)&&(!expected.totals||sameRules(view.score.totals,expected.totals))&&(!expected.phase||state.phase===expected.phase),stateSignature:signature(state),totals:view.score.totals,phase:state.phase};
}
export function exportRegression(scenario:Scenario){const errors=validateScenario(scenario).filter(i=>i.severity==="error");if(errors.length)throw Error(errors.map(e=>e.message).join("\n"));return {format:"kindred-dominion-scenario-regression",schema:1,classification:"private-development-only",scenario:structuredClone(scenario)};}
export function importRegression(value:any):Scenario{safeTree(value);if(value?.format!=="kindred-dominion-scenario-regression"||value.schema!==1||value.classification!=="private-development-only")throw Error("Unsupported scenario regression package.");const s=value.scenario,errors=validateScenario(s).filter(i=>i.severity==="error");if(errors.length)throw Error(errors.map(e=>e.message).join("\n"));return structuredClone(s);}

// No fetch, account API, DB, reward or inventory service exists in this adapter.
// Paths are an allowlist; unknown requests fail closed rather than falling back.
export class LaboratorySession{
 readonly scenario:Scenario;readonly library;readonly id:string;
 states:GameState[];record;steps:ReturnType<typeof resolutionCapture>["steps"]=[];revision=0;
 resolution:ResolutionBatch|undefined;recent:RecentMoves|undefined;
 preferences={revision:0,preferences:{...DEFAULT_PRESENTATION}};
 private requests=new Map<string,{fingerprint:string;view:any}>();
 constructor(scenario:Scenario){const errors=validateScenario(scenario).filter(i=>i.severity==="error");if(errors.length)throw Error(errors.map(e=>e.message).join("\n"));this.scenario=structuredClone(scenario);this.library=libraryOf(this.scenario.content);this.id="lab-"+crypto.randomUUID();this.states=[structuredClone(scenario.state)];this.record=newRecord(scenario.state,this.library,scenario.laboratory?.decks??[[],[]],scenario.content.id,"Sandbox: "+scenario.name);if(scenario.laboratory?.ruleset)this.record.ruleset=structuredClone(scenario.laboratory.ruleset);}
 get state(){return this.states.at(-1)!;}
 get viewer():Player{return this.scenario.laboratory?.opponent==="computer"?0:this.state.active;}
 view(){return {...battleView({id:this.id,revision:this.revision,version_id:this.scenario.content.id,engine_version:this.scenario.content.engineVersion,decks:this.scenario.laboratory?.decks??[[],[]],testing_access:true},this.scenario.content,this.state,true,this.viewer),viewer:this.viewer,participantLabels:this.scenario.laboratory?.opponent==="computer"?["Jade · You","Amber · Computer"]:["Jade · Manual","Amber · Manual"],opponent:{type:this.scenario.laboratory?.opponent??"manual",name:this.scenario.laboratory?.opponent==="computer"?"Computer opponent":"Manual participant",kindred:"mixed"},ruleset:this.scenario.laboratory?.ruleset,presentation:[],resolution:this.resolution,recentPresentation:this.recent,testingAccess:true};}
 execute(action:Action,automatic=false){
  const originalStates=this.states,originalRecord=this.record,originalSteps=this.steps;this.states=[...this.states];
  const beforeRevision=this.revision,resolutions:AcceptedResolution[]=[];let truncated=false;
  const apply=(a:Action)=>{const before=this.state,capture=resolutionCapture(before),next=act(before,a,this.library,capture.observer);this.states.push(next);this.steps=[...capture.steps,{sequence:capture.steps.length,kind:"score",message:`Score ${scoreGame(before,this.library).totals.join("–")} becomes ${scoreGame(next,this.library).totals.join("–")}.`,details:{before:scoreGame(before,this.library),after:scoreGame(next,this.library)},state:structuredClone(next)}];this.record=appendRecord(this.record,a,next);resolutions.push({action:a,sequence:this.record.actions.length,before,after:next,steps:capture.steps});truncated||=capture.truncated;};
  try{apply(action);
  if(automatic){if(this.state.phase==="mulligan"&&!this.state.players[1].mulliganDone)apply({type:"mulligan",player:1,cards:[]});let guard=0;while(this.state.phase==="playing"&&this.state.active===1&&guard++<2)apply(chooseComputerAction(this.state,this.library));}
  }catch(error){this.states=originalStates;this.record=originalRecord;this.steps=originalSteps;throw error;}
  this.revision++;this.resolution=resolutionBatch(this.id,beforeRevision,this.revision,resolutions,this.library,truncated);this.recent=retainRecentMoves(this.recent,this.resolution,resolutions.map(r=>({id:this.id+":"+r.sequence,actor:r.action.player,sequence:r.sequence,type:r.action.type})));return this.view();
 }
 undo(){if(this.states.length<2)return;this.states.pop();this.record={...this.record,actions:this.record.actions.slice(0,-1),finalResult:this.state.result};this.revision++;this.steps=[];this.resolution=undefined;this.recent=undefined;this.requests.clear();}
 request=async<T=any>(path:string,method="GET",body?:any,options:{signal?:AbortSignal}={}):Promise<T>=>{
  if(options.signal?.aborted)throw new DOMException("Aborted","AbortError");let result:any;
  if(path==="/preferences/presentation"){
   if(method==="GET")result=this.preferences;else if(method==="PUT"){if(body?.revision!==this.preferences.revision)throw Error("Laboratory display settings changed; reload them.");this.preferences={revision:this.preferences.revision+1,preferences:normalizePresentation(body.preferences)};result=this.preferences;}else throw Error("Unsupported laboratory method.");
  }else{
   const base="/matches/"+this.id;if(path.split("?")[0]!==base&&!path.startsWith(base+"/"))throw Error("Laboratory adapter cannot access player services.");
   if(path===base&&method==="GET")result=this.view();
   else if(path.startsWith(base+"/recent-presentation")&&method==="GET")result=this.recent??{schema:1,matchId:this.id,revision:this.revision,moves:[]};
   else if(path===base+"/actions"&&method==="POST"){
    const fingerprint=JSON.stringify(body),key=body?.requestId;if(typeof key!=="string"||!key)throw Error("An operation identity is required.");const prior=this.requests.get(key);if(prior){if(prior.fingerprint!==fingerprint)throw Error("Operation identity was reused with different terms.");return structuredClone(prior.view);}
    if(body.revision!==this.revision)throw Error("Laboratory position changed. Reload before placing.");const action={...body.action,player:this.viewer} as Action;
    result=this.execute(action,this.scenario.laboratory?.opponent==="computer");this.requests.set(key,{fingerprint,view:result});
   }else if(path===base+"/placement-options"&&method==="POST"){
    if(body.revision!==this.revision)throw Error("Stale laboratory preview.");result={matchId:this.id,revision:this.revision,card:body.card,destinations:placementDestinations(this.state,this.library,this.viewer,body.card)};
   }else if(path===base+"/preview"&&method==="POST"){
    if(body.revision!==this.revision)throw Error("Stale laboratory preview.");const a=body.action;result={...tacticalPreview(this.state,this.library,this.viewer,a.card,a.row,a.col),matchId:this.id,revision:this.revision};
   }else throw Error("Unsupported laboratory request; no account service was contacted.");
  }
  return structuredClone(result) as T;
 };
}
