import type {GameState,Player} from "../engine/types";
import type {ContentPack} from "../content/types";
import {libraryOf} from "../content/validation";
import {powerTable} from "../engine/evaluation";
import {scoreGame} from "../engine/scoring";
import {legalPlays} from "../engine/game";
import {visiblePosition} from "./resolution-presentation";
import {publicEventText} from "./readability";

export function battleView(row:any,pack:ContentPack,state:GameState=row.state,includeContent=true,viewer:Player=0){
  const library=libraryOf(pack),powers=powerTable(state,library),score=scoreGame(state,library);
  const opponent=pack.decks.find(deck=>deck.cards.length===row.decks[1].length&&deck.cards.every((id,index)=>id===row.decks[1][index]));
  const card=(id:string)=>({id,owner:state.cards[id].owner,definitionId:state.cards[id].definitionId,name:library[state.cards[id].definitionId].name,number:library[state.cards[id].definitionId].collectible?.number??"",placementType:library[state.cards[id].definitionId].type,rank:library[state.cards[id].definitionId].rank,printedPower:library[state.cards[id].definitionId].power,power:powers[id]?.effective??library[state.cards[id].definitionId].power,text:library[state.cards[id].definitionId].text,layers:{permanent:state.cards[id].modifier,aura:powers[id]?.auras.reduce((n,a)=>n+a.amount,0)??0,dynamic:powers[id]?.dynamic??0},protections:powers[id]?[...powers[id].permanentProtections,...powers[id].continuousProtections.map(p=>p.protection)]:[]});
  return {id:row.id,revision:row.revision,status:state.phase,contentVersion:row.version_id,engineVersion:row.engine_version,createdAt:row.created_at,completedAt:row.completed_at,
    ...(includeContent?{content:pack}:{}),opponent:{type:"computer",name:opponent?.name??"Computer opponent",kindred:opponent?.collection??"mixed"},configuration:state.config,active:state.active,turn:state.turn,testingAccess:row.testing_access,cosmetics:row.cosmetics??{},personalCosmetics:row.personalCosmetics??{},rarities:row.rarities??{},
    board:visiblePosition(state,library).board,
    hand:state.players[viewer].hand.map(card),players:state.players.map(p=>({handCount:p.hand.length,drawCount:p.draw.length,graveyard:p.graveyard.map(card),exile:p.exile.map(card),mulliganDone:p.mulliganDone})),
    legalActions:state.phase==="playing"&&state.active===viewer?legalPlays(state,library,viewer).flatMap(a=>a.type==="play"?[{type:a.type,card:a.card,row:a.row,col:a.col}]:[]):[],
    score:{totals:score.totals,rows:score.rows,columns:score.columns,creatures:score.creatures,bonuses:score.breakdown?.bonuses??[0,0]},
    log:state.events.slice(-50).map(e=>({turn:e.turn,type:e.type,text:publicEventText(e)})),result:state.result};
}
