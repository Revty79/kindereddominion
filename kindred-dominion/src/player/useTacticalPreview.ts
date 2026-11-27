import {useEffect,useRef,useState} from "react";
import {api} from "../account/api";
import type {PlacementDestination,TacticalPreview} from "../ui/tactical-preview";
type Preview=TacticalPreview & {matchId:string;revision:number};
type Options={matchId:string;revision:number;card:string;destinations:PlacementDestination[]};
export function useTacticalPreview(id:string,revision:number,card:string,target:{row:number;col:number}|null,enabled:boolean){
  const [options,setOptions]=useState<Options|null>(null),[result,setResult]=useState<{key:string;preview:Preview}|null>(null),[failure,setFailure]=useState<{key:string;message:string}|null>(null),[loading,setLoading]=useState("");
  const cache=useRef(new Map<string,Preview>()),optionCache=useRef(new Map<string,Options>()),generation=useRef(0);
  const base=`${id}:${revision}:${card}`,key=target?`${base}:${target.row}:${target.col}`:"",current=useRef("");current.current=enabled?key:"";
  useEffect(()=>{if(!enabled||!card)return;const cached=optionCache.current.get(base);if(cached){setOptions(cached);return;}const controller=new AbortController();void api<Options>(`/matches/${id}/placement-options`,"POST",{revision,card},{signal:controller.signal}).then(value=>{if(controller.signal.aborted||value.matchId!==id||value.revision!==revision||value.card!==card)return;optionCache.current.clear();optionCache.current.set(base,value);setOptions(value);setFailure(null);}).catch(error=>{if(!controller.signal.aborted)setFailure({key:base,message:error.message});});return()=>controller.abort();},[base,enabled]);
  useEffect(()=>{
    const ticket=++generation.current;if(!enabled||!card||!target||!key)return;
    const destination=options?.matchId===id&&options.revision===revision&&options.card===card?options.destinations.find(d=>d.row===target.row&&d.col===target.col):null;
    if(destination&&!destination.legal)return;
    const cached=cache.current.get(key);if(cached){setResult({key,preview:cached});setLoading("");return;}
    const controller=new AbortController();setLoading(key);
    const timer=setTimeout(()=>{void api<Preview>(`/matches/${id}/preview`,"POST",{revision,action:{type:"play",card,row:target.row,col:target.col}},{signal:controller.signal}).then(preview=>{
      if(controller.signal.aborted||ticket!==generation.current||current.current!==key||preview.matchId!==id||preview.revision!==revision||preview.card!==card||preview.target.row!==target.row||preview.target.col!==target.col)return;
      if(cache.current.size>=32)cache.current.delete(cache.current.keys().next().value!);cache.current.set(key,preview);setResult({key,preview});setFailure(null);
    }).catch(error=>{if(!controller.signal.aborted&&ticket===generation.current)setFailure({key,message:error.message});}).finally(()=>{if(!controller.signal.aborted&&ticket===generation.current)setLoading("");});},140);
    return()=>{clearTimeout(timer);controller.abort();};
  },[key,enabled,options]);
  const validOptions=enabled&&options?.matchId===id&&options.revision===revision&&options.card===card?options:null;
  const destination=target?validOptions?.destinations.find(d=>d.row===target.row&&d.col===target.col):null;
  return {options:validOptions,preview:enabled&&result?.key===key?result.preview:null,loading:enabled&&!!key&&loading===key&&destination?.legal!==false,error:enabled&&failure&&(failure.key===key||failure.key===base)?failure.message:null,destination};
}
