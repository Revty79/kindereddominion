import type {DB} from "./db";
import type {Client} from "./economy-assets";
import {selectedConfiguration} from "./configuration";
import {shopSchema} from "./shop-rules";
import {commercialRestrictedCosmetics} from "./commerce-holds";
export const appearanceURL=(id:string,revision:string)=>`/api/appearances/${encodeURIComponent(id)}/${encodeURIComponent(revision)}`;
// License identity is the union of independent ordinary grants and active
// limited instances; edition-instance purchases remain a separate asset kind.
// Startup requires the complete migration set. Resolve both license sources in
// one bounded query rather than probing the schema on every storefront read.
export async function ownedCosmeticIds(c:DB|Client,playerId:string){return new Set<string>((await c.query("SELECT cosmetic_id FROM kd.cosmetic_ownership WHERE player_id=$1 AND NOT revoked UNION SELECT x.identity_id AS cosmetic_id FROM kd.limited_instance i JOIN kd.limited_component x ON x.instance_id=i.id AND x.kind='cosmetic' WHERE i.owner_id=$1 AND i.state='active'",[playerId])).rows.map(r=>r.cosmetic_id));}
export async function ownedCosmeticViews(c:DB|Client,playerId:string){
 const active=await selectedConfiguration(c,"shop"),current=active?shopSchema.parse(active.document):null;
 const rows=(await c.query("SELECT o.*,i.card_id,i.type,coalesce(a.config_version,o.limited_current_version) AS current_version,a.origin AS current_origin FROM kd.cosmetic_ownership o JOIN kd.cosmetic_identity i ON i.id=o.cosmetic_id LEFT JOIN kd.cosmetic_acquisition a ON a.id=o.current_acquisition WHERE o.player_id=$1 ORDER BY o.cosmetic_id",[playerId])).rows,account=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[playerId])).rows[0];
 const ready=(await c.query("SELECT to_regclass('kd.limited_instance') r")).rows[0].r;
 const limited=ready?(await c.query("SELECT x.identity_id,e.shop_version,i.original_provenance,i.definition_snapshot,i.issued_at,(i.restricted OR EXISTS(SELECT 1 FROM kd.limited_financial_hold h WHERE h.instance_id=i.id AND h.released_at IS NULL)) AS blocked FROM kd.limited_instance i JOIN kd.limited_component x ON x.instance_id=i.id AND x.kind='cosmetic' JOIN kd.limited_edition e ON e.id=i.edition_id WHERE i.owner_id=$1 AND i.state='active' ORDER BY blocked,i.issued_at,i.id",[playerId])).rows:[];
 const documents=new Map<string,ReturnType<typeof shopSchema.parse>>(),versions=new Set<string>([...rows.map(row=>row.current_version??row.acquired_version),...limited.map(row=>row.shop_version)]);
 for(const id of versions){const row=(await c.query("SELECT document FROM kd.configuration_version WHERE id=$1 AND domain='shop'",[id])).rows[0];if(row)documents.set(id,shopSchema.parse(row.document));}
 const held=await commercialRestrictedCosmetics(c,rows.map(row=>row.current_acquisition).filter(Boolean));
 return rows.map(row=>{
  // A retained, revoked ordinary license cannot be overwritten. A separately
  // owned limited instance can still supply its own current usable license.
  const needsLimited=row.limited_projection||row.revoked,grant=needsLimited?limited.find(g=>g.identity_id===row.cosmetic_id):null,version=grant?.shop_version??row.current_version??row.acquired_version,original=documents.get(version)?.cosmetics.find(v=>v.id===row.cosmetic_id),latest=current?.cosmetics.find(v=>v.id===row.cosmetic_id&&v.status!=="draft"&&(!v.testOnly||account?.sandbox)),definition=needsLimited?original:latest??original,revoked=needsLimited?!grant:row.revoked,restricted=!!row.restricted||(grant?!!grant.blocked:held.has(row.current_acquisition));
  return {id:row.cosmetic_id,cardId:row.card_id,type:row.type,definition,revoked,restricted,sandbox:grant?!!grant.definition_snapshot.testOnly:row.sandbox,currentAcquisition:grant?null:row.current_acquisition,origin:grant?.original_provenance.origin??row.current_origin??row.origin,asset:definition?.asset??null,url:definition?.asset?appearanceURL(definition.asset.id,definition.asset.revision):null,acquiredAt:grant?.issued_at??row.created_at};
 });
}
export async function equippedAppearances(c:DB|Client,playerId:string,standardized=false){
 if(standardized)return {};const [owned,equipped]=await Promise.all([ownedCosmeticViews(c,playerId),c.query("SELECT card_id,cosmetic_id FROM kd.cosmetic_equipment WHERE player_id=$1",[playerId])]);
 const usable=new Set((await c.query("SELECT DISTINCT e.card_id FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE i.player_id=$1 AND i.quantity>0",[playerId])).rows.map(r=>r.card_id));
 return Object.fromEntries(equipped.rows.flatMap(row=>{const cosmetic=owned.find(item=>item.id===row.cosmetic_id&&item.cardId===row.card_id&&usable.has(row.card_id)&&!item.revoked&&!item.restricted&&item.type==="alternate_art"&&item.asset);return cosmetic?[[row.card_id,{cosmeticId:cosmetic.id,asset:cosmetic.asset,testing:cosmetic.definition!.testOnly,portablePath:null}]]:[];}));
}
