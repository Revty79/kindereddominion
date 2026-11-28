import type {DB} from "./db";
import type {Client} from "./economy-assets";
import {selectedConfiguration} from "./configuration";
import {shopSchema} from "./shop-rules";
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
 const usable=new Set((await c.query("SELECT DISTINCT e.card_id FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE i.player_id=$1 AND i.quantity>0",[playerId])).rows.map(r=>r.card_id));
 return Object.fromEntries(equipped.rows.flatMap(row=>{const cosmetic=owned.find(item=>item.id===row.cosmetic_id&&item.cardId===row.card_id&&usable.has(row.card_id)&&!item.revoked&&!item.restricted&&item.type==="alternate_art"&&item.asset);return cosmetic?[[row.card_id,{cosmeticId:cosmetic.id,asset:cosmetic.asset,testing:cosmetic.definition!.testOnly,portablePath:null}]]:[];}));
}
