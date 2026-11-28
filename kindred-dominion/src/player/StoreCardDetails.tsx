import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {artworkMap} from "../assets/references";
import CollectibleCard from "../ui/cards/CollectibleCard";
import ReadableCardRules from "../ui/cards/ReadableCardRules";
export default function StoreCardDetails({content,ids,owned,grants,targets}:{content:ContentPack;ids:string[];owned:Record<string,number>;grants?:Record<string,number>;targets?:Record<string,number>}){
 const library=libraryOf(content),art=artworkMap(content);
 return <details><summary>Exact eligible identities and current quantities</summary><ul>{ids.map(id=><li key={id}><details><summary>{id.toUpperCase()} {library[id]?.name} · Owned {owned[id]??0}{grants&&` · Receive ${grants[id]??0} · Target ${targets?.[id]??0}`}</summary>{library[id]?<><div style={{width:180,maxWidth:"100%"}}><CollectibleCard original card={library[id]} library={library} artwork={art[id]} scale="hand"/></div><ReadableCardRules card={library[id]} library={library}/></>:<p>This archived identity has no currently readable definition in this product snapshot.</p>}</details></li>)}</ul></details>;
}
