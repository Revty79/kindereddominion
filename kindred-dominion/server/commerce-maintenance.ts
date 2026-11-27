import type {DB} from "./db";
import {transaction} from "./db";
import type {BackendConfig} from "./config";
import type {PaymentProvider} from "./commerce-rules";
import {commerceSchema} from "./commerce-rules";
import {selectedConfiguration} from "./configuration";
import {lockPlayer} from "./economy-assets";
import {paymentProvider} from "./commerce-checkout";
// A pause blocks local entry immediately. Existing external hosted pages need
// verified expiration; paid sessions keep their immutable settlement path.
export async function expirePausedCommerce(pool:DB,config:BackendConfig,supplied?:PaymentProvider){const selected=await selectedConfiguration(pool,"commerce");if(selected&&commerceSchema.parse(selected.document).enabled)return {paused:false,expired:0,deferred:0};if(config.commerceMode==="disabled"||config.environment==="prod"||!config.economyEnabled)return {paused:true,expired:0,deferred:0};const provider=supplied??paymentProvider(pool,config),rows=(await pool.query("SELECT id,player_id,checkout_session_id FROM kd.commerce_order WHERE provider=$1 AND provider_account=$2 AND payment_state IN('unpaid','pending','failed') AND checkout_state<>'expired' AND(checkout_lease_until IS NULL OR checkout_lease_until<=now()) ORDER BY updated_at,id LIMIT 1",[provider.name,provider.account])).rows;let expired=0,deferred=0;
 for(const row of rows)try{let state="expired";if(row.checkout_session_id){if(!provider.expireCheckout)throw Error("Provider expiration is unavailable.");await provider.expireCheckout(row.checkout_session_id);const session=await provider.retrieveCheckout(row.checkout_session_id);state=session.status;if(state!=="expired"){await pool.query("UPDATE kd.commerce_order SET updated_at=now(),error_code=$2 WHERE id=$1",[row.id,state==="paid"?"paid_verification_pending":"checkout_expiration_pending"]);deferred++;continue;}}
  await transaction(pool,async c=>{await lockPlayer(c,row.player_id);await c.query("SELECT domain FROM kd.configuration_selection WHERE domain='commerce' FOR SHARE");const current=await selectedConfiguration(c,"commerce");if(current&&commerceSchema.parse(current.document).enabled)return;const changed=await c.query("UPDATE kd.commerce_order SET checkout_state='expired',payment_state='expired',error_code=NULL,updated_at=now() WHERE id=$1 AND payment_state IN('unpaid','pending','failed') AND(checkout_lease_until IS NULL OR checkout_lease_until<=now())",[row.id]);expired+=changed.rowCount??0;});
 }catch{await pool.query("UPDATE kd.commerce_order SET error_code='checkout_expiration_pending',updated_at=now() WHERE id=$1 AND payment_state<>'paid'",[row.id]);deferred++;}return {paused:true,expired,deferred};}
