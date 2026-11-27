import type {ResolutionBatch,ResolutionEvent,VisiblePosition} from "./resolution-presentation";
import type {Player} from "../engine/types";
type Delta=Partial<Omit<VisiblePosition,"board">>&{cells?:VisiblePosition["board"]};
type StoredEvent=Omit<ResolutionEvent,"before"|"after">&{delta:Delta};
export type RecentMove={id:string;actor:Player;sequence:number;revision:number;type:string;available:boolean;reason?:string;initial?:VisiblePosition;events?:StoredEvent[]};
export type RecentMoves={schema:1;matchId:string;revision:number;moves:RecentMove[]};
export const RECENT_MOVE_LIMIT=160_000,RECENT_HISTORY_LIMIT=300_000;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const size=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
function delta(before:VisiblePosition,after:VisiblePosition):Delta{
 const result:Delta={},cells=after.board.filter(c=>!same(c,before.board.find(b=>b.row===c.row&&b.col===c.col)));
 if(cells.length)result.cells=cells;
 if(!same(before.score,after.score))result.score=after.score;
 for(const key of["active","turn","status"]as const)if(before[key]!==after[key])(result as any)[key]=after[key];
 return result;
}
function apply(before:VisiblePosition,change:Delta):VisiblePosition{
 const {cells,...rest}=change;return {...before,...rest,board:cells?before.board.map(c=>cells.find(p=>p.row===c.row&&p.col===c.col)??c):before.board};
}
export function retainRecentMoves(previous:RecentMoves|undefined,batch:ResolutionBatch,actions:{id:string;actor:Player;sequence:number;type:string}[]):RecentMoves{
 const result:RecentMoves={schema:1,matchId:batch.matchId,revision:batch.toRevision,moves:previous?.schema===1&&previous.matchId===batch.matchId?previous.moves.slice():[]};
 for(const action of actions){
  const events=batch.events.filter(e=>e.actionId===action.id),first=events[0];
  let move:RecentMove={...action,revision:batch.toRevision,available:false,reason:"Detailed presentation was not retained for this move."};
  if(!batch.truncated&&first){
   let current=first.before;
   const compact=events.map(event=>{if(!same(current,event.before))throw Error("Presentation event continuity failed");const {before,after,...metadata}=event,change=delta(before,after);current=after;return {...metadata,delta:change};});
   move={...action,revision:batch.toRevision,available:true,initial:first.before,events:compact};
   if(size(move)>RECENT_MOVE_LIMIT)move={...action,revision:batch.toRevision,available:false,reason:"This complex move exceeded the bounded history size. The saved result and ordinary log remain available."};
  }
  result.moves=result.moves.filter(m=>m.actor!==action.actor);result.moves.push(move);
 }
 result.moves.sort((a,b)=>a.sequence-b.sequence);result.moves=result.moves.slice(-2);
 for(let i=0;size(result)>RECENT_HISTORY_LIMIT&&i<result.moves.length;i++){const {id,actor,sequence,revision,type}=result.moves[i];result.moves[i]={id,actor,sequence,revision,type,available:false,reason:"This recent presentation exceeded its storage limit. Newer move details take priority."};}
 return result;
}
// Recorded public deltas only: no engine, private reconstruction or action API.
export function expandRecentMove(move:RecentMove):ResolutionEvent[]{
 if(!move.available||!move.initial||!move.events?.length)return [];
 if(move.events.length>96||size(move)>RECENT_MOVE_LIMIT)throw Error("Unsupported recorded move");
 let current=move.initial;
 return move.events.map(({delta,...event})=>{const before=current,after=apply(before,delta);current=after;return {...event,before,after};});
}
