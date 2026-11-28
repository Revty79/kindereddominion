import type {Client} from "./economy-assets";
import type {Product} from "./shop-rules";
import {limitedEdition,limitedReady} from "./limited-supply";
import {economyDigest} from "./economy-hash";
import {reject} from "./errors";
export async function validateLimitedProduct(c:Client,p:Product,cardIds:string[]){
 if(!p.limitedEdition)return;
 const e=await limitedEdition(c,p.limitedEdition);
 const cards=e.spec.contents.filter(x=>x.kind==="card");
 if(e.spec.testOnly!==p.testOnly||!e.spec.methods.includes("shop")||
 economyDigest([...p.cosmetics].sort())!==economyDigest(e.spec.contents.filter(x=>x.kind==="cosmetic").map(x=>x.id).sort())||
 economyDigest([...cardIds].sort())!==economyDigest(cards.map(x=>x.id).sort())||
 cards.some(x=>(p.quantities[x.id]??p.quantity)!==x.quantity)||
 p.mode!==(cards.length?"additional":"cosmetic")||p.type!==(cards.length?"bundle":"cosmetic"))
 reject(400,"limited_product_mismatch","A limited product must disclose the exact published edition contents, quantity, acquisition method and account cohort.");
}
export async function guardUnlimitedProducts(c:Client,ids:string[]){if(!ids.length||!await limitedReady(c))return;if((await c.query("SELECT 1 FROM kd.limited_card_edition WHERE card_id=ANY($1) AND exclusive_gameplay",[ids])).rowCount)reject(400,"limited_issuance_required","Exclusive limited gameplay identities cannot be sold or rewarded through unlimited quantity products.");}
