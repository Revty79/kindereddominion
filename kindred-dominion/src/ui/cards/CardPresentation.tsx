import {createContext,useContext,type ReactNode} from "react";
import type {PersonalCosmetics} from "../../shop/cosmetic-types";
type Presentation={cosmetics?:Record<string,string>;rarities?:Record<string,string>;personalCosmetics?:PersonalCosmetics};
const Context=createContext<Presentation>({});
export function CardPresentation({value,children}:{value:Presentation;children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>;}
export const useCardPresentation=()=>useContext(Context);
