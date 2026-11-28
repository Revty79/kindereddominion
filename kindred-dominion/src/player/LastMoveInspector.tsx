import type {CardLibrary} from "../engine/types";
import type {VisibleCreature} from "../ui/resolution-presentation";
import CollectibleCard from "../ui/cards/CollectibleCard";
import type {useLastMove} from "./useLastMove";
import {useEffect,useRef} from "react";
import "./history.css";
const coordinate=(p:{row:number;col:number})=>`${String.fromCharCode(65+p.row)}${p.col+1}`;
const owner=(n:number|null)=>n===null?"Neutral":n===0?"Jade":"Amber";
export default function LastMoveInspector({inspection,library,art,onInspect,viewer=0}:{viewer?:number;inspection:ReturnType<typeof useLastMove>;library:CardLibrary;art:Record<string,any>;onInspect:(card:VisibleCreature)=>void}){
  const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[]);
  const {move,events,event,index,playing,history}=inspection,card=events.find(e=>e.card)?.card,definition=card?library[card.definitionId]:null,initial=events[0]?.before,final=events.at(-1)?.after;
  const positions=new Map<string,{row:number;col:number}>();for(const e of events){if(e.target)positions.set(coordinate(e.target),e.target);for(const fx of e.effects)positions.set(coordinate(fx),fx);}
  return <section className="last-move-inspector" aria-label="Last Move inspection"><h2 ref={heading} tabIndex={-1}>Historical move — not live</h2><p>The battlefield shows recorded public information. Current gameplay continues independently.</p>
    {inspection.loading&&<p role="status">Loading recorded move...</p>}{inspection.message&&<p role="status">{inspection.message}</p>}
    <div className="button-row" aria-label="Choose recent move">{history?.moves.map(m=><button key={m.id} aria-pressed={move?.id===m.id} onClick={()=>inspection.choose(m.id)}>{m.actor===viewer?"Your move":"Opponent move"}</button>)}</div>
    {move&&<><div className="last-move-card" data-player-origin={move.actor===viewer||undefined} title="Representative historical hand origin; no old hand position is inferred">{definition&&card&&<button className="historical-card-inspect" aria-label={`Enlarge recorded ${card.name}`} onClick={()=>{inspection.stop();onInspect(card);}}><CollectibleCard card={definition} library={library} artwork={art[definition.id]} scale="hand" player={move.actor}/></button>}<div><h3>{owner(move.actor)} · {card?.name??(move.type==="pass"?"Passed":move.type==="surrender"?"Conceded":move.type==="mulligan"?"Opening hand prepared":"Accepted move")}</h3>{card&&<p>{card.number} · {card.placementType} · Printed power {card.printedPower}</p>}{events.find(e=>e.target)?.target&&<p>Placed on {coordinate(events.find(e=>e.target)!.target!)}.</p>}<p>{initial?`Recorded turn ${initial.turn}.`:"Recent accepted action."}</p></div></div>{card&&<details><summary>Played card information</summary><p>{card.text}</p></details>}
      {!events.length?<p>{move.reason??"Compatible detailed presentation is unavailable. No historical effects have been guessed."}</p>:<>
        <div className="button-row"><button onClick={inspection.replay}>Replay move from beginning</button><button disabled={!playing} onClick={inspection.stop}>Stop replay</button><button disabled={index===0} onClick={()=>inspection.step(-1)}>Previous step</button><button disabled={index===events.length-1} onClick={()=>inspection.step(1)}>Next step</button></div>
        <p className="historical-step" role="status">{playing?"Replaying":"Inspecting"} step {index+1} of {events.length}: {event?.caption}</p>
        {!playing&&index===0&&<p>Use Next step to follow the recorded sequence, or Final result to jump to its outcome.</p>}
        {event?.effects.map((effect,i)=><p key={i}><b>{effect.symbol}</b> {effect.text}</p>)}
        {initial&&final&&<><p>Recorded score: Jade {initial.score.totals[0]} → {final.score.totals[0]} · Amber {initial.score.totals[1]} → {final.score.totals[1]}.</p><details><summary>Move before and after</summary><table><thead><tr><th>Tile</th><th>Before</th><th>After</th></tr></thead><tbody>{[...positions.values()].map(p=>{const a=initial.board.find(c=>c.row===p.row&&c.col===p.col)!,b=final.board.find(c=>c.row===p.row&&c.col===p.col)!;return <tr key={coordinate(p)}><th>{coordinate(p)}</th><td>{owner(a.owner)} · T{a.tokens} F{a.fortification}<br/>{a.creature?`${a.creature.name} · P${a.creature.power}`:"Empty"}</td><td>{owner(b.owner)} · T{b.tokens} F{b.fortification}<br/>{b.creature?`${b.creature.name} · P${b.creature.power}`:"Empty"}</td></tr>;})}</tbody></table></details></>}
        <details><summary>Recorded effect sequence</summary><ol>{events.filter(e=>!["select","move"].includes(e.kind)).map(e=><li key={e.id}>{e.caption}</li>)}</ol></details>
      </>}
    </>}
  </section>;
}
