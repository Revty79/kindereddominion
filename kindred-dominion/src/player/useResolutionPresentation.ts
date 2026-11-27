import {useEffect,useLayoutEffect,useRef,useState} from "react";
import type {VisiblePosition} from "../ui/resolution-presentation";
import {acceptResolution,advanceResolution,emptyQueue,RESOLUTION_TIMING} from "./resolution-queue";

export function useResolutionPresentation(value:any){
  const [queue,setQueue]=useState(()=>emptyQueue(value.id,value.revision)),[announcement,setAnnouncement]=useState("");
  const latest=useRef(value),started=useRef(0),locked=useRef(false);latest.current=value;
  const event=queue.events[0]??null,active=!!event;locked.current=active;
  function skip(){setQueue(emptyQueue(latest.current.id,latest.current.revision));setAnnouncement("Showing the latest saved position.");started.current=0;locked.current=false;}
  useLayoutEffect(()=>{
    setQueue(current=>{
      const v=latest.current,position:VisiblePosition={board:v.board,score:v.score,active:v.active,turn:v.turn,status:v.status};
      if(document.hidden||matchMedia("(prefers-reduced-motion: reduce)").matches)return emptyQueue(v.id,v.revision);
      try{return acceptResolution(current,v.id,v.revision,v.resolution,position);}catch{return emptyQueue(v.id,v.revision);}
    });
  },[value.id,value.revision,value.resolution]);
  useEffect(()=>{
    if(!event){started.current=0;return;}
    if(!started.current)started.current=performance.now();
    const remaining=RESOLUTION_TIMING.maxSequence-(performance.now()-started.current);
    if(remaining<=0){skip();return;}
    setAnnouncement(event.caption);
    const timer=setTimeout(()=>setQueue(q=>advanceResolution(q,event.id)),Math.min(RESOLUTION_TIMING[event.kind],remaining));
    return()=>clearTimeout(timer);
  },[event?.id]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden)skip();},reduce=matchMedia("(prefers-reduced-motion: reduce)"),changed=()=>{if(reduce.matches)skip();};
    window.addEventListener("blur",skip);window.addEventListener("resize",skip);document.addEventListener("visibilitychange",hidden);document.addEventListener("fullscreenchange",skip);reduce.addEventListener("change",changed);
    return()=>{window.removeEventListener("blur",skip);window.removeEventListener("resize",skip);document.removeEventListener("visibilitychange",hidden);document.removeEventListener("fullscreenchange",skip);reduce.removeEventListener("change",changed);};
  },[]);
  // Departing creatures stay visible for the effect's dwell, then advance to
  // the actual resulting state. Other effects show accepted numerical changes.
  const departing=event?.effects.some(e=>["destruction","evolution","replacement","return","banish","sacrifice"].includes(e.category));
  const position=event?(event.kind==="move"||event.kind==="select"||departing?event.before:event.after):null;
  return {active,event,position,announcement,skip,locked};
}
