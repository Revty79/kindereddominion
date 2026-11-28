import {useEffect,useRef,useState} from "react";
import {api} from "../account/api";
import {DEFAULT_LEARNING,type LessonId,type LearningDestination,type LearningProgress} from "./learning-model";
type Change={action:"visit"|"complete";lesson:LessonId}|{action:"explore";destination:LearningDestination}|{action:"skip"|"resume"};
export function useLearning(playerId?:string){
 const [saved,setSaved]=useState({revision:0,progress:structuredClone(DEFAULT_LEARNING)}),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),generation=useRef(0),lock=useRef<symbol|null>(null);
 async function reload(){if(!playerId)return;const ticket=++generation.current;try{const next=await api("/learning");if(ticket===generation.current){setSaved(next);setLoaded(true);setError("");}}catch(e){if(ticket===generation.current)setError((e as Error).message);}}
 useEffect(()=>{lock.current=null;setBusy(false);setLoaded(false);setSaved({revision:0,progress:structuredClone(DEFAULT_LEARNING)});setError("");void reload();return()=>{generation.current++;};},[playerId]);
 async function change(value:Change){if(!loaded||lock.current)return false;const operation=Symbol();lock.current=operation;setBusy(true);setError("");const ticket=generation.current;try{const next=await api("/learning","PUT",{revision:saved.revision,change:value});if(ticket===generation.current)setSaved(next);return true;}catch(e){if(ticket===generation.current)setError((e as Error).message);return false;}finally{if(lock.current===operation)lock.current=null;if(ticket===generation.current)setBusy(false);}}
 return {...saved,loaded,busy,error,change,reload};
}
export type LearningController=ReturnType<typeof useLearning>;
