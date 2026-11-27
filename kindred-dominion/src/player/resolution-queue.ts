import type {ResolutionBatch,ResolutionEvent,VisiblePosition} from "../ui/resolution-presentation";

// Durations are shared settings; no gameplay clock or turn deadline uses them.
export const RESOLUTION_TIMING={turn:90,select:180,move:420,settle:200,influence:220,ability:280,effect:300,score:300,maxSequence:6500} as const;
export type ResolutionQueue={matchId:string;revision:number;events:ResolutionEvent[];seen:string[]};
export const emptyQueue=(matchId:string,revision:number):ResolutionQueue=>({matchId,revision,events:[],seen:[]});
const signature=(p:VisiblePosition)=>JSON.stringify([p.board,p.score,p.active,p.turn,p.status]);
export function acceptResolution(queue:ResolutionQueue,matchId:string,revision:number,batch:ResolutionBatch|undefined,latest:VisiblePosition):ResolutionQueue{
  if(queue.matchId!==matchId)return emptyQueue(matchId,revision);
  if(revision<=queue.revision)return queue;
  // Missing revisions, truncated streams or incompatible responses reconcile;
  // no fabricated catch-up actions and no replay on restoration.
  if(!batch||batch.schema!==1||batch.truncated||batch.matchId!==matchId||batch.fromRevision!==queue.revision||batch.toRevision!==revision||queue.seen.includes(batch.id)||!batch.events.length)return emptyQueue(matchId,revision);
  const last=batch.events.at(-1)!;
  if(signature(last.after)!==signature(latest))return emptyQueue(matchId,revision);
  if(queue.events.length&&signature(queue.events.at(-1)!.after)!==signature(batch.events[0].before))return emptyQueue(matchId,revision);
  if(batch.events.some((event,index)=>!event.id||!event.before||!event.after||index>0&&signature(event.before)!==signature(batch.events[index-1].after)))return emptyQueue(matchId,revision);
  const ids=new Set(queue.events.map(e=>e.id));
  const next=batch.events.filter(event=>!ids.has(event.id)&&!(event.actor===0&&(event.kind==="select"||event.kind==="move")));
  const events=[...queue.events,...next];
  return events.length>192?emptyQueue(matchId,revision):{matchId,revision,events,seen:[...queue.seen,batch.id].slice(-32)};
}
export function advanceResolution(queue:ResolutionQueue,eventId:string):ResolutionQueue{return queue.events[0]?.id===eventId?{...queue,events:queue.events.slice(1)}:queue;}
