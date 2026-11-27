// Presentation adapters consume exact, server-produced legal actions. No rules
// are inferred from tile ownership, rank, printed power or artwork here.
export type Placement = {card:string;row:number;col:number};
export type PlacementSource = {id:string;revision:number;status:string;active:number;legalActions:Placement[]};
export type PlacementPreviewRequest = {matchId:string;revision:number;action:Placement & {type:"play"}};
export type Point = {x:number;y:number};
export type Rect = {left:number;top:number;right:number;bottom:number};

export function placementRequest(source:PlacementSource,card:string,row:number,col:number):PlacementPreviewRequest|null {
  if(source.status!=="playing"||source.active!==0||!source.legalActions.some(a=>a.card===card&&a.row===row&&a.col===col))return null;
  return {matchId:source.id,revision:source.revision,action:{type:"play",card,row,col}};
}

export function adjacentTile(row:number,col:number,key:string,rows:number,cols:number){
  if(key==="ArrowLeft")col--;else if(key==="ArrowRight")col++;else if(key==="ArrowUp")row--;else if(key==="ArrowDown")row++;else if(key==="Home")col=0;else if(key==="End")col=cols-1;else return null;
  return {row:Math.max(0,Math.min(rows-1,row)),col:Math.max(0,Math.min(cols-1,col))};
}

/** Put the portrait beside the targeted tile, never over the pointer. Candidate
 * scoring also keeps it within the viewport, including near mobile edges. */
export function floatingPosition(point:Point,width:number,height:number,viewport:{width:number;height:number},target?:Rect,avoid:Rect[]=[]):Point {
  const area=target??{left:point.x-4,right:point.x+4,top:point.y-4,bottom:point.y+4},gap=14;
  const group=avoid.length?{left:Math.min(area.left,...avoid.map(r=>r.left)),right:Math.max(area.right,...avoid.map(r=>r.right)),top:Math.min(area.top,...avoid.map(r=>r.top)),bottom:Math.max(area.bottom,...avoid.map(r=>r.bottom))}:area;
  const candidates=[{x:group.right+gap,y:point.y-height*.7},{x:group.left-width-gap,y:point.y-height*.7},{x:point.x-width*.5,y:group.top-height-gap},{x:point.x-width*.5,y:group.bottom+gap},{x:area.right+gap,y:point.y-height*.7},{x:area.left-width-gap,y:point.y-height*.7},{x:point.x-width*.5,y:area.top-height-gap},{x:point.x-width*.5,y:area.bottom+gap}];
  const clamp=(v:number,max:number)=>Math.max(6,Math.min(Math.max(6,max-6),v));
  const scored=candidates.map(candidate=>{
    const x=clamp(candidate.x,viewport.width-width),y=clamp(candidate.y,viewport.height-height);
    const overlap=[area,...avoid].reduce((n,r)=>n+Math.max(0,Math.min(x+width,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+height,r.bottom)-Math.max(y,r.top)),0);
    const coversPointer=point.x>=x-10&&point.x<=x+width+10&&point.y>=y-10&&point.y<=y+height+10;
    return {x,y,score:overlap*100+(coversPointer?1e8:0)+Math.hypot(x-candidate.x,y-candidate.y)*10};
  });
  return scored.sort((a,b)=>a.score-b.score)[0];
}
