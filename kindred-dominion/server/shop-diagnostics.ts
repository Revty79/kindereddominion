import type {Client} from "./economy-assets";
import type {BackendConfig} from "./config";
import {ApiError} from "./errors";
import {shopSchema,inPool} from "./shop-rules";
import {validateShopPublication} from "./shop-publication";
import {activeContent} from "./catalog";
import {packPlan,drawPack,seededRandom} from "./shop-draw";
import {bundleQuantities} from "./shop-quantities";
import {resolveProduct,offerPrice,offer,shopState,type ShopState} from "./shop-catalog";
import {economyDigest} from "./economy-hash";
type Diagnostic={code:string;message:string;path?:string;productId?:string};
export async function shopDiagnostics(c:Client,input:unknown,config:BackendConfig,options:{productId?:string;playerId?:string;seed:number;samples:number}){
 const parsed=shopSchema.safeParse(input),errors:Diagnostic[]=[],warnings:Diagnostic[]=[];
 if(!parsed.success)return {valid:false,errors:parsed.error.issues.map(i=>({code:"schema",path:i.path.join("."),message:i.message})),warnings,preview:null,simulationOnly:true,assetsGranted:false};
 const rules=parsed.data,pack=await activeContent(c);
 try{await validateShopPublication(c,rules,config);}catch(e){if(e instanceof ApiError)errors.push({code:e.code,message:e.message});else throw e;}
 const identities=(await c.query("SELECT kind,id,semantic FROM kd.shop_identity WHERE kind='product'")).rows;
 for(const p of rules.products){const prior=identities.find(v=>v.id===p.id);if(prior&&economyDigest(prior.semantic)!==economyDigest({type:p.type,mode:p.mode}))errors.push({code:"permanent_shop_identity",productId:p.id,message:"A published identity cannot change product type or ownership mode. Duplicate it under a new ID."});
  if(!p.artwork)warnings.push({code:"packaging_art_pending",productId:p.id,message:"Official packaging artwork is missing; the existing labeled preview will be used."});
  if(p.status==="draft")warnings.push({code:"draft_not_for_sale",productId:p.id,message:"This product is a private draft and cannot be purchased until a valid explicit publication."});
  if(p.starterRecipe)warnings.push({code:"starter_review",productId:p.id,message:"Deluxe activation requires the exact selected starter recipe and owner approval; isolated test exceptions do not approve hosted sales."});
  if(p.type==="booster"&&p.currency!=="gold")warnings.push({code:"commercial_randomness_restricted",productId:p.id,message:"Commercially funded randomized purchases remain blocked. Modeled expected value never authorizes live sales."});
  if(p.type==="cosmetic"&&p.cosmetics.some(id=>{const v=rules.cosmetics.find(v=>v.id===id);return v?.type!=="border"&&!v?.asset;}))warnings.push({code:"cosmetic_art_pending",productId:p.id,message:"Supply approved immutable artwork before activating this cosmetic product."});
 }
 const known=(await c.query("SELECT id,card_id,type FROM kd.cosmetic_identity")).rows;
 for(const v of rules.cosmetics){const old=known.find(k=>k.id===v.id);if(old&&(old.type!==v.type||old.card_id!==(v.cardId??null)))errors.push({code:"permanent_cosmetic_identity",message:"Cosmetic "+v.id+" cannot change its type or underlying permanent card."});}
 const product=options.productId?resolveProduct({cards:pack.cards,rules},options.productId):null;let preview:any=null;
 if(product){const cards=product.type==="cosmetic"?[]:pack.cards.filter(card=>inPool(card,product.pool,rules)),ids=cards.map(c=>c.id),quantities=bundleQuantities(product,ids),plan=product.type==="booster"?packPlan(product,cards,rules):null,units=product.type==="cosmetic"?product.cosmetics:plan?plan.slots.map(s=>s.id):ids;
  const normalized={...product,status:"published"as const,enabled:true},random=seededRandom(options.seed),rarityCounts:Record<string,number>={};let first:any=null,value=0;
  if(plan?.feasible)for(let n=0;n<options.samples;n++){const draw=drawPack(product,cards,rules,new Set(),random);first??=draw;for(const item of draw){rarityCounts[item.rarity]=(rarityCounts[item.rarity]??0)+1;value+=(rules.directAdditional.overrides[item.cardId]??rules.directAdditional.prices[item.rarity])*item.quantity;}}
  const price=offerPrice(product,units,units.length,rules,product.type==="bundle"?quantities:undefined),expected=plan?.feasible?value/options.samples:null;
  if(expected!==null&&product.currency===rules.directAdditional.currency&&price>expected)warnings.push({code:"pack_replacement_value",productId:product.id,message:"The pack costs more than its sampled contents bought as guaranteed singles. Review pricing or contents; this is a warning, not a ban on a commercial policy."});
  let account:any=null;if(options.playerId){const state:ShopState={...await shopState(c,options.playerId,config),rules:{...rules,products:rules.products.map(p=>p.id===product.id?normalized:p)}};const result=await offer(c,state,options.playerId,product.id);account={availableUnderProposedTerms:result.available,reasons:result.reasons,...result.terms,notPurchasablePreview:true};}
  preview={product,cardContents:cards.map(card=>({id:card.id,name:card.name,quantity:quantities.targets[card.id],rarity:rules.rarities[card.id]})),cosmetics:rules.cosmetics.filter(c=>product.cosmetics.includes(c.id)),fullCopies:product.type==="cosmetic"?0:product.type==="booster"?(plan?.size??0)*product.quantity:quantities.fullTotal,price,currency:product.currency,randomized:!!plan,feasible:plan?.feasible??true,seed:options.seed,samples:plan?.feasible?options.samples:0,first,rarityCounts,expectedDirectCopyPrice:expected,account};
 }
 return {valid:!errors.length,errors,warnings,preview,simulationOnly:true,assetsGranted:false,publicationPerformed:false};
}
