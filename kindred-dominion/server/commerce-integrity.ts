import type {DB} from "./db";
import type {Client} from "./economy-assets";
import {economyDigest} from "./economy-hash";
export async function reconcileCommerce(c:DB|Client){const invalid=new Set<string>();const rows=(await c.query(`SELECT o.id,o.snapshot,o.digest,p.snapshot AS publication,p.digest AS publication_digest
 FROM kd.commerce_order o JOIN kd.commerce_product_snapshot p ON p.config_version=o.config_version AND p.product_id=o.product_id`)).rows;
 for(const row of rows)if(economyDigest(row.snapshot)!==row.digest||economyDigest(row.publication)!==row.publication_digest||row.digest!==row.publication_digest)invalid.add(row.id);
 const references=(await c.query(`SELECT o.id FROM kd.commerce_order o JOIN kd.commerce_quote q ON q.id=o.quote_id
 LEFT JOIN kd.economy_account a ON a.player_id=o.player_id CROSS JOIN kd.environment_guard g
 WHERE o.player_id<>q.player_id OR o.config_version<>q.config_version OR o.product_id<>q.product_id OR o.digest<>q.digest
 OR o.amount_minor<>q.amount_minor OR o.currency<>q.currency OR o.amount_minor IS DISTINCT FROM (o.snapshot->'product'->>'amountMinor')::integer OR o.currency IS DISTINCT FROM(o.snapshot->'product'->>'currency') OR o.environment<>g.environment OR NOT o.sandbox OR NOT coalesce(a.sandbox,false)
 OR(o.payment_state='paid' AND NOT EXISTS(SELECT 1 FROM kd.commerce_payment p WHERE p.order_id=o.id AND p.payment_id=o.payment_id AND p.provider=o.provider AND p.provider_account=o.provider_account AND p.amount_minor=o.amount_minor AND p.currency=o.currency AND NOT p.livemode))
 OR(o.fulfillment_state IN('fulfilled','reversed') AND NOT EXISTS(SELECT 1 FROM kd.commerce_fulfillment f WHERE f.order_id=o.id))`)).rows;for(const row of references)invalid.add(row.id);return {ok:!invalid.size,orders:[...invalid].sort()};}
