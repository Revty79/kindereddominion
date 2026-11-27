import {useEffect,useLayoutEffect,useRef,useState} from "react";
import type {VisiblePosition} from "../ui/resolution-presentation";
import {acceptResolution,advanceResolution,emptyQueue,RESOLUTION_TIMING} from "./resolution-queue";
import type {MotionProfile} from "./presentation-preferences";

export function useResolutionPresentation(value:any,profile:MotionProfile,ready=true,paused=false){
  const [queue,setQueue]=useState(()=>emptyQueue(value.id,value.revision)),[announcement,setAnnouncement]=useState("");
  const latest=useRef(value),started=useRef(0),locked=useRef(false);latest.current=value;
  const event=queue.events[0]??null,active=!!event;locked.current=active;
  function skip(){setQueue(emptyQueue(latest.current.id,latest.current.revision));setAnnouncement("Showing the latest saved position.");started.current=0;locked.current=false;}
  useLayoutEffect(()=>{
    setQueue(current=>{
      const v=latest.current,position:VisiblePosition={board:v.board,score:v.score,active:v.active,turn:v.turn,status:v.status};
      if(document.hidden||!ready||paused||profile.instant||profile.mode==="reduced")return emptyQueue(v.id,v.revision);
      try{const next=acceptResolution(current,v.id,v.revision,v.resolution,position);return profile.movement?next:{...next,events:next.events.filter(e=>!["select","move"].includes(e.kind))};}catch{return emptyQueue(v.id,v.revision);}
    });
  },[value.id,value.revision,value.resolution,ready,paused,profile.mode,profile.movement]);
  useEffect(()=>{
    if(!event){started.current=0;return;}
    if(!started.current)started.current=performance.now();
    const remaining=RESOLUTION_TIMING.maxSequence-(performance.now()-started.current);
    if(remaining<=0){skip();return;}
    setAnnouncement(event.caption);
    const timer=setTimeout(()=>setQueue(q=>advanceResolution(q,event.id)),Math.min(RESOLUTION_TIMING[event.kind]*profile.multiplier,remaining));
    return()=>clearTimeout(timer);
  },[event?.id,profile.multiplier]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)skip();};
    window.addEventListener("blur",skip);window.addEventListener("resize",skip);document.addEventListener("visibilitychange",hidden);document.addEventListener("fullscreenchange",skip);
    return()=>{window.removeEventListener("blur",skip);window.removeEventListener("resize",skip);document.removeEventListener("visibilitychange",hidden);document.removeEventListener("fullscreenchange",skip);};
  },[]);
  // Departing creatures stay visible for the effect's dwell, then advance to
  // the actual resulting state. Other effects show accepted numerical changes.
  const departing=event?.effects.some(e=>["destruction","evolution","replacement","return","banish","sacrifice"].includes(e.category));
  const position=event?(event.kind==="move"||event.kind==="select"||departing?event.before:event.after):null;
  const batch=value.resolution,last=batch?.events?.at(-1),score=[...(batch?.events??[])].reverse().find((e:any)=>e.kind==="score"),played=[...(batch?.events??[])].reverse().find((e:any)=>e.kind==="move");
  const summary=profile.mode==="reduced"&&last?`${played?.caption??last.caption}${score?` ${score.caption}`:""}`:"";
  return {active,event,position,announcement,summary,skip,locked};
}
