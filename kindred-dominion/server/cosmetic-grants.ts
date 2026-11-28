import crypto from "node:crypto";
import type {Client} from "./economy-assets";
import {lockPlayer,assetEnvironment} from "./economy-assets";
import type {BackendConfig} from "./config";
import {economyPermitted,selectedConfiguration} from "./configuration";
import {economyDigest} from "./economy-hash";
import {shopSchema,productSchema} from "./shop-rules";
import {startingCosmeticDigest,validateStartingCosmetics} from "./cosmetic-publication";
import {shopState} from "./shop-catalog";
import {fulfillShopAssets} from "./shop-purchases";
import {readCosmeticPreferences} from "./cosmetic-loadout";
import {ownedCosmeticViews} from "./cosmetic-views";
import {reject} from "./errors";
export async function startingCosmeticPlan(c:Client,playerId:string,config:BackendConfig,context:"new_player"|"backfill"="backfill"){
 const player=(await c.query("SELECT starting_kindred,status FROM kd.player WHERE id=$1",[playerId])).rows[0];if(!player)reject(404,"player_missing","Player was not found.");
 const selected=await selectedConfiguration(c,"shop"),rules=selected?shopSchema.parse(selected.document):null,policy=rules?.startingCosmetics;
 const prior=(await c.query("SELECT slot,cosmetic_id,purchase_id FROM kd.starting_cosmetic_grant WHERE player_id=$1 ORDER BY slot",[playerId])).rows,prefs=await readCosmeticPreferences(c,playerId),ids=player.starting_kindred?policy?.kindreds[player.starting_kindred as keyof typeof policy.kindreds]:null;
 const account=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[playerId])).rows[0],testing=ids&&rules?.cosmetics.some(c=>[ids.cardBack,ids.battlefield].includes(c.id)&&c.testOnly);
 const status=!economyPermitted(config)||!rules?.enabled||!policy?.enabled||context==="backfill"&&!policy.backfillEnabled?"disabled":player.status!=="active"||!ids?"ineligible":testing&&!account?.sandbox?"awaiting_production_assets":"eligible";
 const owned=new Set((await c.query("SELECT cosmetic_id FROM kd.cosmetic_ownership WHERE player_id=$1 AND NOT revoked AND NOT limited_projection",[playerId])).rows.map(r=>r.cosmetic_id));
 const assignments=ids?([['card_back',ids.cardBack],['battlefield',ids.battlefield]]as const):[],alreadyOwnedSlots=assignments.filter(([slot,id])=>!prior.some(r=>r.slot===slot)&&owned.has(id)).map(([slot,cosmeticId])=>({slot,cosmeticId}));
 const changes=assignments.filter(([slot,id])=>!prior.some(r=>r.slot===slot)&&!owned.has(id)).map(([slot,cosmeticId])=>({slot,cosmeticId,alreadyOwned:false,willEquip:prefs.revision===0}));
 const value={playerId,kindred:player.starting_kindred,shopVersion:selected?.id??null,approvalDigest:rules?startingCosmeticDigest(rules):null,status:status==="eligible"&&!changes.length?alreadyOwnedSlots.length?"already_owned":"already_granted":status,changes,alreadyOwnedSlots,prior,preferencesRevision:prefs.revision,context};return {...value,previewDigest:economyDigest(value)};
}
export async function grantStartingCosmetics(c:Client,playerId:string,config:BackendConfig,context:"new_player"|"backfill",actorId=playerId){
 await lockPlayer(c,playerId);const plan=await startingCosmeticPlan(c,playerId,config,context);if(plan.status!=="eligible")return {plan,granted:[],replayed:["already_granted","already_owned"].includes(plan.status)};
 const state=await shopState(c,playerId,config);if(state.id!==plan.shopVersion)reject(409,"starting_cosmetic_changed","Starting appearances changed; review the current publication again.");await validateStartingCosmetics(state.rules,config);
 const priorOwnership=await ownedCosmeticViews(c,playerId),granted:string[]=[],equipped:{card_back:string|null;battlefield:string|null;treatment:null}={card_back:null,battlefield:null,treatment:null};
 for(const change of plan.changes){
  const definition=state.rules.cosmetics.find(v=>v.id===change.cosmeticId)!;
  if(priorOwnership.some(v=>v.id===change.cosmeticId&&v.restricted))continue;
  // Temporary assets are confined to designated sandbox players; ordinary
  // players keep neutral fallbacks until approved production assets exist.
  if(definition.testOnly&&!state.account.sandbox)continue;
  const id=crypto.randomUUID(),product=productSchema.parse({id:"starting-"+change.slot.replaceAll("_","-")+"-v1",name:"Starting Kindred "+change.slot.replaceAll("_"," "),description:"Free original-Kindred appearance entitlement; no playable card or currency is granted.",category:"cosmetics",type:"cosmetic",mode:"cosmetic",status:"published",enabled:true,testOnly:definition.testOnly,currency:"gold",price:1,cosmetics:[change.cosmeticId]});
  const assets=await fulfillShopAssets(c,playerId,state,product,[],{purchaseId:id,source:"reward",sourceReference:"starting-cosmetic-v1",actorId,cardOrigin:"starter",allowEmpty:true}),result={id,productId:product.id,label:product.name,shopVersion:state.id,economyVersion:state.economy.id,contentVersion:state.pack.id,currency:null,price:0,source:"reward",freeStartingCosmetic:true,kindred:plan.kindred,...assets};
  await c.query("INSERT INTO kd.shop_purchase(id,player_id,idempotency_key,fingerprint,product_id,shop_version,economy_version,content_version,environment,source,source_reference,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reward','starting-cosmetic-v1',$10)",[id,playerId,"starting-cosmetic-v1:"+change.slot,economyDigest({kindred:plan.kindred,slot:change.slot}),product.id,state.id,state.economy.id,state.pack.id,await assetEnvironment(c),result]);
  await c.query("INSERT INTO kd.starting_cosmetic_grant(player_id,slot,kindred,cosmetic_id,shop_version,purchase_id,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)",[playerId,change.slot,plan.kindred,change.cosmeticId,state.id,id,{definition,approval:state.rules.startingCosmetics!.approval,alreadyOwned:change.alreadyOwned,origin:"original-starting-kindred"}]);
  state.ownedCosmetics.add(change.cosmeticId);granted.push(change.cosmeticId);equipped[change.slot]=change.cosmeticId;
 }
 if(plan.preferencesRevision===0&&granted.length)await c.query("INSERT INTO kd.cosmetic_preferences(player_id,revision,card_back,battlefield) VALUES($1,1,$2,$3) ON CONFLICT(player_id) DO NOTHING",[playerId,equipped.card_back,equipped.battlefield]);
 if(granted.length)await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'starting-cosmetics-granted',$2,$3)",[actorId,playerId,{shopVersion:state.id,kindred:plan.kindred,cosmetics:granted,context}]);
 return {plan,granted,replayed:false};
}
