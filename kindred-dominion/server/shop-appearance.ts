import {createReadStream} from "node:fs";
import {z} from "zod";
import type {FastifyInstance} from "fastify";
import type {Authentication} from "./auth";
import type {BackendConfig} from "./config";
import type {DB} from "./db";
import {transaction} from "./db";
import {lockPlayer,type Client} from "./economy-assets";
import {selectedConfiguration} from "./configuration";
import {shopSchema,type Cosmetic} from "./shop-rules";
import {portable} from "./economy-rules";
import {checkedArtwork} from "./shop-publication";
import {reject} from "./errors";
import {shopState} from "./shop-catalog";
import {commercialRestrictedCosmetics} from "./commerce-holds";

export const appearanceURL=(id:string,revision:string)=>`/api/appearances/${encodeURIComponent(id)}/${encodeURIComponent(revision)}`;
export async function ownedCosmeticViews(c:DB|Client,playerId:string){
 const active=await selectedConfiguration(c,"shop"),current=active?shopSchema.parse(active.document):null;
 const rows=(await c.query("SELECT o.*,i.card_id,i.type,a.config_version AS current_version,a.origin AS current_origin FROM kd.cosmetic_ownership o JOIN kd.cosmetic_identity i ON i.id=o.cosmetic_id LEFT JOIN kd.cosmetic_acquisition a ON a.id=o.current_acquisition WHERE o.player_id=$1 ORDER BY o.cosmetic_id",[playerId])).rows,account=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[playerId])).rows[0];
 const documents=new Map<string,ReturnType<typeof shopSchema.parse>>();for(const id of new Set<string>(rows.map(row=>row.current_version??row.acquired_version))){const row=(await c.query("SELECT document FROM kd.configuration_version WHERE id=$1 AND domain='shop'",[id])).rows[0];if(row)documents.set(id,shopSchema.parse(row.document));}
 const held=await commercialRestrictedCosmetics(c,rows.map(row=>row.current_acquisition).filter(Boolean));return rows.map(row=>{const original=documents.get(row.current_version??row.acquired_version)?.cosmetics.find(cosmetic=>cosmetic.id===row.cosmetic_id),latest=current?.cosmetics.find(cosmetic=>cosmetic.id===row.cosmetic_id&&cosmetic.status!=="draft"&&(!cosmetic.testOnly||account?.sandbox)),definition=latest??original;row.restricted=row.restricted||held.has(row.current_acquisition);
  return {id:row.cosmetic_id,cardId:row.card_id,type:row.type,definition,revoked:row.revoked,restricted:row.restricted,sandbox:row.sandbox,currentAcquisition:row.current_acquisition,origin:row.current_origin??row.origin,asset:definition?.asset??null,url:definition?.asset?appearanceURL(definition.asset.id,definition.asset.revision):null,acquiredAt:row.created_at};
 });
}
export async function equippedAppearances(c:DB|Client,playerId:string,standardized=false){
 if(standardized)return {};const [owned,equipped]=await Promise.all([ownedCosmeticViews(c,playerId),c.query("SELECT card_id,cosmetic_id FROM kd.cosmetic_equipment WHERE player_id=$1",[playerId])]);
 return Object.fromEntries(equipped.rows.flatMap(row=>{const cosmetic=owned.find(item=>item.id===row.cosmetic_id&&item.cardId===row.card_id&&!item.revoked&&!item.restricted&&item.type==="alternate_art"&&item.asset);return cosmetic?[[row.card_id,{cosmeticId:cosmetic.id,asset:cosmetic.asset,testing:cosmetic.definition!.testOnly,portablePath:null}]]:[];}));
}
export function cosmeticRoutes(app:FastifyInstance,pool:DB,config:BackendConfig,auth:Authentication){
 app.get<{Params:{id:string}}>("/api/shop/appearance-preview/:id",async(req,reply)=>{const actor=await auth.actor(req),state=await shopState(pool,actor.id,config),id=portable.parse(req.params.id),definition=state.rules.cosmetics.find(v=>v.id===id&&v.enabled&&v.status==="published"&&(!v.testOnly||state.account.sandbox));if(!definition?.asset)reject(404,"appearance_missing","This published artwork preview is unavailable.");const value=await checkedArtwork(config,definition.asset,!!state.account.sandbox&&config.environment!=="prod");reply.header("Content-Security-Policy","default-src 'none'; sandbox").type(value.asset.mime);return reply.send(createReadStream(value.file));});
 app.get("/api/cosmetics",async req=>{const actor=await auth.actor(req);return {owned:await ownedCosmeticViews(pool,actor.id),equipment:(await pool.query("SELECT card_id,cosmetic_id FROM kd.cosmetic_equipment WHERE player_id=$1",[actor.id])).rows};});
 app.post<{Params:{cardId:string}}>("/api/cosmetics/equipment/:cardId",async req=>{const actor=await auth.actor(req),cardId=portable.parse(req.params.cardId),body=z.object({cosmeticId:portable.nullable()}).strict().parse(req.body);return transaction(pool,async c=>{await lockPlayer(c,actor.id);
  if(body.cosmeticId){const owned=(await ownedCosmeticViews(c,actor.id)).find(item=>item.id===body.cosmeticId);if(!owned||owned.revoked||owned.restricted||owned.cardId!==cardId||owned.type!=="alternate_art"||!owned.asset)reject(403,"cosmetic_not_owned","Equip an available alternate artwork variant owned by this account for this permanent card identity.");const account=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[actor.id])).rows[0];if(owned.definition!.testOnly&&!account.sandbox)reject(403,"sandbox_account_required","Testing illustrations require a designated sandbox account.");await checkedArtwork(config,owned.asset,!!account.sandbox&&config.environment!=="prod");
   await c.query("INSERT INTO kd.cosmetic_equipment(player_id,card_id,cosmetic_id) VALUES($1,$2,$3) ON CONFLICT(player_id,card_id) DO UPDATE SET cosmetic_id=$3,updated_at=now()",[actor.id,cardId,body.cosmeticId]);
  }else await c.query("DELETE FROM kd.cosmetic_equipment WHERE player_id=$1 AND card_id=$2",[actor.id,cardId]);
  await c.query("INSERT INTO kd.audit_event(actor_id,operation,target_id,details) VALUES($1,'cosmetic-equipment',$2,$3)",[actor.id,cardId,{cosmeticId:body.cosmeticId}]);return {cardId,cosmeticId:body.cosmeticId};
 });});
 app.get<{Params:{id:string;revision:string}}>("/api/appearances/:id/:revision",async(req,reply)=>{
  const actor=await auth.actor(req),id=portable.parse(req.params.id),revision=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/).parse(req.params.revision),owned=await ownedCosmeticViews(pool,actor.id),current=owned.some(item=>!item.revoked&&!item.restricted&&item.asset?.id===id&&item.asset?.revision===revision);
  const historical=current?false:!!(await pool.query("SELECT 1 FROM kd.match_shop_context x JOIN kd.match m ON m.id=x.match_id CROSS JOIN LATERAL jsonb_each(x.cosmetics) c WHERE m.player_id=$1 AND c.value->'asset'->>'id'=$2 AND c.value->'asset'->>'revision'=$3 LIMIT 1",[actor.id,id,revision])).rowCount;
  if(!current&&!historical)reject(404,"appearance_missing","This account's current or archived appearance was not found.");const account=(await pool.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[actor.id])).rows[0],value=await checkedArtwork(config,{id,revision},!!account?.sandbox&&config.environment!=="prod");reply.header("Content-Security-Policy","default-src 'none'; sandbox").type(value.asset.mime);return reply.send(createReadStream(value.file));
 });
}
