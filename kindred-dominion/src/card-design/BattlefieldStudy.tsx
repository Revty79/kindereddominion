import {useMemo,useState,type CSSProperties} from "react";
import {artworkMap} from "../assets/references";
import {SCORING_RULES} from "../engine/scoring";
import CollectibleCard from "./CollectibleCard";
import {battlefieldStudyScene} from "./battlefield-scene";
import "./battlefield.css";

export default function BattlefieldStudy({onInspect}:{onInspect:(id:string,context?:string)=>void}){
  const [scoring,setScoring]=useState<"classic"|"domination">("classic"),[selected,setSelected]=useState(2);
  const scene=useMemo(()=>battlefieldStudyScene(scoring),[scoring]),art=useMemo(()=>artworkMap(scene.content),[scene.content]),row=scene.score.rows[0];
  const ownerName=(owner:number)=>owner===0?"Jade":"Amber";
  const inspect=(col:number)=>{
    const cell=scene.row[col],instance=scene.state.cards[cell.creature!],card=scene.library[instance.definitionId],power=scene.powers[instance.id];
    const changes=[instance.modifier?`permanent change ${instance.modifier>0?"+":""}${instance.modifier}`:"",power.aura?`continuous power ${power.aura>0?"+":""}${power.aura}`:"",power.dynamic?`dynamic power ${power.dynamic>0?"+":""}${power.dynamic}`:""].filter(Boolean);
    setSelected(col);onInspect(card.id,`${ownerName(instance.owner)} · A${col+1} · Current power ${power.effective}; printed ${card.power}${changes.length?"; "+changes.join("; "):""}.`);
  };
  const selectedCard=scene.library[scene.state.cards[scene.row[selected].creature!].definitionId];
  return <section className="battle-study" aria-label="Played cards on battlefield tiles">
    <header className="battle-study-heading"><div><p className="battle-eyebrow">BATTLEFIELD / ROW A</p><h2>Cards on the field.</h2><p>Five occupied spaces. One evolved creature, one replacement and live power changes.</p></div><div className="battle-mode"><span>Scoring preview</span><div role="group" aria-label="Study scoring rules">{(["classic","domination"] as const).map(mode=><button key={mode} aria-pressed={scoring===mode} onClick={()=>setScoring(mode)}>{SCORING_RULES[mode].name}</button>)}</div></div></header>
    <div className="battle-row-ribbon" aria-label="Row A score"><span className="battle-row-label">A <small>ROW POWER</small></span><span className="jade-text">Jade <b>{row.powers[0]}</b></span><span className="battle-score-divider">/</span><span className="amber-text">Amber <b>{row.powers[1]}</b></span><span className="battle-row-result">{row.powers[0]===row.powers[1]?"Tied row":row.powers[0]>row.powers[1]?"Jade leads":"Amber leads"} · Row points {row.points[0]} / {row.points[1]}</span><span className="battle-total">Total points <b>{scene.score.totals[0]} : {scene.score.totals[1]}</b></span></div>
    <div className="battle-study-scroll" tabIndex={0} aria-label="Scrollable battlefield row"><div className="battle-study-row">{scene.row.map((cell,index)=>{
      const instance=scene.state.cards[cell.creature!],card=scene.library[instance.definitionId],power=scene.powers[instance.id],delta=power.effective-card.power,protections=[...new Set([...power.permanentProtections,...power.continuousProtections.map(p=>p.protection)])];
      return <div className={`battle-study-tile controller-${cell.owner} ${selected===index?"has-selected-card":""}`} key={cell.col} data-coordinate={`A${cell.col+1}`}>
        <header className="battle-tile-header" data-layer="gameplay"><span className="battle-coordinate">A{cell.col+1}</span><span className="battle-owner"><i aria-hidden="true"/> {ownerName(instance.owner)} {instance.owner===0?"→":"←"}</span><span className="battle-territory" title={`${cell.tokens} territory tokens; ${cell.fortification} fortification`}>● {cell.tokens} <span>⬡ {cell.fortification}</span></span></header>
        <div className="battle-card-rest"><button className={`battle-card-button ${selected===index?"is-selected":""}`} aria-label={`Select ${card.name} on A${cell.col+1}`} aria-pressed={selected===index} onClick={()=>setSelected(index)} onDoubleClick={()=>inspect(index)} style={{"--card-rotation":`${[-.65,.45,-.35,.65,-.45][index]}deg`} as CSSProperties}><CollectibleCard card={card} library={scene.library} artwork={art[card.id]} scale="battlefield"/></button>{selected===index&&<span className="battle-selected-marker">Selected</span>}{protections.length>0&&<span className="battle-protection" title={`Protected from ${protections.join(" and ")}`} aria-label={`Protected from ${protections.join(" and ")}`}>◇</span>}</div>
        <footer className="battle-tile-context" data-layer="gameplay"><span className="battle-current-power"><small>CURRENT</small><b>{power.effective}</b>{delta!==0&&<em>{delta>0?"+":""}{delta}</em>}</span><button className="battle-inspect-action" aria-label={`Inspect ${card.name} on A${cell.col+1}`} onClick={()=>inspect(index)}>Inspect ↗</button></footer>
        {scoring==="domination"&&<div className="battle-column-context">Column {cell.col+1}<span className="jade-text">{scene.score.columns[cell.col][0]}</span><span>/</span><span className="amber-text">{scene.score.columns[cell.col][1]}</span> creatures</div>}
      </div>;
    })}</div></div>
    <footer className="battle-study-notes"><p className="battle-selected-description" role="status"><b>{selectedCard.name}</b> selected. Double-click the card or choose Inspect to read its full face.</p><p>Printed power stays on the card. Current power, ownership and protection sit on the play space. Crystal Elemental's aura and Venus Flytrap's replacement growth are evaluated by the shared engine.</p></footer>
  </section>;
}
