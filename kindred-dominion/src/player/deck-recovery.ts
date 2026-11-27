import type {DeckDocument} from "./deck-analysis";
export type DeviceDeckEdit={key:string;raw:string;deckId:string;baseRevision:number;revision:number;document:DeckDocument;at:number};
export const deckEditorKey=(playerId:string)=>`kindred:deck-open:v1:${playerId}`;
export const recoveryPrefix=(playerId:string,deckId?:string)=>`kindred:deck-edit:v1:${playerId}:${deckId?deckId+":":""}`;
export function validDeckDocument(d:any):d is DeckDocument {
  return !!d&&typeof d.name==="string"&&d.name.length<=80&&Array.isArray(d.cards)&&d.cards.length<=15&&d.cards.every((id:any)=>typeof id==="string"&&id.length>0&&id.length<=80)&&!!d.config&&["classic","domination"].includes(d.config.scoring)&&["standard","free"].includes(d.config.mode)&&typeof d.config.collection==="string"&&typeof d.testingAccess==="boolean"&&(d.formatId===null||typeof d.formatId==="string");
}
export function deviceDeckEdits(playerId:string,deckId?:string):DeviceDeckEdit[]{
  const entries:DeviceDeckEdit[]=[];
  try{for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index)!;if(!key.startsWith(recoveryPrefix(playerId,deckId)))continue;const raw=localStorage.getItem(key)!;try{const v=JSON.parse(raw);if(v.schema===1&&validDeckDocument(v.document)&&typeof v.deckId==="string"&&Number.isInteger(v.baseRevision)&&v.baseRevision>0&&Number.isInteger(v.revision)&&v.revision>=0&&typeof v.at==="number")entries.push({...v,key,raw});}catch{/* A malformed entry never replaces a valid server deck. */}}}catch{/* Device storage can be unavailable; the editor reports write failures. */}
  return entries.sort((a,b)=>b.at-a.at);
}
export function removeDeviceEdit(entry:Pick<DeviceDeckEdit,"key"|"raw">){if(localStorage.getItem(entry.key)===entry.raw)localStorage.removeItem(entry.key);}
