import {createContext,useContext} from "react";
import {api} from "../account/api";
// Presentation has one interface. Ordinary games retain authenticated server
// authority; Studio supplies an explicit closed, in-memory engine adapter.
export type BattleConnection={request:typeof api;sandbox:boolean;refresh:boolean;preferenceEvent:string};
const account:BattleConnection={request:api,sandbox:false,refresh:true,preferenceEvent:"kindred-presentation-updated"};
export const BattleConnectionContext=createContext<BattleConnection>(account);
export const useBattleConnection=()=>useContext(BattleConnectionContext);
