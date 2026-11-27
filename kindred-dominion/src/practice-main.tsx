import React,{lazy,Suspense,useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {api} from "./account/api";
import "./ui/styles.css";
import "./player/player.css";
const Player=lazy(()=>import("./ui/PlayerHost"));
const Development=import.meta.env.VITE_STUDIO!=="0"?lazy(()=>import("./ui/GameHost")):null;
function Practice(){const [developer,setDeveloper]=useState(false),[ready,setReady]=useState(false),initial=useRef<Promise<any>|null>(null);
  useEffect(()=>{let live=true;if(!initial.current)initial.current=api("/session");initial.current.then(s=>{if(live)setDeveloper(!!s.player&&s.player.role!=="player");}).catch(()=>{}).finally(()=>{if(live)setReady(true);});const account=()=>{location.href="/#login";};window.addEventListener("kindred-open-account",account);return()=>{live=false;window.removeEventListener("kindred-open-account",account);};},[]);
  return <><div className="practice-return"><a href="/">← Return to player menu</a><span>Offline practice · No permanent rewards or results</span></div>{ready?<Suspense fallback={<p>Preparing practice…</p>}>{developer&&Development?<Development/>:<Player/>}</Suspense>:<p>Preparing practice…</p>}</>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Practice/></React.StrictMode>);
