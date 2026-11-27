import {describe,it,expect} from "vitest";
import {placementRequest,floatingPosition,adjacentTile,type PlacementSource} from "../src/player/placement-input";
import {createMatch,act,legalPlays} from "../src/engine/game";
import {CARDS} from "../src/data/cards";
import {DECKS} from "../src/data/decks";
import {DEFAULT_CONFIG} from "../src/engine/config";

describe("authoritative placement presentation adapter",()=>{
  it("accepts only exact engine-produced instance/destination tuples without mutating the source",()=>{
    let state=createMatch([DECKS[0].cards,DECKS[1].cards],CARDS,DEFAULT_CONFIG,947,0);
    state=act(state,{type:"mulligan",player:0,cards:[]},CARDS);state=act(state,{type:"mulligan",player:1,cards:[]},CARDS);
    const legal=legalPlays(state,CARDS,0).filter(a=>a.type==="play"),source:PlacementSource={id:"saved",revision:7,status:state.phase,active:state.active,legalActions:legal},before=JSON.stringify(source);
    expect(legal.length).toBeGreaterThan(0);
    const move=legal[0];expect(placementRequest(source,move.card,move.row,move.col)).toEqual({matchId:"saved",revision:7,action:{type:"play",card:move.card,row:move.row,col:move.col}});
    expect(placementRequest(source,"different-instance",move.row,move.col)).toBeNull();expect(placementRequest(source,move.card,19,19)).toBeNull();expect(JSON.stringify(source)).toBe(before);
  });
  it.each(["mulligan","finished","fault"])("cannot select an apparently legal tuple during %s",status=>{expect(placementRequest({id:"x",revision:2,status,active:0,legalActions:[{card:"c",row:0,col:0}]},"c",0,0)).toBeNull();});
  it("rejects an opponent turn even if a stale list still contains the tuple",()=>{expect(placementRequest({id:"x",revision:2,status:"playing",active:1,legalActions:[{card:"c",row:0,col:0}]},"c",0,0)).toBeNull();});
  it("keeps the floating portrait outside the targeted tile and pointer at desktop and touch edges",()=>{
    for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}])for(const x of [8,viewport.width/2,viewport.width-65]){
      const point={x:x+25,y:100},target={left:x,top:50,right:x+55,bottom:180},width=viewport.width<700?92:128,height=width*4/3,pos=floatingPosition(point,width,height,viewport,target);
      expect(pos.x).toBeGreaterThanOrEqual(0);expect(pos.y).toBeGreaterThanOrEqual(0);expect(pos.x+width).toBeLessThanOrEqual(viewport.width);expect(pos.y+height).toBeLessThanOrEqual(viewport.height);
      expect(pos.x>=target.right||pos.x+width<=target.left||pos.y>=target.bottom||pos.y+height<=target.top).toBe(true);expect(point.x<pos.x||point.x>pos.x+width||point.y<pos.y||point.y>pos.y+height).toBe(true);
    }
  });
  it("navigates real tile coordinates without wrapping or inventing off-board destinations",()=>{
    expect(adjacentTile(0,0,"ArrowLeft",3,5)).toEqual({row:0,col:0});expect(adjacentTile(2,4,"ArrowDown",3,5)).toEqual({row:2,col:4});expect(adjacentTile(1,1,"End",3,5)).toEqual({row:1,col:4});expect(adjacentTile(1,3,"Home",3,5)).toEqual({row:1,col:0});expect(adjacentTile(0,0,"Enter",3,5)).toBeNull();
  });
});
