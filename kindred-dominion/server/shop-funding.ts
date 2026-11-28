import type {Client} from "./economy-assets";
import type {Product} from "./shop-rules";
import {reject} from "./errors";
export async function commerciallyFunded(c:Client,ids:string[]){
 if(!ids.length)return false;
 // Follow original lots through arbitrarily many compensation returns. A
 // relabelled return cannot turn purchased money into free currency.
 const result=await c.query(`WITH RECURSIVE ancestry AS (
 SELECT id,origin,ARRAY[id] AS visited FROM kd.currency_lot WHERE id=ANY($1::uuid[])
 UNION ALL SELECT l.id,l.origin,a.visited||l.id FROM ancestry a
 JOIN kd.currency_return r ON r.returned_lot=a.id JOIN kd.currency_lot l ON l.id=r.original_lot
 WHERE NOT l.id=ANY(a.visited))
 SELECT EXISTS(SELECT 1 FROM ancestry WHERE origin='purchased' OR (origin<>'sandbox' AND id IN(SELECT currency_lot FROM kd.commerce_asset_link WHERE currency_lot IS NOT NULL))) AS blocked`,[ids]);
 return result.rows[0].blocked as boolean;
}
export async function checkRandomizedFunding(c:Client,product:Product,ids:string[],sandbox:boolean,commercial=false){
 if(product.type!=="booster"||product.currency==="gold")return;
 if(commercial&&!sandbox||await commerciallyFunded(c,ids))reject(403,"randomized_commercial_funding_disabled","Commercially funded randomized purchases are disabled pending owner policy review. No currency or cards were transferred.");
}
