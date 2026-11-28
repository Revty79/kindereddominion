import type {TradingRules} from "./trading-rules";
export function playerTradeReason(reason:string){
 if(/ancestry|source chain|inconsistent|investigation/.test(reason))return "The history of these copies needs an administrator's review.";
 if(/provenance is not enabled/.test(reason))return "These copies are not allowed by the current trading policy.";
 if(/Sandbox|Testing and administrator/.test(reason))return "Testing and administrator-granted copies cannot be traded.";
 if(/account-bound/.test(reason))return "These copies stay with your account. Starter and first-copy grants cannot be traded.";
 if(/restricted/.test(reason))return "These copies are temporarily restricted, including payment or dispute reviews.";
 if(/holding period/.test(reason))return "These copies are in a purchase or reward waiting period.";
 if(/another environment/.test(reason))return "These copies belong to a different play environment.";
 if(/exact collectible/.test(reason))return "Choose the edition and serial in Collectibles; card quantities cannot replace a specific collectible.";
 return reason;
}
export function inventoryBreakdown(lots:any[],total:number,canTrade:boolean,exactReserved:Set<string>=new Set()){
 let reserved=0,accountBound=0,temporarilyRestricted=0,exactCopies=0,availableToOffer=0;
 for(const lot of lots){const held=exactReserved.has(lot.id)?lot.remaining:Math.min(lot.remaining,lot.reserved);reserved+=held;const free=lot.remaining-held;
  if(lot.issues.some((s:string)=>s.includes("exact collectible")))exactCopies+=free;
  else if(lot.issues.some((s:string)=>/account-bound|Testing and administrator/.test(s)))accountBound+=free;
  else if(lot.issues.length||!canTrade)temporarilyRestricted+=free;
  else availableToOffer+=free;
 }
 const accounted=reserved+accountBound+temporarilyRestricted+exactCopies+availableToOffer;temporarilyRestricted+=Math.max(0,total-accounted);
 return {reserved,accountBound,temporarilyRestricted,exactCopies,availableToOffer};
}
