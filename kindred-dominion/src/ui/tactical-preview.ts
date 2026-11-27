import {cellAt,placementIssue,relative} from "../engine/game";
import {powerTable} from "../engine/evaluation";
import {scoreGame} from "../engine/scoring";
import {describeAbility,describeCondition} from "../engine/registry";
import type {CardLibrary,GameState,Player,Position} from "../engine/types";
import {actionPreview,type PublicChange} from "./readability";

export type EffectCategory="tokens"|"territory"|"fortification"|"power"|"destruction"|"protection"|"replacement"|"evolution"|"placement"|"resurrection"|"return"|"banish"|"sacrifice"|"aura"|"dynamic"|"conditional";
export const EFFECT_SYMBOLS:Record<EffectCategory,string>={tokens:"T",territory:"CAP",fortification:"F",power:"P",destruction:"X",protection:"SH",replacement:"R",evolution:"EV",placement:"PLAY",resurrection:"REV",return:"RET",banish:"EX",sacrifice:"SAC",aura:"A",dynamic:"D",conditional:"IF"};
export type TileValues={owner:Player|null;tokens:number;fortification:number;creature:{name:string;number:string;power:number;protections:string[]}|null};
export type TileEffect={category:EffectCategory;symbol:string;text:string;label:string};
export type TacticalTile=Position & {before:TileValues;after:TileValues;effects:TileEffect[];affected:boolean;pattern:boolean;influence:string[]};
export type PlacementDestination=Position & {legal:boolean;code:string;reason:string;kind:string};
export type TacticalPreview={schema:1;card:string;target:Position;complete:boolean;uncertainty:string|null;uncertaintyCode:string|null;fault:boolean;tiles:TacticalTile[];abilities:{source:string;ability:string;conditional:boolean;description:string;conditions:string[]}[];changes:PublicChange[];scoreBefore:[number,number];scoreAfter:[number,number];privateConsequencesOmitted:boolean};
const signed=(n:number)=>n>0?`+${n}`:String(n);
export const effectCategory=(change:PublicChange):EffectCategory=>change.kind==="departure"?({DEST:"destruction",SAC:"sacrifice",RETURN:"return",BANISH:"banish",EVO:"evolution"} as const)[change.label as "DEST"]??"destruction":change.kind==="arrival"?({EVO:"evolution",REPLACE:"replacement",REVIVE:"resurrection"} as const)[change.label as "EVO"]??"placement":change.kind;

export function placementDestinations(state:GameState,library:CardLibrary,player:Player,card:string):PlacementDestination[]{
  const definition=library[state.cards[card]?.definitionId];
  return state.board.map(cell=>{const issue=placementIssue(state,library,player,card,cell.row,cell.col),host=cell.creature?library[state.cards[cell.creature].definitionId].name:"";return {row:cell.row,col:cell.col,legal:!issue,code:issue?.code??"legal",kind:definition?.type??"unavailable",reason:issue?.message??(definition.type==="evolution"?`Valid evolution target: ${host}.`:definition.type==="replacement"?`Valid replacement target: ${host}.`:"Legal placement.")};});
}

// Public definition analysis is a privacy barrier, never a rules evaluator.
// A private-history-dependent branch is explicitly uncertain, not guessed.
function privateDependency(state:GameState,library:CardLibrary,card:string):boolean{
  const ids=[state.cards[card]?.definitionId,...state.board.flatMap(c=>c.creature?[state.cards[c.creature].definitionId]:[]),...state.players.flatMap(p=>p.graveyard.map(id=>state.cards[id].definitionId))],seen=new Set<string>();
  function hidden(value:unknown):boolean{if(!value||typeof value!=="object")return false;const node=value as any;if(node.kind==="history"&&["drawn","generated"].includes(node.event)||["drawn","generated"].includes(node.trigger))return true;return Object.values(node).some(hidden);}
  while(ids.length){const id=ids.pop();if(!id||seen.has(id))continue;seen.add(id);const def=library[id];if(!def)continue;if(hidden(def))return true;for(const ability of def.abilities)for(const effect of ability.effects)if(["summon","replace","evolve"].includes(effect.type)&&"card"in effect)ids.push(effect.card);}
  return false;
}

export function tacticalPreview(before:GameState,library:CardLibrary,player:Player,card:string,row:number,col:number):TacticalPreview{
  const invalid=placementIssue(before,library,player,card,row,col);if(invalid)throw Error(invalid.message);
  const limited=JSON.stringify(before).length>1_000_000,privateBranch=privateDependency(before,library,card);
  const resolved=limited||privateBranch?null:actionPreview(before,{type:"play",player,card,row,col},library,{automatic:true,bounded:true});
  const after=resolved?.state??before,steps=resolved?.steps??[],changes=resolved?.changes??[],oldPowers=powerTable(before,library),newPowers=powerTable(after,library);
  const reasons:Record<string,string>={"before-private-draw":"A private draw and any resulting abilities resolve after placement. No drawn card or later outcome is predicted.","before-private-generate":"Cards generated into a hand and subsequent abilities resolve after placement.","before-random":"Random target selection and all dependent effects resolve after placement. No random outcome is predicted.",budget:"This ability chain cannot be fully previewed. Known effects are shown; remaining effects resolve after placement."};
  const uncertainty=privateBranch?"An ability depends on private draw or generation history. Its outcome is hidden until placement; no private condition is tested here.":limited?"This complex saved position cannot be fully previewed. The public pattern is shown; effects resolve after placement.":reasons[resolved?.boundary??""]??null;
  const pattern=new Map<string,string[]>(),definition=library[before.cards[card].definitionId];
  for(const influence of definition.influence){const point=relative({row,col},influence.x,influence.y,player);if(!cellAt(before,point.row,point.col))continue;const key=`${point.row}:${point.col}`,list=pattern.get(key)??[];list.push(`${influence.mechanic} ${influence.amount}`);pattern.set(key,list);}
  function values(state:GameState,powers:ReturnType<typeof powerTable>,r:number,c:number):TileValues{const cell=cellAt(state,r,c)!,id=cell.creature,def=id?library[state.cards[id].definitionId]:null,power=id?powers[id]:null;return {owner:cell.owner,tokens:cell.tokens,fortification:cell.fortification,creature:def&&power?{name:def.name,number:def.collectible?.number??def.id,power:power.effective,protections:[...new Set([...power.permanentProtections,...power.continuousProtections.map(p=>p.protection)])].sort()}:null};}
  const tiles=before.board.flatMap(cell=>{
    const local=changes.filter(change=>change.row===cell.row&&change.col===cell.col),a=values(before,oldPowers,cell.row,cell.col),b=values(after,newPowers,cell.row,cell.col),influence=pattern.get(`${cell.row}:${cell.col}`)??[],effects:TileEffect[]=[];
    const add=(kind:EffectCategory,label:string,text:string)=>effects.push({category:kind,symbol:EFFECT_SYMBOLS[kind],label,text});
    if(a.tokens!==b.tokens)add("tokens",`T${signed(b.tokens-a.tokens)}`,`Preview tokens ${a.tokens} to ${b.tokens} (${signed(b.tokens-a.tokens)}).`);
    if(a.fortification!==b.fortification)add("fortification",`F${signed(b.fortification-a.fortification)}`,`Preview fortification ${a.fortification} to ${b.fortification}.`);
    if(a.owner!==b.owner)add("territory","CAP",`Preview territory ${a.owner===null?"neutral":a.owner===0?"Jade":"Amber"} to ${b.owner===0?"Jade":"Amber"}.`);
    const oldId=cell.creature,newId=cellAt(after,cell.row,cell.col)!.creature;
    if(a.creature&&b.creature&&oldId===newId&&a.creature.power!==b.creature.power)add("power",`P${signed(b.creature.power-a.creature.power)}`,`Preview ${b.creature.name} power ${a.creature.power} to ${b.creature.power}.`);
    for(const change of local){const kind=effectCategory(change);if(["tokens","fortification","territory","power"].includes(kind))continue;if(!effects.some(e=>e.category===kind))add(kind,EFFECT_SYMBOLS[kind],change.text);}
    if(newId&&newId!==oldId&&b.creature){const printed=library[after.cards[newId].definitionId].power;add("power",printed===b.creature.power?`P${b.creature.power}`:`P${printed}→${b.creature.power}`,`Preview arrival: ${b.creature.name} at power ${b.creature.power}; printed ${printed}, change ${signed(b.creature.power-printed)}.`);if(b.creature.protections.length)add("protection","SH",`Preview ${b.creature.name}: protected from ${b.creature.protections.join(" and ")}.`);}
    if(!local.length&&!influence.length&&!(cell.row===row&&cell.col===col))return [];
    return [{row:cell.row,col:cell.col,before:a,after:b,effects,affected:local.length>0,pattern:influence.length>0,influence}];
  });
  const visible=new Set([card,...before.board.flatMap(c=>c.creature?[c.creature]:[]),...after.board.flatMap(c=>c.creature?[c.creature]:[]),...before.players.flatMap(p=>p.graveyard)]),abilities:TacticalPreview["abilities"]=[];let current:TacticalPreview["abilities"][number]|null=null;
  for(const step of steps){const d=step.details as any;if(step.kind==="trigger"&&visible.has(d?.source?.id)){const def=library[(before.cards[d.source.id]??after.cards[d.source.id]).definitionId];current={source:def.name,ability:d.ability.id,conditional:!!d.ability.condition,description:describeAbility(d.ability),conditions:[]};abilities.push(current);}else if(current&&["condition","limit","blocked","safeguard"].includes(step.kind)){const condition=d?.condition?describeCondition(d.condition):"";current.conditions.push(`${step.message}${condition?` ${condition}`:""}`);}}
  return {schema:1,card,target:{row,col},complete:!uncertainty&&!resolved?.fault,uncertainty,uncertaintyCode:uncertainty?(privateBranch?"private-history":limited?"budget":resolved?.boundary??"budget"):null,fault:!!resolved?.fault,tiles,abilities,changes,scoreBefore:scoreGame(before,library).totals,scoreAfter:scoreGame(after,library).totals,privateConsequencesOmitted:!!uncertainty};
}
