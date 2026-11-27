import {currentOwnerContent} from "../content/current";
import {libraryOf} from "../content/validation";
import {DEFAULT_CONFIG} from "../engine/config";
import {act,assertInvariants} from "../engine/game";
import {powerTable} from "../engine/evaluation";
import {scoreGame} from "../engine/scoring";
import {emptyScenario,addInstance,validateScenario} from "../sandbox/scenario";
import {appendRecord,newRecord,validateRecord} from "../replay/record";
import type {Action,Player} from "../engine/types";

/** A declared, local-only position. The evolution and replacement are resolved
 * by the real engine; this never reads or writes a player's game or database. */
export function battlefieldStudyScene(scoring:"classic"|"domination"="classic"){
  const content=currentOwnerContent(),library=libraryOf(content);
  const scenario=emptyScenario(content,{...structuredClone(DEFAULT_CONFIG),scoring},"Played-card presentation study");
  let state=scenario.state;
  for(const cell of state.board){cell.owner=null;cell.tokens=0;cell.fortification=0;}
  const add=(definition:string,owner:Player,zone:"battlefield"|"hand",col?:number)=>{
    state=addInstance(state,definition,owner,zone,col===undefined?undefined:{row:0,col});return `c${state.nextCard-1}`;
  };
  add("n003",0,"battlefield",0);add("a015",0,"battlefield",1);
  add("n002",0,"battlefield",2);add("u020",1,"battlefield",3);add("c020",1,"battlefield",4);
  for(const cell of state.board.filter(c=>c.row===0))cell.tokens=state.config.battlefield.maxTokens;
  state.board.find(c=>c.row===0&&c.col===4)!.fortification=state.config.battlefield.maxFortification;
  const evolution=add("n027",0,"hand"),replacement=add("n026",1,"hand");
  scenario.state=state;
  if(validateScenario(scenario).some(i=>i.severity==="error"))throw Error("Invalid battlefield study position.");
  let record=newRecord(state,library,[[],[]],content.id,scenario.name);
  for(const action of [
    {type:"play",player:0,card:evolution,row:0,col:2},
    {type:"play",player:1,card:replacement,row:0,col:3},
  ] satisfies Action[]){state=act(state,action,library);if(state.fault)throw Error(state.fault);record=appendRecord(record,action,state);}
  assertInvariants(state,library);validateRecord(record);
  return {content,library,state,record,powers:powerTable(state,library),score:scoreGame(state,library),row:state.board.filter(c=>c.row===0)};
}
