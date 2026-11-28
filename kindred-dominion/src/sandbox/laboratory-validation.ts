import type {Scenario} from "../content/types";
import {createMatch,act} from "../engine/game";
import {libraryOf} from "../content/validation";
import {sameRules,validateRulesetVersion} from "../content/rulesets";
export function validateLaboratory(scenario:Scenario):void{
 const m=scenario.laboratory;if(m===undefined)return;
 if(!m||typeof m!=="object"||Array.isArray(m))throw Error("Invalid laboratory metadata."); // Historical scenarios retain artificial/unknown provenance.
 if(!["artificial","production-representative"].includes(m.classification)||!["manual","computer"].includes(m.opponent)||!Number.isSafeInteger(m.seed)||m.seed<0||m.seed>4294967295||m.seed!==scenario.state.seed||typeof m.reference!=="string"||m.reference.length>10000||(!m.contentRevision||m.contentRevision.id!==scenario.content.id||m.contentRevision.createdAt!==scenario.content.createdAt||m.contentRevision.engineVersion!==scenario.content.engineVersion||m.contentRevision.workspaceRevision!==undefined&&(!Number.isSafeInteger(m.contentRevision.workspaceRevision)||m.contentRevision.workspaceRevision<0)))throw Error("Invalid laboratory classification, seed or content revision.");
 if(m.ruleset!==undefined){validateRulesetVersion(m.ruleset);if(!sameRules(m.ruleset.config,scenario.state.config))throw Error("Scenario configuration differs from its pinned tactical revision.");}
 if(m.intendedAction!==undefined){if(!m.intendedAction||typeof m.intendedAction!=="object"||Array.isArray(m.intendedAction))throw Error("Invalid intended action.");const a=m.intendedAction;if(![0,1].includes(a.player)||!["play","pass","surrender","mulligan"].includes(a.type))throw Error("Invalid intended action.");act(scenario.state,a,libraryOf(scenario.content));}
 if(m.expected!==undefined){if(!m.expected||typeof m.expected!=="object"||Array.isArray(m.expected))throw Error("Expected assertions must be an object.");if(Object.keys(m.expected).some(k=>!["stateSignature","totals","phase"].includes(k))||m.expected.stateSignature!==undefined&&!/^[a-f0-9]{8}$/.test(m.expected.stateSignature)||m.expected.totals!==undefined&&(!Array.isArray(m.expected.totals)||m.expected.totals.length!==2||m.expected.totals.some(n=>!Number.isSafeInteger(n)))||m.expected.phase!==undefined&&!["mulligan","playing","finished","fault"].includes(m.expected.phase))throw Error("Invalid expected regression result.");if(!m.intendedAction)throw Error("An expected result requires an intended action.");}
 if(m.classification==="production-representative"){
  if(!m.ruleset||!m.decks||m.decks.length!==2)throw Error("A representative scenario needs a published private ruleset and two valid decks.");
  const initial=createMatch(m.decks,libraryOf(scenario.content),scenario.state.config,m.seed,scenario.state.startingPlayer);
  if(!sameRules(initial,scenario.state))throw Error("Constructed or modified states must be classified as artificial debugging fixtures.");
 }
}
