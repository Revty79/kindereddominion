import {createSimulatedRefund,simulatedRefund,simulatedDispute} from "./provider-simulation-financial";
import type {RefundRequest} from "./commerce-rules";
import type {DB} from "./db";
import type {CheckoutRequest,CheckoutSession,PaymentProvider} from "./commerce-rules";
import {reject} from "./errors";
export class SimulationProvider implements PaymentProvider{
 readonly name="simulation" as const;constructor(private pool:DB,readonly account:string){}
 async findRefundRequest(id:string,paymentId:string){const r=(await this.pool.query("SELECT id FROM kd.commerce_simulation_refund WHERE request_id=$1 AND payment_id=$2",[id,paymentId])).rows[0];return r?this.retrieveRefund(r.id):null;}
 createRefund(r:RefundRequest){return createSimulatedRefund(this.pool,this.account,r);}
 retrieveRefund(id:string){return simulatedRefund(this.pool,this.account,id);}
 retrieveDispute(id:string){return simulatedDispute(this.pool,this.account,id);}
 async expireCheckout(id:string){await this.pool.query("UPDATE kd.commerce_simulation_session SET state='expired',revision=revision+1,updated_at=now() WHERE session_id=$1 AND provider_account=$2 AND state IN('open','pending','declined')",[id,this.account]);}
 async createCheckout(r:CheckoutRequest){if(r.providerAccount!==this.account||r.currency!=="usd")reject(400,"provider_association","The simulated checkout association is invalid.");const id="cs_sim_"+r.orderId.replaceAll("-","");await this.pool.query("INSERT INTO kd.commerce_simulation_session(session_id,order_id,provider_account,amount_minor,currency,payment_id,state) VALUES($1,$2,$3,$4,$5,$6,'open') ON CONFLICT(order_id) DO NOTHING",[id,r.orderId,this.account,r.amountMinor,r.currency,"pi_sim_"+r.orderId.replaceAll("-","")]);return this.retrieveCheckout(id);}
 async retrieveCheckout(id:string):Promise<CheckoutSession>{const row=(await this.pool.query("SELECT s.*,o.player_id,o.config_version,o.product_id FROM kd.commerce_simulation_session s JOIN kd.commerce_order o ON o.id=s.order_id WHERE s.session_id=$1 AND s.provider_account=$2",[id,this.account])).rows[0];if(!row)reject(404,"provider_session_missing","The simulated checkout session was not found.");return {id:row.session_id,orderId:row.order_id,playerId:row.player_id,account:this.account,amountMinor:row.amount_minor,currency:row.currency,livemode:false,status:row.state,paymentId:row.state==="paid"?row.payment_id:null,url:"#commerce?order="+row.order_id,productId:row.product_id,configVersion:row.config_version,refundedMinor:Number((await this.pool.query("SELECT coalesce(sum(amount_minor),0)::int AS n FROM kd.commerce_simulation_refund WHERE order_id=$1 AND state='succeeded'",[row.order_id])).rows[0].n),...await this.disputeState(row.order_id)};}
 private async disputeState(id:string){const state=(await this.pool.query("SELECT state FROM kd.commerce_simulation_dispute WHERE order_id=$1",[id])).rows[0]?.state??"none";return {disputed:state!=="none",disputeState:state};}
}
