import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {DEFAULT_CONFIG} from "../engine/config";
import {createMatch,act,legalPlays} from "../engine/game";
export function practiceMatch(content:ContentPack){
 const library=libraryOf(content),decks=content.decks.filter(d=>d.collection==="Nature"||d.collection==="Constructs");
 const own=decks.find(d=>d.collection==="Nature")??content.decks[0],other=decks.find(d=>d.collection==="Constructs")??content.decks[1]??own;
 for(let seed=16145;seed<16165;seed++){
  let state=createMatch([own.cards,other.cards],library,DEFAULT_CONFIG,seed,0);
  for(const player of[0,1]as const)state=act(state,{type:"mulligan",player,cards:[]},library);
  if(legalPlays(state,library,0).length)return state;
 }
 throw Error("Practice cannot prepare a legal opening with this published content.");
}
