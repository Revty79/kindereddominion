let csrf="";
const sessions=typeof BroadcastChannel!=="undefined"?new BroadcastChannel("kindred-account-session"):null;
export function onSessionChange(fn:()=>void){sessions?.addEventListener("message",fn);return()=>sessions?.removeEventListener("message",fn);}
export async function api<T=any>(path:string,method="GET",body?:unknown):Promise<T>{
  const response=await fetch(`/api${path}`,{method,credentials:"include",headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(method==="GET"?{}:{"X-CSRF-Token":csrf})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(value?.error?.message??"The account server is unavailable. Your local practice data remains available.");
  if(value?.csrf)csrf=value.csrf;
  if(method==="POST"&&["/login","/logout","/accounts","/password/change","/password/recover"].includes(path))sessions?.postMessage({type:"session-changed"});
  return value;
}
export function downloadJson(name:string,value:unknown){const link=document.createElement("a"),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
