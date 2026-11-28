import type {Product} from "./shop-rules";
// Targets and grants are separate: bound starters, reserved cards and all
// editions count as owned. Lifetime eligibility remains exclusive to Gold.
export function bundleQuantities(product:Product,ids:string[],owned:Map<string,number>=new Map()){
 const targets=Object.fromEntries(ids.map(id=>[id,product.quantities[id]??product.quantity]));
 const grants:Record<string,number>={};for(const[id,n]of Object.entries(targets)){const quantity=product.mode==="completion"?Math.max(0,n-(owned.get(id)??0)):n;if(quantity)grants[id]=quantity;}
 return {targets,grants,total:Object.values(grants).reduce((a,b)=>a+b,0),fullTotal:Object.values(targets).reduce((a,b)=>a+b,0)};
}
