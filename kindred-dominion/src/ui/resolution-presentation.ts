import {powerTable} from "../engine/evaluation";
import {scoreGame} from "../engine/scoring";
import {describeAbility} from "../engine/registry";
import type {Action,CardLibrary,DiagnosticStep,GameState,Player,Position,ResolutionObserver} from "../engine/types";
import {publicChanges,type PublicChange} from "./readability";
import {effectCategory,EFFECT_SYMBOLS,type EffectCategory} from "./tactical-preview";

export type VisibleCreature={id:string;owner:Player;definitionId:string;name:string;number:string;placementType:string;rank:number;printedPower:number;power:number;text:string;layers:{permanent:number;aura:number;dynamic:number};protections:string[]};
export type VisibleCell=Position&{owner:Player|null;tokens:number;fortification:number;creature:VisibleCreature|null};
export type VisiblePosition={board:VisibleCell[];score:{totals:[number,number];rows:ReturnType<typeof scoreGame>["rows"];columns:ReturnType<typeof scoreGame>["columns"];creatures:[number,number];bonuses:[number,number]};active:Player;turn:number;status:GameState["phase"]};
export type ResolvedEffect=Position&{category:EffectCategory;symbol:string;label:string;text:string};
export type ResolutionEvent={id:string;actionId:string;actor:Player;kind:"turn"|"select"|"move"|"settle"|"influence"|"ability"|"effect"|"score";caption:string;before:VisiblePosition;after:VisiblePosition;card:VisibleCreature|null;origin:{kind:"hand";player:Player;representative:true}|null;source:Position|null;target:Position|null;changes:PublicChange[];effects:ResolvedEffect[];scoreFrom:[number,number];scoring?:{before:VisiblePosition["score"];rows:number[];columns:number[]}};
export type ResolutionBatch={schema:1;id:string;matchId:string;fromRevision:number;toRevision:number;events:ResolutionEvent[];truncated:boolean};
export type AcceptedResolution={action:Action;sequence:number;before:GameState;after:GameState;steps:DiagnosticStep[]};

// Explicit public projection. Never serialize hands, draws, RNG, history,
// diagnostic details or concealed instance IDs into presentation metadata.
export function visiblePosition(state:GameState,library:CardLibrary):VisiblePosition{
  const powers=powerTable(state,library),score=scoreGame(state,library);
  return {active:state.active,turn:state.turn,status:state.phase,board:state.board.map(cell=>{
    const instance=cell.creature?state.cards[cell.creature]:null,definition=instance?library[instance.definitionId]:null,power=instance?powers[instance.id]:null;
    return {row:cell.row,col:cell.col,owner:cell.owner,tokens:cell.tokens,fortification:cell.fortification,creature:instance&&definition&&power?{id:instance.id,owner:instance.owner,definitionId:definition.id,name:definition.name,number:definition.collectible?.number??"",placementType:definition.type,rank:definition.rank,printedPower:definition.power,power:power.effective,text:definition.text,layers:{permanent:instance.modifier,aura:power.auras.reduce((n,a)=>n+a.amount,0),dynamic:power.dynamic},protections:[...new Set([...power.permanentProtections,...power.continuousProtections.map(p=>p.protection)])]}:null};
  }),score:{totals:score.totals,rows:score.rows,columns:score.columns,creatures:score.creatures,bonuses:score.breakdown?.bonuses??[0,0]}};
}

// Limit optional observer storage without stopping or changing resolution.
export function resolutionCapture(before:GameState){
  const steps:DiagnosticStep[]=[],limit=Math.max(1,Math.min(96,Math.floor(6_000_000/Math.max(1,JSON.stringify(before).length))));let states=0,truncated=false;
  const observer:ResolutionObserver={captureStates:kind=>{
    if(["condition","limit","targets","safeguard","before-random","before-private-draw","before-private-generate"].includes(kind))return false;
    if(states>=limit){truncated=true;return false;}states++;return true;
  },onStep:step=>{if(steps.length<384)steps.push(step);else truncated=true;}};
  return {steps,observer,get truncated(){return truncated;}};
}
const at=(p:Position)=>`${String.fromCharCode(65+p.row)}${p.col+1}`;
const actorName=(p:Player)=>p===0?"Jade":"Amber";
export function resolutionBatch(matchId:string,fromRevision:number,toRevision:number,resolutions:AcceptedResolution[],library:CardLibrary,truncated=false):ResolutionBatch{
  const batch:ResolutionBatch={schema:1,id:`${matchId}:${toRevision}`,matchId,fromRevision,toRevision,events:[],truncated};
  if(truncated)return batch;
  for(const {action,before,after,steps,sequence} of resolutions){
    const actionId=`${matchId}:${sequence}`,actor=action.player,initial=visiblePosition(before,library);
    let previous=before,view=initial,ability:{source:Position|null;name:string;description:string}|null=null,announced=false;
    const target=action.type==="play"?{row:action.row,col:action.col}:null;
    // A played creature can die during resolution. Reveal only an actual
    // captured public arrival, never a hand lookup or an assumed final card.
    const arrival=action.type==="play"?[...steps.flatMap(s=>s.state?[s.state]:[]),after].find(s=>s.board.some(c=>c.creature===action.card)):null;
    const revealed=arrival&&action.type==="play"?visiblePosition(arrival,library).board.find(c=>c.creature?.id===action.card)?.creature??null:null;
    function emit(kind:ResolutionEvent["kind"],next:VisiblePosition,caption:string,changes:PublicChange[]=[],source:Position|null=null,card:VisibleCreature|null=revealed){
      batch.events.push({id:`${actionId}:${batch.events.length}`,actionId,actor,kind,caption,before:view,after:next,card,origin:kind==="select"||kind==="move"?{kind:"hand",player:actor,representative:true}:null,source,target,changes,effects:changes.map(c=>{
        const kind=effectCategory(c),old=view.board.find(p=>p.row===c.row&&p.col===c.col)!,now=next.board.find(p=>p.row===c.row&&p.col===c.col)!,symbol=EFFECT_SYMBOLS[kind];
        const label=kind==="tokens"?`T ${old.tokens}→${now.tokens}`:kind==="fortification"?`F ${old.fortification}→${now.fortification}`:kind==="power"?`P ${old.creature?.power??"–"}→${now.creature?.power??"–"}`:symbol;
        return {row:c.row,col:c.col,category:kind,symbol,label,text:c.text};
      }),scoreFrom:initial.score.totals});view=next;
    }
    emit("turn",view,`${actorName(actor)} ${action.type==="mulligan"?"prepares their hand":action.type==="pass"?"passes":action.type==="surrender"?"concedes":"acts"}.`);
    if(revealed&&target){emit("select",view,`${actorName(actor)} plays ${revealed.name}.`);emit("move",view,`${revealed.name} → ${at(target)}.`);}
    for(const step of steps){
      const d=step.details as any;
      if(step.kind==="trigger"){
        ability=null;announced=false;const source=previous.board.find(c=>c.creature===d?.source?.id),known=source?.creature?previous.cards[source.creature]:d?.source?.id&&previous.players.some(p=>p.graveyard.includes(d.source.id))?previous.cards[d.source.id]:null;
        if(known&&library[known.definitionId])ability={source:source?{row:source.row,col:source.col}:null,name:library[known.definitionId].name,description:describeAbility(d.ability)};
      }
      if(step.kind==="effect-start"&&ability&&!announced){emit("ability",view,`${ability.name}: ${ability.description}`,[],ability.source,null);announced=true;}
      if(!step.state)continue;
      const next=visiblePosition(step.state,library),changes=publicChanges(previous,step.state,library);
      if(step.kind==="protection"&&typeof d?.card==="string"){
        const cell=next.board.find(c=>c.creature?.id===d.card);if(cell)changes.push({row:cell.row,col:cell.col,kind:"protection",label:"SH",text:`${cell.creature!.name}: weakening protection prevented the reduction.`});
      }
      for(const event of step.state.events.slice(previous.events.length))if(event.type==="protection"&&event.card){const cell=next.board.find(c=>c.creature?.id===event.card);if(cell)changes.push({row:cell.row,col:cell.col,kind:"protection",label:"SH",text:`${cell.creature!.name}: protection prevented destruction.`});}
      const source=step.kind==="territory"?previous.board.find(c=>c.creature===d?.source):ability?.source??null;
      if(changes.length){const kind=step.kind==="placement-arrival"?"settle":step.kind==="territory"?"influence":"effect";emit(kind,next,changes.slice(0,3).map(c=>c.text).join(" "),changes,source?{row:source.row,col:source.col}:null);}
      previous=step.state;
    }
    const final=visiblePosition(after,library),remaining=publicChanges(previous,after,library);
    if(remaining.length)emit("effect",final,remaining.slice(0,3).map(c=>c.text).join(" "),remaining);
    if(JSON.stringify(initial.score)!==JSON.stringify(final.score)){
      const rows=final.score.rows.flatMap((r,i)=>JSON.stringify(r)!==JSON.stringify(initial.score.rows[i])?[i]:[]),columns=final.score.columns.flatMap((c,i)=>JSON.stringify(c)!==JSON.stringify(initial.score.columns[i])?[i]:[]);
      emit("score",final,`Score: Jade ${initial.score.totals[0]} → ${final.score.totals[0]}, Amber ${initial.score.totals[1]} → ${final.score.totals[1]}.${rows.length?` Rows ${rows.map(r=>String.fromCharCode(65+r)).join(", ")} changed.`:""}`);
      batch.events.at(-1)!.scoring={before:initial.score,rows,columns};
    }
    emit("turn",final,after.phase==="finished"?"Battle concluded. Result saved.":`${actorName(after.active)} turn ${after.turn}.`);
  }
  if(batch.events.length>96||JSON.stringify(batch).length>1_500_000){batch.events=[];batch.truncated=true;}
  return batch;
}
