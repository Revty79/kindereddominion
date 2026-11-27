import type {DB} from "./db";
import {sweepTrades} from "./trade-support";
// A bounded worker repairs overdue commitments without depending on an open browser.
// The source events remain the durable notification outbox after any delivery failure.
export function startTradingMaintenance(pool:DB,intervalMs=30000){let stopped=false,running:Promise<void>|null=null;
 const tick=()=>{if(stopped||running)return;running=sweepTrades(pool,undefined,50).then(()=>{}).catch(()=>{console.error(JSON.stringify({event:"trading-maintenance-deferred"}));}).finally(()=>{running=null;});};
 tick();const timer=setInterval(tick,intervalMs);timer.unref();return async()=>{stopped=true;clearInterval(timer);await running;};
}
