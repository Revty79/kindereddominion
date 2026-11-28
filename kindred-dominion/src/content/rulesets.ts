import type {GameConfig} from "../engine/types";
import type {Ruleset,RulesetVersion,Workspace} from "./types";
import {ID,validateRules} from "./validation";
export const sameRules=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
function canonical(value:unknown):string{return JSON.stringify(value,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export function validateRulesetVersion(value:RulesetVersion):void{
 if(!value||!ID.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1||!value.name?.trim()||value.name.length>10000||value.completion!=="twoPasses"||value.classification!=="private-testing"||!value.contentVersion||!Number.isFinite(Date.parse(value.publishedAt))||validateRules(value.config).some(i=>i.severity==="error"))throw Error("Invalid private tactical ruleset revision.");
}
export function publishRuleset(workspace:Workspace,rule:Ruleset,now=new Date().toISOString()):Workspace{
 if(!rule||!rule.name.trim()||validateRules(rule.config).some(i=>i.severity==="error"))throw Error("Correct the ruleset before publishing a private testing revision.");
 const prior=(workspace.rulesetVersions??[]).filter(v=>v.id===rule.id),latest=prior.at(-1);
 if(latest&&sameRules(latest.config,rule.config)&&latest.name===rule.name)throw Error("This exact ruleset is already the latest private testing revision.");
 const version:RulesetVersion={id:rule.id,revision:Math.max(0,...prior.map(v=>v.revision))+1,name:rule.name,config:structuredClone(rule.config),completion:rule.completion,publishedAt:now,contentVersion:workspace.working.id,classification:"private-testing"};
 validateRulesetVersion(version);return {...workspace,rulesetVersions:[...(workspace.rulesetVersions??[]),version]};
}
// Recovery/import may restore an older draft but cannot erase or rewrite its
// existing publication ledger. Both browser and protected server stores use this.
export function preserveRulesetVersions(previous:Workspace|null,next:Workspace):Workspace{
 const versions=structuredClone(previous?.rulesetVersions??[]);
 for(const value of next.rulesetVersions??[]){validateRulesetVersion(value);const old=versions.find(v=>v.id===value.id&&v.revision===value.revision);if(old&&!sameRules(old,value))throw Error("Published tactical ruleset revisions are immutable. Create a new revision.");if(!old)versions.push(structuredClone(value));}
 return versions.length?{...next,rulesetVersions:versions}:next;
}
export function matchingRuleset(versions:RulesetVersion[]|undefined,id:string,config:GameConfig){return [...(versions??[])].reverse().find(v=>v.id===id&&sameRules(v.config,config));}
