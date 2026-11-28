export const STORE_DEPARTMENTS=[
 {id:"boosters",name:"Booster Packs",symbol:"◇",description:"Discover first copies and build additional formations with published pack contents and odds."},
 {id:"collections",name:"Complete Collections",symbol:"✧",description:"Complete a Kindred, explore published expansions or collect an explicit additional set."},
 {id:"cards",name:"Individual Cards",symbol:"♧",description:"Choose the exact creature and review first-copy or additional-copy eligibility."},
 {id:"artwork",name:"Artwork Gallery",symbol:"✦",description:"Alternate illustrations and artwork collections, independent of playable card ownership."},
 {id:"customization",name:"Customization",symbol:"⌘",description:"Approved card backs, battlefields and decorative treatments when available."},
 {id:"featured",name:"Featured Products",symbol:"❖",description:"Published highlights, special collections and clearly disclosed offers."},
 {id:"aether",name:"Aether Exchange",symbol:"◈",description:"Review exact premium-currency packages through secure sandbox Checkout."},
] as const;
export type StoreDepartment=typeof STORE_DEPARTMENTS[number]["id"];
export type DepartmentProduct={id:string;type:string;mode:string;category:string;featured?:boolean;pool:{cards:string[]};cosmetics?:string[]};
export function productDepartment(product:DepartmentProduct,cosmetics:{id:string;type:string}[]=[]):Exclude<StoreDepartment,"featured"|"aether">{
 if(product.type==="booster")return "boosters";
 if(product.mode==="cosmetic"){
  const types=(product.cosmetics??[]).map(id=>cosmetics.find(c=>c.id===id)?.type);
  return product.category==="artwork"||types.length>0&&types.every(t=>t==="alternate_art"||t==="animated_art")?"artwork":"customization";
 }
 return product.category==="cards"||/^card-(first|additional)-/.test(product.id)?"cards":"collections";
}
export function inDepartment(product:DepartmentProduct,department:string,cosmetics:{id:string;type:string}[]=[]){return !department||department==="all"||department==="featured"?(department!=="featured"||!!product.featured||product.category==="offers"):productDepartment(product,cosmetics)===department;}
