import {useEffect,useRef,useState,type RefObject,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {adjacentTile,floatingPosition,placementRequest,type Placement,type PlacementSource,type Point} from "./placement-input";

type View = PlacementSource & {hand:{id:string;definitionId:string}[];configuration:{battlefield:{rows:number;cols:number}}};
type Target = {row:number;col:number};
type Visual = {card:string;definition:string;phase:"held"|"returning"|"placing"};
type Options = {value:View;root:RefObject<HTMLElement|null>;blocked:boolean;onChoose:(placement:Placement)=>void;onCancel:()=>void};

export function useCardPlacement(options:Options){
  const latest=useRef(options);latest.current=options;
  const [selected,setSelected]=useState(""),selection=useRef("");
  const [target,setTarget]=useState<Target|null>(null),targetRef=useRef<Target|null>(null);
  const [visual,setVisual]=useState<Visual|null>(null),visualRef=useRef<Visual|null>(null),floating=useRef<HTMLDivElement>(null);
  const [dragging,setDragging]=useState(false),[message,setMessage]=useState("");
  const point=useRef<Point>({x:0,y:0}),raf=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const gesture=useRef<{id:number;card:string;start:Point;moved:boolean;button:HTMLElement}|null>(null),suppressed=useRef<{card:string;until:number}|null>(null);
  const position=useRef({x:0,y:0,width:110});
  const canSelect=()=>{const o=latest.current;return !o.blocked&&o.value.status==="playing"&&o.value.active===0;};
  const tile=(row:number,col:number)=>latest.current.root.current?.querySelector<HTMLElement>(`[data-placement-row="${row}"][data-placement-col="${col}"]`)??null;
  function updateTarget(next:Target|null){if(targetRef.current?.row===next?.row&&targetRef.current?.col===next?.col)return;targetRef.current=next;setTarget(next);}
  function show(next:Visual|null){visualRef.current=next;setVisual(next);}
  function clearTimer(){if(timer.current){clearTimeout(timer.current);timer.current=null;}}
  function release(){const g=gesture.current;gesture.current=null;setDragging(false);if(g?.button.hasPointerCapture(g.id))g.button.releasePointerCapture(g.id);}
  function hand(card:string){return [...(latest.current.root.current?.querySelectorAll<HTMLElement>("[data-hand-instance]")??[])].find(el=>el.dataset.handInstance===card);}
  function paint(){
    raf.current=0;if(!floating.current||!visualRef.current||visualRef.current.phase!=="held")return;
    const width=innerWidth<700?92:128,height=width*4/3,area=targetRef.current?tile(targetRef.current.row,targetRef.current.col)?.getBoundingClientRect():undefined;
    const pos=floatingPosition(point.current,width,height,{width:innerWidth,height:innerHeight},area);
    position.current={...pos,width};floating.current.style.width=width+"px";floating.current.style.transform=`translate3d(${pos.x}px,${pos.y}px,0)`;
  }
  function schedule(){if(!raf.current)raf.current=requestAnimationFrame(paint);}
  function animateEnd(phase:"returning"|"placing",destination?:Target){
    clearTimer();release();const previous=visualRef.current;selection.current="";setSelected("");updateTarget(null);
    if(!previous)return;
    show({...previous,phase});
    const element=destination?tile(destination.row,destination.col)?.querySelector<HTMLElement>(".player-tile-card-space"):hand(previous.card),rect=element?.getBoundingClientRect();
    if(rect&&floating.current){const width=Math.min(rect.width,rect.height*.75),x=rect.left+(rect.width-width)/2,y=rect.top+(rect.height-width*4/3)/2;floating.current.dataset.phase=phase;floating.current.style.transform=`translate3d(${x}px,${y}px,0) scale(${width/position.current.width})`;}
    timer.current=setTimeout(()=>{show(null);timer.current=null;},matchMedia("(prefers-reduced-motion: reduce)").matches?0:220);
  }
  function cancel(announce=true){latest.current.onCancel();animateEnd("returning");if(announce)setMessage("Selection cancelled. Your hand and saved match are unchanged.");else setMessage("");}
  function select(card:string,at?:Point){
    if(!canSelect())return;
    const value=latest.current.value,creature=value.hand.find(c=>c.id===card);if(!creature)return;
    if(!value.legalActions.some(a=>a.card===card)){setMessage("No legal destinations for this card. Inspect its placement requirement or choose another card.");return;}
    clearTimer();latest.current.onCancel();selection.current=card;setSelected(card);updateTarget(null);
    const rect=hand(card)?.getBoundingClientRect();point.current=at??{x:rect?rect.left+rect.width/2:innerWidth/2,y:rect?rect.top+rect.height/2:innerHeight/2};
    show({card,definition:creature.definitionId,phase:"held"});schedule();setMessage("Card selected. Choose a legal tile. Escape or Clear selection returns it to your hand.");
  }
  function choose(row:number,col:number){
    if(!canSelect()||!selection.current)return;
    const request=placementRequest(latest.current.value,selection.current,row,col);updateTarget({row,col});schedule();
    if(!request){setMessage("Unavailable destination. Choose a tile marked Legal placement, or cancel the selection.");return;}
    latest.current.onChoose(request.action);
  }
  function hit(at:Point){const element=document.elementFromPoint(at.x,at.y)?.closest<HTMLElement>("[data-placement-row]");return element&&latest.current.root.current?.contains(element)?{row:Number(element.dataset.placementRow),col:Number(element.dataset.placementCol)}:null;}
  useEffect(()=>{schedule();},[visual?.card,visual?.phase]);
  useEffect(()=>{
    // Changed snapshots cannot inherit an uncommitted gesture. An accepted
    // placement may finish its short presentation animation over the new board.
    if(visualRef.current?.phase!=="placing")cancel(false);
  },[options.value.id,options.value.revision,options.value.status,options.value.active]);
  useEffect(()=>{
    function move(event:PointerEvent){
      const g=gesture.current;if(g&&g.id!==event.pointerId)return;
      if(g&&!g.moved&&Math.hypot(event.clientX-g.start.x,event.clientY-g.start.y)>=8){if(!canSelect())return;g.moved=true;select(g.card,{x:event.clientX,y:event.clientY});setDragging(true);}
      if(!selection.current||!canSelect())return;
      if(g?.moved)event.preventDefault();point.current={x:event.clientX,y:event.clientY};updateTarget(hit(point.current));schedule();
    }
    function up(event:PointerEvent){const g=gesture.current;if(!g||g.id!==event.pointerId)return;const moved=g.moved;release();if(!moved)return;event.preventDefault();suppressed.current={card:g.card,until:performance.now()+500};const destination=hit({x:event.clientX,y:event.clientY});if(destination&&placementRequest(latest.current.value,selection.current,destination.row,destination.col))choose(destination.row,destination.col);else cancel();}
    const interrupt=()=>cancel();
    const hidden=()=>{if(document.hidden)cancel(false);};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape"&&selection.current){event.preventDefault();cancel();}};
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",up);window.addEventListener("pointercancel",interrupt);window.addEventListener("blur",interrupt);window.addEventListener("keydown",key);document.addEventListener("visibilitychange",hidden);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);window.removeEventListener("pointercancel",interrupt);window.removeEventListener("blur",interrupt);window.removeEventListener("keydown",key);document.removeEventListener("visibilitychange",hidden);clearTimer();cancelAnimationFrame(raf.current);const g=gesture.current;if(g?.button.hasPointerCapture(g.id))g.button.releasePointerCapture(g.id);};
  },[]);
  function pointerDown(event:ReactPointerEvent<HTMLElement>,card:string){
    if(event.button!==0||!event.isPrimary||!canSelect()||!latest.current.value.legalActions.some(a=>a.card===card))return;
    gesture.current={id:event.pointerId,card,start:{x:event.clientX,y:event.clientY},moved:false,button:event.currentTarget};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function clickCard(card:string,at?:Point){const skip=suppressed.current;if(skip?.card===card&&skip.until>performance.now()){suppressed.current=null;return;}if(selection.current===card)cancel();else select(card,at);}
  function focusTile(row:number,col:number){if(!selection.current)return;updateTarget({row,col});const rect=tile(row,col)?.getBoundingClientRect();if(rect){point.current={x:rect.left+rect.width/2,y:rect.top+rect.height/2};schedule();}}
  function navigate(event:ReactKeyboardEvent<HTMLElement>,row?:number,col?:number){
    if(!selection.current||!canSelect())return;
    if(row===undefined||col===undefined){if(!event.key.startsWith("Arrow"))return;const first=latest.current.value.legalActions.find(a=>a.card===selection.current);if(first){event.preventDefault();tile(first.row,first.col)?.querySelector<HTMLButtonElement>(".player-tile-action")?.focus();}return;}
    const field=latest.current.value.configuration.battlefield,next=adjacentTile(row,col,event.key,field.rows,field.cols);if(next){event.preventDefault();tile(next.row,next.col)?.querySelector<HTMLButtonElement>(".player-tile-action")?.focus();}
  }
  return {selected,target,visual,floating,dragging,message,cancel,choose,clickCard,pointerDown,navigate,focusTile,lostCapture:(id:number)=>{if(gesture.current?.id===id)cancel();},accepted:(destination:Target)=>{animateEnd("placing",destination);setMessage("Placement accepted and saved.");},rejected:()=>{release();updateTarget(null);setMessage("Placement was not accepted. Your hand is preserved; review the saved position before retrying.");},pointTo:(at:Point)=>{point.current=at;schedule();}};
}
