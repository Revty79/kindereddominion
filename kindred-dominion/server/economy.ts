import crypto from "node:crypto";
import type {BackendConfig} from "./config";
import type {DB} from "./db";
import {activeContent} from "./catalog";
import {inventoryTransaction} from "./inventory";
import {reject} from "./errors";
import {selectedConfiguration,economyPermitted,requireEconomy} from "./configuration";
import {assetEnvironment,lockPlayer,moveCurrency,type Client,type AssetOrigin} from "./economy-assets";
import {economySchema,bundleSchema,levelAt,scaleReward,allocateMastery,objectivePeriod,type EconomyRules,type RewardBundle} from "./economy-rules";
import {replayAt,signature,validateRecord,type MatchRecord} from "../src/replay/record";
import {economyDigest} from "./economy-hash";
import {requireRewardEntitlements,fulfillRewardEntitlement,type RewardEntitlement} from "./reward-entitlements";
export type EconomyVersion={id:string;rules:EconomyRules};
export async function currentEconomy(c:DB|Client,config:BackendConfig):Promise<EconomyVersion|null>{
  if(!economyPermitted(config))return null;
  const row=await selectedConfiguration(c,"economy");return row&&row.document.enabled?{id:row.id,rules:economySchema.parse(row.document)}:null;
}
async function version(c:Client,id:string):Promise<EconomyVersion>{const row=(await c.query("SELECT document FROM kd.configuration_version WHERE id=$1 AND domain='economy'",[id])).rows[0];if(!row)reject(503,"reward_version_missing","The historical reward configuration is unavailable.");return {id,rules:economySchema.parse(row.document)};}
export async function enrollEconomyMatch(c:Client,matchId:string,config:BackendConfig){const active=await currentEconomy(c,config);if(active)await c.query("INSERT INTO kd.economy_match_context(match_id,config_version) VALUES($1,$2)",[matchId,active.id]);}
type GrantOptions={origin?:"earned"|"promotional"|"administrator"|"sandbox"|"purchased";cardOrigin?:AssetOrigin;actorId?:string;mastery?:Record<string,number>;referenceId?:string;reason?:string};
export async function grantReward(c:Client,playerId:string,source:string,sourceId:string,value:RewardBundle,active:EconomyVersion,options:GrantOptions={}){
  await lockPlayer(c,playerId);
  const bundle=bundleSchema.parse(value),prior=(await c.query("SELECT * FROM kd.reward_grant WHERE player_id=$1 AND source=$2 AND source_id=$3",[playerId,source,sourceId])).rows[0];
  const fingerprint=economyDigest({bundle,options});
  if(prior){if(fingerprint!==prior.result.fingerprint)reject(409,"idempotency_conflict","This reward source was already settled with different terms.");return {...prior.result,replayed:true};}
  requireRewardEntitlements(bundle.entitlements);
  const id=crypto.randomUUID(),money=await moveCurrency(c,playerId,"reward:"+id,bundle.currencies,{type:"reward",reason:options.reason??source,origin:options.origin??"earned",configVersion:active.id,referenceId:options.referenceId??sourceId,actorId:options.actorId},active.rules);
  const levels:{axis:string;level:number}[]=[],xpChanges:Record<string,number>={};
  const xp=async(axis:string,amount:number)=>{
    if(!amount)return;if(!Number.isSafeInteger(amount)||amount<0)reject(400,"invalid_xp","XP requires positive integer units.");
    await c.query("INSERT INTO kd.xp_balance(player_id,axis) VALUES($1,$2) ON CONFLICT DO NOTHING",[playerId,axis]);
    const previous=(await c.query("SELECT * FROM kd.xp_balance WHERE player_id=$1 AND axis=$2 FOR UPDATE",[playerId,axis])).rows[0],total=Number(previous.xp)+amount,curve=axis==="account"?active.rules.accountLevels:active.rules.masteryLevels;
    if(!Number.isSafeInteger(total))reject(400,"xp_limit","XP exceeds the supported accounting range.");const level=Math.max(previous.level,levelAt(total,curve).level);
    await c.query("UPDATE kd.xp_balance SET xp=$3,level=$4 WHERE player_id=$1 AND axis=$2",[playerId,axis,total,level]);
    await c.query("INSERT INTO kd.xp_entry(transaction_id,player_id,axis,amount,resulting_xp,config_version) VALUES($1,$2,$3,$4,$5,$6)",[money.id,playerId,axis,amount,total,active.id]);
    xpChanges[axis]=amount;
    for(let n=previous.level+1;n<=level;n++){const claimed=await c.query("INSERT INTO kd.level_reward(player_id,axis,level,config_version,transaction_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[playerId,axis,n,active.id,money.id]);if(claimed.rowCount)levels.push({axis,level:n});}
  };
  await xp("account",bundle.xp);
  const mastery=options.mastery??{};if(Object.values(mastery).reduce((a,b)=>a+b,0)!==bundle.mastery)reject(400,"mastery_budget","Mastery allocations must exactly match their shared budget.");
  for(const [kindred,amount]of Object.entries(mastery).sort(([a],[b])=>a.localeCompare(b)))await xp("kindred:"+kindred,amount);
  const cards:string[]=[],acquisitions:string[]=[],newCards:string[]=[];
  if(bundle.cards.length){
    const pack=await activeContent(c),lifetime=new Set((await c.query("SELECT card_id FROM kd.lifetime_card WHERE player_id=$1",[playerId])).rows.map(r=>r.card_id));
    for(let i=0;i<bundle.cards.length;i++){const definition=bundle.cards[i],changes=new Map<string,number>(),pool=pack.cards.filter(card=>card.collectible&&(definition.cardId?card.id===definition.cardId:card.kindred===definition.kindred)).sort((a,b)=>a.id.localeCompare(b.id));if(!pool.length)reject(503,"reward_card_unavailable","A reward's published card pool is unavailable.");
      const selected=definition.mode==="first_copy"?pool.filter(card=>!lifetime.has(card.id)).slice(0,definition.cardId?1:definition.quantity):pool.slice(0,1);
      for(const card of selected){const edition=`${card.collectible!.gameplayId}:${card.collectible!.edition}`,quantity=definition.mode==="first_copy"?1:definition.quantity;changes.set(edition,(changes.get(edition)??0)+quantity);if(!lifetime.has(card.id))newCards.push(card.id);lifetime.add(card.id);cards.push(card.id);}
      if(changes.size){const acquisition=await inventoryTransaction(c,playerId,`reward:${id}:${i}`,"reward:"+source,[...changes].map(([editionId,quantity])=>({editionId,quantity})),options.actorId??null,{origin:options.cardOrigin??(definition.mode==="first_copy"?"first_copy":source==="level"?"mastery":"achievement"),tradeable:definition.mode==="additional"&&definition.tradeable&&options.origin!=="administrator"&&options.origin!=="sandbox",sandbox:options.origin==="sandbox",configVersion:active.id,sourceReference:options.referenceId??id});acquisitions.push(acquisition.id);}
    }
  }
  const entitlements:RewardEntitlement[]=bundle.entitlements.map(e=>({entitlementId:crypto.randomUUID(),type:e.type,definitionId:e.id,quantity:e.quantity,...(e.allocationId?{allocationId:e.allocationId}: {})}));
  const result={id,fingerprint,transactionId:money.id,currencies:bundle.currencies,xp:xpChanges,cards,acquisitionIds:acquisitions,entitlements,source,sourceId,configVersion:active.id};
  await c.query("INSERT INTO kd.reward_grant(id,player_id,source,source_id,config_version,bundle,transaction_id,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,playerId,source,sourceId,active.id,bundle,money.id,result]);
  for(const entitlement of entitlements){const context={economyVersion:active.id,origin:options.origin??"earned",cardOrigin:options.cardOrigin??(source==="level"?"mastery":"achievement"),actorId:options.actorId,referenceId:options.referenceId??id};await c.query("INSERT INTO kd.reward_entitlement(id,player_id,type,definition_id,quantity,reward_id,allocation_id,fulfillment_context) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[entitlement.entitlementId,playerId,entitlement.type,entitlement.definitionId,entitlement.quantity,id,entitlement.allocationId??null,context]);await fulfillRewardEntitlement(c,playerId,entitlement,context);}

  if(newCards.length&&options.origin!=="administrator"&&options.origin!=="sandbox")await economyEvent(c,playerId,"unique_card",`reward:${id}`,newCards.length,{matchId:options.referenceId},active);
  for(const entry of levels){const curve=entry.axis==="account"?active.rules.accountLevels:active.rules.masteryLevels;await grantReward(c,playerId,"level",`${entry.axis}:${entry.level}`,curve[entry.level-1].reward,active,{...options,mastery:{},cardOrigin:entry.axis==="account"?"achievement":"mastery"});if(options.origin!=="administrator"&&options.origin!=="sandbox")await economyEvent(c,playerId,entry.axis==="account"?"account_level":"mastery_level",`level:${entry.axis}:${entry.level}`,1,{kindreds:entry.axis==="account"?[]:[entry.axis.slice(8)],matchId:options.referenceId},active);}
  return {...result,replayed:false};
}
export async function claimObjective(c:Client,playerId:string,id:string,referenceId?:string){
  await lockPlayer(c,playerId);const row=(await c.query("SELECT * FROM kd.objective_progress WHERE id=$1 AND player_id=$2 FOR UPDATE",[id,playerId])).rows[0];if(!row)reject(404,"objective_missing","Objective was not found.");
  if(row.claimed_at)return {...(await c.query("SELECT result FROM kd.reward_grant WHERE id=$1",[row.reward_id])).rows[0].result,replayed:true};
  if(!row.completed_at)reject(409,"objective_incomplete","Complete the objective before claiming its reward.");
  const now=(await c.query("SELECT now() AS value")).rows[0].value;if(row.claim_until&&new Date(row.claim_until)<now)reject(409,"claim_expired","This objective's disclosed claim window has ended.");
  const active=await version(c,row.config_version),mastery=row.definition.reward.mastery?{[row.definition.kindred]:row.definition.reward.mastery}:{};
  const result=await grantReward(c,playerId,"objective",`${row.objective_id}:${row.period_key}`,row.definition.reward,active,{mastery,referenceId});
  await c.query("UPDATE kd.objective_progress SET claimed_at=now(),reward_id=$2 WHERE id=$1",[id,result.id]);return result;
}
export async function objectiveWindows(c:DB|Client,playerId:string,active:EconomyVersion,now:Date){
  const player=(await c.query("SELECT created_at FROM kd.player WHERE id=$1",[playerId])).rows[0];
  const starts=(await c.query("WITH configs AS MATERIALIZED(SELECT * FROM kd.configuration_version WHERE domain='economy') SELECT o->>'id' AS id,min(v.created_at) AS started FROM configs v CROSS JOIN LATERAL jsonb_array_elements(v.document->'objectives') o WHERE (v.document->>'enabled')::boolean AND (o->>'enabled')::boolean GROUP BY o->>'id'")).rows;
  const result:{definition:EconomyRules["objectives"][number];period:ReturnType<typeof objectivePeriod>}[]=[];
  for(const definition of active.rules.objectives.filter(o=>o.enabled)){
    const earliest=Math.max(new Date(player.created_at).getTime(),new Date(starts.find(r=>r.id===definition.id)?.started??now).getTime());
    const offsets=definition.period==="daily"?Array.from({length:active.rules.dailyGraceDays+1},(_,i)=>i):definition.period==="weekly"?[0,7]:[0];
    for(const days of offsets){const date=new Date(now.getTime()-days*86400000),period=objectivePeriod(definition.period,date,active.rules.dailyGraceDays);if(period.end&&new Date(period.end).getTime()<=earliest||period.claimUntil&&new Date(period.claimUntil)<=now)continue;result.push({definition,period});}
  }
  return result;
}
export async function economyEvent(c:Client,playerId:string,type:string,key:string,amount:number,evidence:{kindreds?:string[];difficulty?:string;matchId?:string},active:EconomyVersion){
  if(amount<=0)return;
  await lockPlayer(c,playerId);const account=(await c.query("SELECT sandbox,rewards_restricted FROM kd.economy_account WHERE player_id=$1",[playerId])).rows[0];if(account.sandbox||account.rewards_restricted)return;
  const event=await c.query("INSERT INTO kd.economy_event(id,player_id,event_key,type,evidence,config_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING occurred_at",[crypto.randomUUID(),playerId,key,type,{...evidence,amount},active.id]);if(!event.rowCount)return;
  const now=new Date(event.rows[0].occurred_at);
  for(const {definition,period}of (await objectiveWindows(c,playerId,active,now)).filter(x=>x.definition.event===type))await c.query("INSERT INTO kd.objective_progress(id,player_id,objective_id,period_key,config_version,definition,claim_until) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",[crypto.randomUUID(),playerId,definition.id,period.key,active.id,definition,period.claimUntil]);
  const candidates=(await c.query("SELECT * FROM kd.objective_progress WHERE player_id=$1 AND definition->>'event'=$2 AND completed_at IS NULL AND (claim_until IS NULL OR claim_until>$3) ORDER BY objective_id,period_key FOR UPDATE",[playerId,type,now])).rows;
  const remaining=new Map<string,number>();
  for(const row of candidates){
    // One event's units are consumed oldest-first; grace periods never multiply
    // the same match into several daily rewards.
    const pinned=row.definition,left=remaining.get(row.objective_id)??amount;if(left<=0||pinned.kindred&&!evidence.kindreds?.includes(pinned.kindred)||pinned.difficulty&&pinned.difficulty!==evidence.difficulty)continue;
    const distinct=[...new Set([...(row.distinct_values??[]),...(evidence.kindreds??[])])],progress=Math.min(pinned.target,pinned.aggregation==="distinct_kindreds"?distinct.length:Number(row.progress)+left);
    remaining.set(row.objective_id,pinned.aggregation==="distinct_kindreds"?0:left-(progress-Number(row.progress)));
    await c.query("UPDATE kd.objective_progress SET progress=$2,distinct_values=$3,completed_at=CASE WHEN $2>=(definition->>'target')::bigint THEN now() ELSE NULL END,updated_at=now() WHERE id=$1",[row.id,progress,JSON.stringify(distinct)]);
    if(progress>=pinned.target&&pinned.claimAutomatically)await claimObjective(c,playerId,row.id,evidence.matchId);
  }
  if(type!=="tutorial_completed"){
    const ids=(await c.query("SELECT objective_id FROM kd.objective_progress WHERE player_id=$1 AND completed_at IS NOT NULL AND objective_id=ANY($2)",[playerId,["intro-guide","intro-collection","intro-deck","intro-match"]])).rows.map(r=>r.objective_id);
    if(new Set(ids).size===4)await economyEvent(c,playerId,"tutorial_completed","tutorial:v1",1,{matchId:evidence.matchId},active);
  }
}
export async function onboardingEconomy(c:Client,playerId:string,config:BackendConfig){const active=await currentEconomy(c,config);if(active)await economyEvent(c,playerId,"account_created","account-created",1,{},active);}
export async function activityEconomy(c:Client,playerId:string,type:"deck_saved"|"collection_viewed"|"guide_viewed",key:string,config:BackendConfig){const active=await currentEconomy(c,config);if(active)await economyEvent(c,playerId,type,type==="deck_saved"?key:"acknowledgement:"+type,1,{},active);}
export async function settleMatchReward(c:Client,matchId:string,config:BackendConfig){
  if(!economyPermitted(config))return null;
  const row=(await c.query("SELECT m.*,e.config_version FROM kd.match m LEFT JOIN kd.economy_match_context e ON e.match_id=m.id WHERE m.id=$1 FOR UPDATE OF m",[matchId])).rows[0];if(!row)return null;
  await lockPlayer(c,row.player_id);const previous=(await c.query("SELECT * FROM kd.match_reward WHERE match_id=$1",[matchId])).rows[0];if(previous&&previous.status!=="pending")return previous;
  const account=(await c.query("SELECT * FROM kd.economy_account WHERE player_id=$1",[row.player_id])).rows[0];
  let reason="eligible",status="granted",reward:any=null,evidence:any={difficulty:"normal"};const active=row.config_version?await version(c,row.config_version):null;
  if(active)evidence.currencyNames=Object.fromEntries(active.rules.currencies.map(currency=>[currency.id,currency.name]));
  if(!active)reason="not_enrolled_no_retroactive_rewards";else if(account.sandbox||account.rewards_restricted||row.testing_access)reason="sandbox_or_restricted";else if(row.status!=="finished"||row.state.phase!=="finished"||row.opponent_type!=="computer")reason="not_an_eligible_completion";
  let state:any=row.state,participation:Record<string,number>={};
  if(reason==="eligible"){
    try{validateRecord(row.record);state=replayAt(row.record,row.record.actions.length).state;if(signature(state)!==signature(row.state)||state.phase!=="finished"||!state.result)reason="invalid_authoritative_replay";}catch{reason="invalid_authoritative_replay";}
  }
  if(reason==="eligible"&&active){
    const human=(row.record as MatchRecord).actions.filter(entry=>entry.action.player===0&&entry.action.type==="play");
    for(const entry of human){if(entry.action.type!=="play")continue;const card=state.cards[entry.action.card]??row.record.initialState.cards[entry.action.card],kindred=card?row.record.library[card.definitionId]?.kindred:null;if(kindred)participation[kindred]=(participation[kindred]??0)+1;}
    const seconds=(new Date(row.completed_at).getTime()-new Date(row.created_at).getTime())/1000,forfeit=state.result.reason==="surrender";
    evidence={...evidence,humanPlacements:human.length,elapsedSeconds:Math.max(0,seconds),forfeit,kindreds:Object.keys(participation)};
    if(seconds<Math.max(active.rules.match.minSeconds,forfeit?active.rules.match.forfeitMinSeconds:0)||human.length<Math.max(active.rules.match.minPlacements,forfeit?active.rules.match.forfeitMinPlacements:0))reason="insufficient_participation";
    const daily=(await c.query("SELECT count(*)::int AS count,max(created_at) AS last,now() AS clock FROM kd.match_reward WHERE player_id=$1 AND status='granted' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",[row.player_id])).rows[0];
    if(reason==="eligible"&&daily.count>=active.rules.match.dailyLimit)reason="daily_reward_limit";
    if(reason==="eligible"&&daily.last&&new Date(daily.clock).getTime()-new Date(daily.last).getTime()<active.rules.match.cooldownSeconds*1000)reason="reward_cooldown";
    if(reason==="eligible"){
      const multiplier=daily.count>=active.rules.match.diminishAfter?active.rules.match.diminishBasisPoints:10000,outcome:"win"|"draw"|"loss"=state.result.winner===0?"win":state.result.winner===null?"draw":"loss",amount=(n:number)=>scaleReward(n,multiplier),mastery=Object.keys(participation).length?amount(active.rules.match.mastery):0;
      evidence={...evidence,outcome,multiplierBasisPoints:multiplier};
      reward=await grantReward(c,row.player_id,"match",row.id,{currencies:{gold:amount(active.rules.match.normal[outcome])},xp:amount(active.rules.match.xp[outcome]),mastery,cards:[],entitlements:[]},active,{mastery:allocateMastery(mastery,participation),referenceId:row.id});
      for(const [type,n]of [["match_completed",1],["match_won",outcome==="win"?1:0],["placement",human.length],["evolution",state.events.filter((e:any)=>e.type==="evolution"&&e.player===0).length],["ability_used",state.events.filter((e:any)=>e.type==="ability"&&e.player===0).length]] as const)await economyEvent(c,row.player_id,type,`match:${row.id}:${type}`,n,{kindreds:Object.keys(participation),difficulty:"normal",matchId:row.id},active);
      evidence.rewards=(await c.query("SELECT r.result FROM kd.reward_grant r JOIN kd.economy_transaction t ON t.id=r.transaction_id WHERE r.player_id=$1 AND t.reference_id=$2 ORDER BY r.created_at,r.id",[row.player_id,row.id])).rows.map(r=>r.result);
    }
  }
  if(reason!=="eligible")status="denied";
  await c.query("INSERT INTO kd.match_reward(match_id,player_id,config_version,status,reason,evidence,reward_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(match_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,evidence=EXCLUDED.evidence,reward_id=EXCLUDED.reward_id",[row.id,row.player_id,active?.id??null,status,reason,evidence,reward?.id??null]);
  return {match_id:row.id,status,reason,evidence,reward};
}
