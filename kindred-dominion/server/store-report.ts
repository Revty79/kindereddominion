import {z} from "zod";
import type {Client} from "./economy-assets";
import {ownerContent} from "../src/content/owner";
export const storeReportQuery=z.object({from:z.string().datetime().optional(),to:z.string().datetime().optional(),audience:z.enum(["ordinary","sandbox","all"]).default("ordinary")}).strict();
const scope="($3='all' OR a.sandbox=($3='sandbox'))";
export async function storeReport(c:Client,raw:unknown){
 const q=storeReportQuery.parse(raw),now=new Date((await c.query("SELECT now() n")).rows[0].n),to=q.to?new Date(q.to):now,from=q.from?new Date(q.from):new Date(to.getTime()-30*86400000);
 if(to<=from||to.getTime()-from.getTime()>366*86400000)throw new z.ZodError([{code:"custom",path:["from"],message:"Choose an increasing reporting window of at most 366 days."}]);
 const args=[from,to,q.audience],window="p.created_at>=$1 AND p.created_at<$2 AND "+scope;
 const purchases=(await c.query(`WITH sales AS (
 SELECT p.*,co.id IS NOT NULL compensated,
 coalesce(q.terms->'product'->>'type',d.definition->>'type',CASE WHEN jsonb_array_length(coalesce(p.result->'cosmetics','[]'))>0 THEN 'cosmetic' ELSE 'bundle' END) product_type,
 coalesce(q.terms->'product'->>'mode',d.definition->>'mode',CASE WHEN p.product_id LIKE 'card-first-%' THEN 'first_copy' WHEN p.product_id LIKE 'card-additional-%' THEN 'additional' ELSE 'reward' END) mode,
 q.terms->'promotion'->>'id' promotion_id
 FROM kd.shop_purchase p JOIN kd.economy_account a ON a.player_id=p.player_id
 JOIN kd.configuration_version v ON v.id=p.shop_version LEFT JOIN kd.shop_quote q ON q.id=p.quote_id
 LEFT JOIN LATERAL(SELECT value definition FROM jsonb_array_elements(v.document->'products') WHERE value->>'id'=p.product_id LIMIT 1)d ON true
 LEFT JOIN kd.shop_compensation co ON co.purchase_id=p.id WHERE ${window})
 SELECT product_id,product_type,mode,source,currency_id,count(*)::int purchases,count(*) FILTER(WHERE compensated)::int compensated,
 coalesce(sum(price),0)::text gross_currency_spent,coalesce(sum(price) FILTER(WHERE compensated),0)::text returned_currency,
 coalesce(sum((SELECT coalesce(sum((i->>'quantity')::bigint),0) FROM jsonb_array_elements(coalesce(result->'cards','[]')) i)),0)::text delivered_copies,
 coalesce(sum(jsonb_array_length(coalesce(result->'cosmetics','[]'))),0)::text cosmetic_licenses,
 count(DISTINCT shop_version)::int publication_versions
 FROM sales GROUP BY product_id,product_type,mode,source,currency_id ORDER BY count(*) DESC,product_id LIMIT 101`,args)).rows;
 const totals=(await c.query(`SELECT count(*)::int purchases,count(*) FILTER(WHERE co.id IS NOT NULL)::int compensated,
 coalesce(sum(p.price) FILTER(WHERE p.currency_id='gold'),0)::text gold_spent,
 coalesce(sum(p.price) FILTER(WHERE p.currency_id='aether'),0)::text aether_spent,
 coalesce(sum(p.price) FILTER(WHERE p.currency_id='gold' AND co.id IS NOT NULL),0)::text gold_returned,
 coalesce(sum(p.price) FILTER(WHERE p.currency_id='aether' AND co.id IS NOT NULL),0)::text aether_returned
 FROM kd.shop_purchase p JOIN kd.economy_account a ON a.player_id=p.player_id LEFT JOIN kd.shop_compensation co ON co.purchase_id=p.id WHERE ${window}`,args)).rows[0];
 const sources=(await c.query(`SELECT e.currency_id,e.origin,coalesce(sum(e.delta) FILTER(WHERE e.delta>0),0)::text credits,
 coalesce(-sum(e.delta) FILTER(WHERE e.delta<0),0)::text debits,count(*)::int ledger_entries
 FROM kd.currency_entry e JOIN kd.economy_account a ON a.player_id=e.player_id WHERE e.created_at>=$1 AND e.created_at<$2 AND ${scope} GROUP BY e.currency_id,e.origin ORDER BY 1,2`,args)).rows;
 const outstanding=(await c.query(`SELECT w.currency_id,w.origin,sum(w.balance)::text balance,sum(w.held)::text held,sum(w.balance-w.held)::text available FROM kd.wallet_balance w JOIN kd.economy_account a ON a.player_id=w.player_id WHERE ($1='all' OR a.sandbox=($1='sandbox')) GROUP BY w.currency_id,w.origin ORDER BY 1,2`,[q.audience])).rows;
 const packs=(await c.query(`SELECT count(*)::int settled,count(*) FILTER(WHERE k.reveal_count>0 AND k.revealed_at IS NULL)::int partially_revealed,count(*) FILTER(WHERE k.revealed_at IS NOT NULL)::int fully_revealed FROM kd.shop_pack k JOIN kd.economy_account a ON a.player_id=k.player_id WHERE k.created_at>=$1 AND k.created_at<$2 AND ${scope}`,args)).rows[0];
 const promotions=(await c.query(`SELECT q.terms->'promotion'->>'id' promotion_id,count(*)::int confirmations,count(p.id)::int settled,
 coalesce(sum(p.price),0)::text currency_spent,q.currency_id,
 coalesce(sum(greatest(0,(q.terms->>'originalPrice')::bigint-p.price)) FILTER(WHERE p.id IS NOT NULL),0)::text savings_against_same_contents
 FROM kd.shop_quote q JOIN kd.economy_account a ON a.player_id=q.player_id LEFT JOIN kd.shop_purchase p ON p.quote_id=q.id
 WHERE q.created_at>=$1 AND q.created_at<$2 AND ${scope} AND q.terms->'promotion'->>'id' IS NOT NULL GROUP BY 1,q.currency_id ORDER BY 1 LIMIT 100`,args)).rows;
 const commercial=(await c.query(`SELECT o.provider,count(*)::int orders,count(*) FILTER(WHERE payment_state='paid')::int paid,
 coalesce(sum(amount_minor) FILTER(WHERE payment_state='paid'),0)::text gross_test_minor,
 coalesce(sum(effective_refunded_minor),0)::text refunded_test_minor,
 count(*) FILTER(WHERE dispute_state IN('open','lost'))::int disputed,
 count(*) FILTER(WHERE payment_state='paid' AND fulfillment_state='pending')::int paid_pending,
 count(*) FILTER(WHERE payment_state='paid' AND fulfillment_state<>'fulfilled' AND error_code IS NOT NULL)::int failed_fulfillment,
 count(*) FILTER(WHERE fulfillment_state='needs_review')::int needs_review
 FROM kd.commerce_order o JOIN kd.economy_account a ON a.player_id=o.player_id WHERE o.created_at>=$1 AND o.created_at<$2 AND ${scope} GROUP BY o.provider ORDER BY o.provider`,args)).rows;
 const founders=ownerContent().cards.map(c=>c.id),collection=(await c.query(`WITH quantities AS (
 SELECT i.player_id,e.card_id,sum(i.quantity)::int quantity FROM kd.inventory i JOIN kd.edition e ON e.id=i.edition_id WHERE e.card_id=ANY($2::text[]) GROUP BY 1,2),
 progress AS (SELECT a.player_id,count(q.card_id) FILTER(WHERE q.quantity>0)::int unique_cards,coalesce(sum(greatest(q.quantity-1,0)),0)::text additional_copies FROM kd.economy_account a LEFT JOIN quantities q ON q.player_id=a.player_id WHERE ($1='all' OR a.sandbox=($1='sandbox')) GROUP BY a.player_id)
 SELECT count(*)::int players,count(*) FILTER(WHERE unique_cards=150)::int complete_founders,coalesce(avg(unique_cards),0)::float8 average_unique_cards,coalesce(sum(additional_copies::bigint),0)::text additional_playable_copies FROM progress`,[q.audience,founders])).rows[0];
 const trades=(await c.query(`SELECT count(*)::int settlements,coalesce(sum((SELECT sum(x.quantity) FROM kd.trade_transfer x WHERE x.settlement_id=t.id)),0)::text exchanged_copies FROM kd.trade_settlement t JOIN kd.economy_account a ON a.player_id=t.player_a WHERE t.created_at>=$1 AND t.created_at<$2 AND ${scope}`,args)).rows[0];
 return {window:{from:from.toISOString(),to:to.toISOString(),endExclusive:true},asOf:now.toISOString(),audience:q.audience,totals,products:purchases.slice(0,100),productsTruncated:purchases.length>100,currencySources:sources,currentOutstanding:outstanding,packs,promotions,commercialSandbox:commercial,currentCollection:collection,trades,actualSalesMinor:0,actualCashReceiptsMinor:0,actualRecognizedRevenueMinor:0,containsCredentials:false,containsPrivatePlayerIdentifiers:false,notice:"All commercial orders are test observations, never actual revenue. Gold/Aether spent is reported in currency units and is not added to provider test amounts. Wallet/collection snapshots are current; purchases and their reveal states refer to the selected purchase window. Provider refunds/disputes are the latest verified state of orders created in the window, not refund cashflow by event date. Promotion confirmations are not unique impressions or causal performance evidence."};
}
