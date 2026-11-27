type Queryable={query:(sql:string,args?:any[])=>Promise<any>};
// The same complete source closure used by per-order investigation, batched
// for whole-ledger checks/reports. Retain archived/released sources and every
// compensation-return edge; visited paths prevent cycles without a depth cap.
export async function commercialSourceGraph(c:Queryable){const restored=!!(await c.query("SELECT to_regclass('kd.commerce_restoration_link') AS relation")).rows[0].relation;return `WITH RECURSIVE
 restored AS(${restored?"SELECT r.order_id,l.currency_lot,l.ownership_lot,l.cosmetic_acquisition FROM kd.commerce_restoration r JOIN kd.commerce_restoration_link l ON l.restoration_id=r.id":"SELECT NULL::uuid AS order_id,NULL::uuid AS currency_lot,NULL::uuid AS ownership_lot,NULL::uuid AS cosmetic_acquisition WHERE false"}),
 seed AS(SELECT order_id,currency_lot AS id FROM kd.commerce_asset_link WHERE currency_lot IS NOT NULL UNION SELECT order_id,currency_lot FROM restored WHERE currency_lot IS NOT NULL),
 money_paths AS(SELECT order_id,id,ARRAY[id] AS visited FROM seed UNION ALL SELECT m.order_id,r.returned_lot,m.visited||r.returned_lot FROM money_paths m JOIN kd.currency_return r ON r.original_lot=m.id WHERE NOT r.returned_lot=ANY(m.visited)),
 money AS(SELECT DISTINCT order_id,id FROM money_paths),
 purchases AS(SELECT DISTINCT m.order_id,p.id,p.result FROM money m JOIN kd.currency_consumption s ON s.lot_id=m.id JOIN kd.shop_purchase p ON p.transaction_id=s.transaction_id),
 roots AS(SELECT order_id,ownership_lot AS id FROM kd.commerce_asset_link WHERE ownership_lot IS NOT NULL UNION SELECT order_id,ownership_lot FROM restored WHERE ownership_lot IS NOT NULL UNION SELECT p.order_id,l.id FROM purchases p JOIN kd.ownership_lot l ON l.acquisition_id::text=p.result->>'acquisitionId'),
 cosmetics AS(SELECT order_id,cosmetic_acquisition AS id FROM kd.commerce_asset_link WHERE cosmetic_acquisition IS NOT NULL UNION SELECT order_id,cosmetic_acquisition FROM restored WHERE cosmetic_acquisition IS NOT NULL UNION SELECT p.order_id,x.id FROM purchases p JOIN kd.cosmetic_acquisition x ON x.purchase_id=p.id AND x.operation='grant') `;}
export async function commercialAetherSummary(c:Queryable,provider:string){const graph=await commercialSourceGraph(c),r=(await c.query(`${graph}
 SELECT coalesce(sum((o.snapshot->'product'->>'aether')::bigint),0)::text AS credited,
 coalesce(sum((SELECT coalesce(sum(restored_aether),0) FROM kd.commerce_restoration WHERE order_id=o.id)),0)::text AS restored,
 coalesce(sum((SELECT coalesce(sum(reversed_aether),0) FROM kd.commerce_review WHERE order_id=o.id)),0)::text AS reversed,
 coalesce(sum((SELECT coalesce(sum(l.remaining),0) FROM money m JOIN kd.currency_lot l ON l.id=m.id WHERE m.order_id=o.id)),0)::text AS outstanding,
 coalesce(sum((SELECT coalesce(sum(l.held),0) FROM money m JOIN kd.currency_lot l ON l.id=m.id WHERE m.order_id=o.id)),0)::text AS held
 FROM kd.commerce_order o JOIN kd.commerce_fulfillment f ON f.order_id=o.id WHERE($1='all' OR o.provider=$1) AND(o.snapshot->'product'->>'aether')::bigint>0`,[provider])).rows[0];const credited=Number(r.credited),restored=Number(r.restored),reversed=Number(r.reversed),outstanding=Number(r.outstanding),held=Number(r.held);return {originalCredited:credited,restored,credited:credited+restored,reversed,netSpent:credited+restored-reversed-outstanding,outstanding,held};}
