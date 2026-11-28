import type {Domain} from "./configuration";
import {DEFAULT_ECONOMY} from "./economy-rules";

export const setupDomains:Domain[]=["shop","limited","economy","starters","trading","commerce"];
export const setupLabels:Record<Domain,string>={shop:"Shop",limited:"Limited editions",economy:"Economy and progression",starters:"Starter collections",trading:"Trading Hall",commerce:"Stripe sandbox commerce"};
export type SetupDependency={target:Domain|"content";reason:string};
// Conditional edges describe the real publication hooks, not a blanket order.
// Trading's economy edge is a runtime prerequisite; its independent manual
// publication remains supported by the existing configuration service.
export function setupDependencies(domain:Domain,d:any={}):SetupDependency[]{
 const edges:SetupDependency[]=[],add=(target:SetupDependency["target"],reason:string)=>{if(!edges.some(e=>e.target===target))edges.push({target,reason});};
 if(domain!=="trading")add("content","Publish executable founding content before reviewing card, reward or collectible references.");
 if(domain==="economy"){
  const rewards=[...(d.accountLevels??[]),...(d.masteryLevels??[]),...(d.objectives??[]).filter((x:any)=>x.enabled)].map((x:any)=>x.reward);
  rewards.push(...Object.values(d.bundles??{}));
  const refs=rewards.flatMap((r:any)=>r?.entitlements??[]);
  if(refs.length)add("shop","Reward entitlements need an active published booster or cosmetic catalog before economy publication.");
  if(refs.some((r:any)=>r.type==="limited"))add("limited","Limited rewards need an enabled published edition with the exact named reserved allocation.");
 }
 if(domain==="shop"){
  const active=(d.products??[]).filter((p:any)=>p.enabled&&p.status==="published"),currencies=[...active.map((p:any)=>p.currency),...[d.directFirst,d.directAdditional].filter(x=>x?.enabled).map(x=>x.currency)];
  if(currencies.some(id=>!DEFAULT_ECONOMY.currencies.some(c=>c.id===id&&c.active)))add("economy","Custom acquisition currencies must already be active in the published economy. The provisional default currencies can bootstrap the first shop.");
  if(active.some((p:any)=>p.edition==="deluxe"||p.starterRecipe))add("starters","Deluxe products require the exact published starter recipe and its separately recorded owner approval.");
  if(active.some((p:any)=>p.limitedEdition))add("limited","Publish the underlying edition before enabling a fixed-content limited SKU.");
 }
 if(domain==="limited"&&(d.editions??[]).some((e:any)=>e.status!=="draft"))add("shop","Publish underlying cards, cosmetics and eligibility definitions before the edition; enable its linked sale afterward.");
 if(domain==="trading")add("economy","Trading uses authoritative economy accounts, progression and published eligibility restrictions.");
 if(domain==="commerce"){
  add("economy","Sandbox commerce publication requires published active Aether, even while purchases are disabled.");
  if((d.products??[]).some((p:any)=>p.enabled&&p.status==="published"&&p.shopProducts?.length))add("shop","Asset products require their exact active fixed-content shop components.");
 }
 return edges;
}
export function setupOrder(documents:Record<string,any>,active:Set<string>){
 const remaining=new Set(setupDomains),order:Domain[]=[];
 while(remaining.size){const ready=[...remaining].find(d=>setupDependencies(d,documents[d]).every(e=>e.target==="content"||active.has(e.target)||order.includes(e.target)));
  if(!ready)break;order.push(ready);remaining.delete(ready);
 }
 return {order,cycle:[...remaining],notice:remaining.size?"These proposed drafts depend on one another. Publish a reviewed base catalog or a currency-only economy first, then add dependent rewards/products. No values are changed automatically.":null};
}
export function setupIssue(code:string,message:string,domain:Domain){
 const target:Domain|"content"=/^reward_shop|reward_product|commercial_component|limited_shop|limited_cosmetic|limited_format/.test(code)?"shop":/^limited_reward|limited_edition|limited_product/.test(code)?"limited":/^commerce_economy|currency_inactive/.test(code)?"economy":/^starter_|deluxe_/.test(code)?"starters":/unpublished|reward_card|reward_kindred|mastery_kindred|limited_card/.test(code)?"content":domain;
 return {code,message,target};
}
