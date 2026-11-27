import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import {api} from "../account/api";
import {expandRecentMove,type RecentMoves} from "../ui/recent-moves";
import type {MotionProfile} from "./presentation-preferences";
import {RESOLUTION_TIMING} from "./resolution-queue";
export function useLastMove(value:any,profile:MotionProfile){
  const [active,setActive]=useState(false),[history,setHistory]=useState<RecentMoves|null>(null),[selected,setSelected]=useState(""),[index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState("");
  const latest=useRef(value),cache=useRef<RecentMoves|null>(value.recentPresentation??null),abort=useRef<AbortController|null>(null),ticket=useRef(0),started=useRef(0),prior=useRef({id:value.id,revision:value.revision}),mounted=useRef(true),activeRef=useRef(false);latest.current=value;activeRef.current=active;
  const move=history?.moves.find(m=>m.id===selected)??null,events=useMemo(()=>{try{return move?expandRecentMove(move):[];}catch{return [];}},[move]);
  const event=events[index]??null;
  function stop(){setPlaying(false);started.current=0;}
  function close(notice="Showing the current saved battlefield."){ticket.current++;abort.current?.abort();stop();setActive(false);setLoading(false);setMessage(notice);}
  async function open(){
    stop();setActive(true);setHistory(null);setSelected("");setMessage("");setLoading(true);const source=latest.current,generation=++ticket.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
    try{const h=cache.current?.matchId===source.id&&cache.current?.revision===source.revision?cache.current:await api(`/matches/${source.id}/recent-presentation?revision=${source.revision}`,"GET",undefined,{signal:controller.signal});
      if(!mounted.current||generation!==ticket.current||latest.current.revision!==source.revision)return;
      cache.current=h;setHistory(h);const newest=h.moves.at(-1);setSelected(newest?.id??"");setIndex(newest?.available?Math.max(0,(newest.events?.length??1)-1):0);
      if(!newest)setMessage("Detailed presentation was not recorded, or no first move has completed yet. The current match remains playable.");
    }catch(e){if(mounted.current&&generation===ticket.current&&!(e instanceof DOMException&&e.name==="AbortError"))setMessage(e instanceof Error?e.message:"Move details are temporarily unavailable. Return to the current game and retry.");}
    finally{if(mounted.current&&generation===ticket.current)setLoading(false);}
  }
  function choose(id:string){stop();setSelected(id);const m=history?.moves.find(m=>m.id===id);setIndex(Math.max(0,(m?.events?.length??1)-1));}
  function step(amount:number){stop();setIndex(i=>Math.max(0,Math.min(events.length-1,i+amount)));}
  function final(){stop();setIndex(Math.max(0,events.length-1));}
  function replay(){if(!events.length)return;setIndex(0);setPlaying(!profile.instant);started.current=performance.now();}
  useLayoutEffect(()=>{
    if(value.recentPresentation?.revision===value.revision)cache.current=value.recentPresentation;
    if(prior.current.id!==value.id||prior.current.revision!==value.revision){if(active)close("A newer accepted move arrived. Returned to the current battlefield; use Last Move to inspect it.");else setMessage("");prior.current={id:value.id,revision:value.revision};}
  },[value.id,value.revision,value.recentPresentation]);
  useEffect(()=>{if(!playing||!event)return;const remaining=RESOLUTION_TIMING.maxSequence-(performance.now()-started.current);if(remaining<=0){final();return;}const duration=!profile.movement&&["select","move"].includes(event.kind)?0:RESOLUTION_TIMING[event.kind]*profile.multiplier;const timer=setTimeout(()=>{if(index>=events.length-1)stop();else setIndex(i=>i+1);},Math.min(remaining,duration));return()=>clearTimeout(timer);},[playing,event?.id,index,profile]);
  useEffect(()=>{stop();},[profile.mode,profile.movement,profile.effects,profile.scores,profile.descriptions]);
  useEffect(()=>{mounted.current=true;const hidden=()=>{if(document.hidden&&activeRef.current)close();},escape=(e:KeyboardEvent)=>{if(e.key==="Escape"&&activeRef.current&&!document.querySelector('[role="dialog"]'))close();},blur=()=>{if(activeRef.current)close();};window.addEventListener("blur",blur);window.addEventListener("resize",blur);document.addEventListener("visibilitychange",hidden);window.addEventListener("keydown",escape);return()=>{mounted.current=false;ticket.current++;abort.current?.abort();window.removeEventListener("blur",blur);window.removeEventListener("resize",blur);document.removeEventListener("visibilitychange",hidden);window.removeEventListener("keydown",escape);};},[]);
  const position=active&&event?(playing&&["move","select"].includes(event.kind)||event.effects.some(e=>["destruction","evolution","replacement","return","banish","sacrifice"].includes(e.category))?event.before:event.after):null;
  return {active,history,move,events,event,index,playing,loading,message,position,open,close,choose,step,final,replay,stop};
}
