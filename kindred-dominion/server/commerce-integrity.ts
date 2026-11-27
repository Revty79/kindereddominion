import {reconcileCommercialRecovery} from "./commerce-recovery-integrity";
import type {DB} from "./db";
import type {Client} from "./economy-assets";
import {economyDigest} from "./economy-hash";
import {hasCommercialHolds,traceCommercialSources} from "./commerce-holds";
export async function reconcileCommerce(c:DB|Client){const invalid=new Set<string>();const currentRefunds=!!(await c.query("SELECT to_regclass('kd.commerce_refund_state') AS relation")).rows[0].relation;let reviewRequired:string[]=[];const rows=(await c.query(`SELECT o.id,o.snapshot,o.digest,p.snapshot AS publication,p.digest AS publication_digest
 FROM kd.commerce_order o JOIN kd.commerce_product_snapshot p ON p.config_version=o.config_version AND p.product_id=o.product_id`)).rows;
 for(const row of rows)if(economyDigest(row.snapshot)!==row.digest||economyDigest(row.publication)!==row.publication_digest||row.digest!==row.publication_digest)invalid.add(row.id);
 const references=(await c.query(`SELECT o.id FROM kd.commerce_order o JOIN kd.commerce_quote q ON q.id=o.quote_id
 LEFT JOIN kd.economy_account a ON a.player_id=o.player_id CROSS JOIN kd.environment_guard g
 WHERE o.player_id<>q.player_id OR o.config_version<>q.config_version OR o.product_id<>q.product_id OR o.digest<>q.digest
 OR o.amount_minor<>q.amount_minor OR o.currency<>q.currency OR o.amount_minor IS DISTINCT FROM (o.snapshot->'product'->>'amountMinor')::integer OR o.currency IS DISTINCT FROM(o.snapshot->'product'->>'currency') OR o.environment<>g.environment OR NOT o.sandbox OR NOT coalesce(a.sandbox,false)
 OR(o.payment_state='paid' AND NOT EXISTS(SELECT 1 FROM kd.commerce_payment p WHERE p.order_id=o.id AND p.payment_id=o.payment_id AND p.provider=o.provider AND p.provider_account=o.provider_account AND p.amount_minor=o.amount_minor AND p.currency=o.currency AND NOT p.livemode))
 OR(o.fulfillment_state IN('fulfilled','reversed') AND NOT EXISTS(SELECT 1 FROM kd.commerce_fulfillment f WHERE f.order_id=o.id))`)).rows;for(const row of references)invalid.add(row.id);
 const fulfillment=(await c.query(`SELECT o.id FROM kd.commerce_fulfillment f JOIN kd.commerce_order o ON o.id=f.order_id JOIN kd.economy_transaction t ON t.id=f.transaction_id
 JOIN kd.commerce_event e ON e.id=f.event_id WHERE t.player_id<>o.player_id OR t.environment<>o.environment OR t.origin<>'sandbox'
 OR t.reference_id IS DISTINCT FROM o.id::text OR f.result->>'orderId' IS DISTINCT FROM o.id::text OR f.result->>'transactionId' IS DISTINCT FROM t.id::text
 OR e.order_id IS DISTINCT FROM o.id OR e.provider<>o.provider OR e.provider_account<>o.provider_account
 OR coalesce((SELECT sum(delta) FROM kd.currency_entry WHERE transaction_id=t.id AND currency_id='aether'),0)<>(o.snapshot->'product'->>'aether')::bigint
 OR EXISTS(SELECT 1 FROM kd.currency_entry WHERE transaction_id=t.id AND(currency_id<>'aether' OR origin<>'sandbox'))
 OR(SELECT count(*) FROM kd.shop_purchase WHERE commercial_order_id=o.id)<>jsonb_array_length(o.snapshot->'components')
 OR jsonb_array_length(f.result->'components')<>jsonb_array_length(o.snapshot->'components')
 OR EXISTS(SELECT 1 FROM kd.shop_purchase p WHERE p.commercial_order_id=o.id AND(p.player_id<>o.player_id OR p.source<>'commercial' OR p.environment<>o.environment OR p.result->>'commercialOrderId' IS DISTINCT FROM o.id::text))
 OR EXISTS(SELECT 1 FROM kd.currency_lot l WHERE l.transaction_id=t.id AND NOT EXISTS(SELECT 1 FROM kd.commerce_asset_link a WHERE a.order_id=o.id AND a.currency_lot=l.id))
 OR EXISTS(SELECT 1 FROM kd.shop_purchase p JOIN kd.ownership_lot l ON l.acquisition_id=(p.result->>'acquisitionId')::uuid WHERE p.commercial_order_id=o.id AND NOT EXISTS(SELECT 1 FROM kd.commerce_asset_link a WHERE a.order_id=o.id AND a.ownership_lot=l.id))
 OR EXISTS(SELECT 1 FROM kd.shop_purchase p JOIN kd.shop_pack k ON k.purchase_id=p.id WHERE p.commercial_order_id=o.id AND NOT EXISTS(SELECT 1 FROM kd.commerce_asset_link a WHERE a.order_id=o.id AND a.pack_id=k.id))
 OR EXISTS(SELECT 1 FROM kd.shop_purchase p JOIN kd.cosmetic_acquisition x ON x.purchase_id=p.id AND x.operation='grant' WHERE p.commercial_order_id=o.id AND NOT EXISTS(SELECT 1 FROM kd.commerce_asset_link a WHERE a.order_id=o.id AND a.cosmetic_acquisition=x.id) ${currentRefunds?"AND NOT EXISTS(SELECT 1 FROM kd.commerce_restoration_link a JOIN kd.commerce_restoration r ON r.id=a.restoration_id WHERE r.order_id=o.id AND a.cosmetic_acquisition=x.id)":""})`)).rows;for(const row of fulfillment)invalid.add(row.id);
 const linked=(await c.query(`SELECT a.order_id AS id FROM kd.commerce_asset_link a JOIN kd.commerce_order o ON o.id=a.order_id JOIN kd.commerce_fulfillment f ON f.order_id=o.id
 LEFT JOIN kd.currency_lot m ON m.id=a.currency_lot LEFT JOIN kd.ownership_lot l ON l.id=a.ownership_lot LEFT JOIN kd.cosmetic_acquisition x ON x.id=a.cosmetic_acquisition LEFT JOIN kd.shop_pack k ON k.id=a.pack_id
 WHERE(m.id IS NOT NULL AND(m.player_id<>o.player_id OR m.transaction_id<>f.transaction_id OR m.origin<>'sandbox'))
 OR(l.id IS NOT NULL AND(l.player_id<>o.player_id OR l.origin<>'sandbox' OR NOT l.sandbox OR NOT EXISTS(SELECT 1 FROM kd.shop_purchase p WHERE p.commercial_order_id=o.id AND p.id::text=l.source_reference)))
 OR(x.id IS NOT NULL AND(x.player_id<>o.player_id OR x.operation<>'grant' OR NOT EXISTS(SELECT 1 FROM kd.shop_purchase p WHERE p.commercial_order_id=o.id AND p.id=x.purchase_id)))
 OR(k.id IS NOT NULL AND(k.player_id<>o.player_id OR NOT EXISTS(SELECT 1 FROM kd.shop_purchase p WHERE p.commercial_order_id=o.id AND p.id=k.purchase_id)))`)).rows;for(const row of linked)invalid.add(row.id);
 for(const row of(await c.query("SELECT id,order_id,snapshot,digest FROM kd.commerce_event")).rows)if(economyDigest(row.snapshot)!==row.digest)invalid.add(row.order_id??"event:"+row.id);
 if(await hasCommercialHolds(c)){
  const financial=(await c.query(`SELECT o.id FROM kd.commerce_order o WHERE
   EXISTS(SELECT 1 FROM kd.commerce_refund_observation r JOIN kd.commerce_event e ON e.id=r.event_id WHERE r.order_id=o.id AND(r.payment_id IS DISTINCT FROM o.payment_id OR r.currency<>o.currency OR r.amount_minor>o.amount_minor OR e.provider<>o.provider OR e.provider_account<>o.provider_account))
   OR EXISTS(SELECT 1 FROM kd.commerce_dispute_observation d JOIN kd.commerce_event e ON e.id=d.event_id WHERE d.order_id=o.id AND(d.payment_id IS DISTINCT FROM o.payment_id OR d.currency<>o.currency OR d.amount_minor>o.amount_minor OR e.provider<>o.provider OR e.provider_account<>o.provider_account))
   ${currentRefunds?"":`   OR(SELECT coalesce(sum(amount_minor),0) FROM(SELECT DISTINCT provider_refund_id,amount_minor FROM kd.commerce_refund_observation WHERE order_id=o.id AND status='succeeded') r)>o.refunded_minor
   OR(SELECT coalesce(sum(amount_minor),0) FROM(SELECT DISTINCT provider_refund_id,amount_minor FROM kd.commerce_refund_observation WHERE order_id=o.id AND status='succeeded') observed)+(SELECT coalesce(sum(amount_minor),0) FROM kd.commerce_refund_request WHERE order_id=o.id AND state IN('requested','pending','ambiguous'))>o.amount_minor
   OR EXISTS(SELECT 1 FROM kd.commerce_refund_request r WHERE r.order_id=o.id AND r.state='succeeded' AND NOT EXISTS(SELECT 1 FROM kd.commerce_refund_observation x WHERE x.order_id=o.id AND x.provider_refund_id=r.provider_refund_id AND x.status='succeeded' AND x.amount_minor=r.amount_minor))
`}
   OR EXISTS(SELECT 1 FROM kd.commerce_review r LEFT JOIN kd.economy_transaction t ON t.id=r.transaction_id WHERE r.order_id=o.id AND r.reversed_aether>0 AND(t.id IS NULL OR t.player_id<>o.player_id OR t.reference_id IS DISTINCT FROM o.id::text OR t.type<>'commercial-refund-reversal' OR coalesce((SELECT -sum(delta) FROM kd.currency_entry WHERE transaction_id=t.id AND currency_id='aether'),0)<>r.reversed_aether))
   ${currentRefunds?"":`OR(SELECT coalesce(sum(reversed_aether),0) FROM kd.commerce_review WHERE order_id=o.id)>((o.snapshot->'product'->>'aether')::bigint*o.refunded_minor/o.amount_minor)`}
   OR EXISTS(SELECT 1 FROM kd.commerce_source_hold h JOIN kd.currency_lot l ON l.id=h.currency_lot WHERE h.order_id=o.id AND h.released_at IS NULL AND(l.player_id<>o.player_id OR h.quantity>l.held OR h.quantity>l.remaining))`)).rows;for(const row of financial)invalid.add(row.id);
  for(const row of(await c.query("SELECT DISTINCT order_id FROM kd.commerce_source_hold")).rows){const sources=await traceCommercialSources(c,row.order_id),allowed={currency_lot:new Set(sources.currency.map((l:any)=>l.id)),ownership_lot:new Set(sources.roots.map((l:any)=>l.id)),cosmetic_acquisition:new Set(sources.cosmetics.map((l:any)=>l.id))};for(const h of(await c.query("SELECT * FROM kd.commerce_source_hold WHERE order_id=$1",[row.order_id])).rows)for(const field of ["currency_lot","ownership_lot","cosmetic_acquisition"] as const)if(h[field]&&!allowed[field].has(h[field]))invalid.add(row.order_id);}
 }
 if(currentRefunds){const result=await reconcileCommercialRecovery(c);for(const id of result.invalid)invalid.add(id);reviewRequired=result.reviewRequired;}
 return {ok:!invalid.size,orders:[...invalid].sort(),reviewRequired};}
