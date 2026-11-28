import {limitedEdition} from "./limited-supply";
import {validateLimitedProduct,guardUnlimitedProducts} from "./limited-products";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {OfficialAsset} from "../src/assets/types";
import type {BackendConfig} from "./config";
import type {Client} from "./economy-assets";
import {activeContent} from "./catalog";
import {registerConfiguration,selectedConfiguration} from "./configuration";
import {DEFAULT_ECONOMY,economySchema,type EconomyRules} from "./economy-rules";
import {economyDigest} from "./economy-hash";
import {shopSchema,DEFAULT_SHOP,inPool,type ShopRules,type Cosmetic} from "./shop-rules";
import {ownerContent} from "../src/content/owner";
import {reject} from "./errors";
import {offerPrice} from "./shop-catalog";
import {packPlan} from "./shop-draw";
import {bundleQuantities} from "./shop-quantities";
import {checkDeluxe} from "./shop-deluxe";
import {identifyImage,sanitizeSVG} from "../src/assets/artwork";
import {validateCosmetic,validateStartingCosmetics} from "./cosmetic-publication";
import {cosmeticProposal} from "./cosmetic-proposals";

export async function artworkRegistry(config:BackendConfig){
 const candidates=[{manifest:path.join(config.root,"public/assets/manifest.json"),root:path.join(config.root,"public")},{manifest:path.join(config.controlDirectory,"assets/manifest.json"),root:config.controlDirectory}];
 for(const candidate of candidates){try{const document=JSON.parse(await fs.readFile(candidate.manifest,"utf8"));if(document.format!=="kindred-dominion-asset-registry"||document.schema!==1||!Array.isArray(document.assets))continue;return {...candidate,assets:document.assets as OfficialAsset[]};}catch{/* A hosted runtime uses the protected repository asset package. */}}
 reject(503,"artwork_registry_unavailable","The approved repository artwork registry is unavailable.");
}
export async function checkedArtwork(config:BackendConfig,reference:{id:string;revision:string},testing:boolean){
 const registry=await artworkRegistry(config),asset=registry.assets.find(a=>a.id===reference.id&&a.revision===reference.revision);
 if(!asset||(!testing&&asset.approval!=="production"))reject(400,"artwork_not_approved","Choose an immutable approved repository artwork reference. Testing artwork requires an explicitly isolated cosmetic.");
 if(!/^assets\/[a-z0-9/_-]+\.(webp|png|jpe?g|svg)$/.test(asset.path)||!["image/webp","image/png","image/jpeg","image/svg+xml"].includes(asset.mime))reject(400,"artwork_format_unavailable","Repository artwork must use a validated portable image format.");
 let file:string,bytes:Buffer;try{file=await fs.realpath(path.join(registry.root,asset.path));const root=await fs.realpath(registry.root);if(!file.startsWith(root+path.sep))throw Error();bytes=await fs.readFile(file);}catch{reject(400,"artwork_file_missing","The referenced optimized artwork is missing from this application package.");}
 if(bytes!.length!==asset.bytes||crypto.createHash("sha256").update(bytes!).digest("hex")!==asset.sha256)reject(400,"artwork_integrity","The referenced artwork failed its immutable checksum validation.");
 try{if(identifyImage(bytes!)!==asset.mime)throw Error();if(asset.mime==="image/svg+xml")sanitizeSVG(bytes!.toString("utf8"));}catch{reject(400,"artwork_format_unavailable","The referenced image is corrupt, incorrectly typed or contains unsafe SVG content.");}return {asset,file:file!,bytes:bytes!};
}
async function remember(c:Client,kind:string,id:string,semantic:unknown){const existing=(await c.query("SELECT semantic FROM kd.shop_identity WHERE kind=$1 AND id=$2",[kind,id])).rows[0];if(existing&&economyDigest(existing.semantic)!==economyDigest(semantic))reject(409,"permanent_shop_identity","This permanent shop identity cannot be reassigned to another content classification or product mode.");if(!existing)await c.query("INSERT INTO kd.shop_identity(kind,id,semantic) VALUES($1,$2,$3)",[kind,id,semantic]);}
export async function validateShopPublication(c:Client,rules:ShopRules,config:BackendConfig){
 const economy=await selectedConfiguration(c,"economy"),currencies=economy?economySchema.parse(economy.document).currencies:DEFAULT_ECONOMY.currencies;
 const currency=(id:string)=>{if(!currencies.some(v=>v.id===id&&v.active))reject(400,"currency_inactive","Active acquisition definitions require an active published currency.");};
 const pack=await activeContent(c),known=new Set((await c.query("SELECT DISTINCT i.id FROM kd.card_identity i JOIN kd.card_revision r ON r.card_id=i.id JOIN kd.content_version v ON v.id=r.version_id WHERE v.channel='official'")).rows.map(r=>r.id));
 const referenced=[...Object.keys(rules.rarities),...rules.collections.flatMap(k=>k.cards),...rules.products.flatMap(p=>[...Object.keys(p.quantities),...p.pool.cards,...p.pool.exclude,...p.slots.flatMap(s=>[...s.pool.cards,...s.pool.exclude])]),...rules.formats.flatMap(f=>[...f.excludeCards,...f.eventPool,...Object.keys(f.cardLimits)]),...rules.cosmetics.flatMap(v=>v.cardId?[v.cardId]:[])];
 if(referenced.some(id=>!known.has(id)))reject(400,"unpublished_shop_card","Publish permanent gameplay identities through the existing content pipeline before offering them in the shop.");
 for(const collection of rules.collections)if(collection.artwork)await checkedArtwork(config,collection.artwork,false);
 for(const product of rules.products){if(product.artwork)await checkedArtwork(config,product.artwork,product.testOnly);if(product.status!=="published"||!product.enabled)continue;
  currency(product.currency);
  for(const id of [...product.pool.collections,...product.slots.flatMap(s=>s.pool.collections)])if(rules.collections.find(k=>k.id===id)?.status!=="published")reject(400,"collection_unpublished","Active products require published collection definitions.");
  for(const id of product.cosmetics){const cosmetic=rules.cosmetics.find(v=>v.id===id);if(!cosmetic?.enabled||cosmetic.status!=="published"||cosmetic.testOnly&&!product.testOnly)reject(400,"cosmetic_unavailable","Active cosmetic products need an active published cosmetic and the same testing boundary.");}
  const pool=product.type==="cosmetic"?[]:pack.cards.filter(card=>inPool(card,product.pool,rules)&&rules.collections.some(k=>k.status==="published"&&k.acquisition!=="unavailable"&&k.acquisition!=="cosmetic"&&k.cards.includes(card.id)&&(product.mode!=="first_copy"||k.acquisition==="free")));
  if(product.type!=="cosmetic"&&pool.some(card=>!rules.rarities[card.id]))reject(400,"rarity_unassigned","Every active product identity needs an explicit rarity assignment.");
  if(product.limitedEdition)await validateLimitedProduct(c,product,pool.map(card=>card.id));else await guardUnlimitedProducts(c,pool.map(card=>card.id));
  const quantities=bundleQuantities(product,pool.map(card=>card.id));
  if(Object.keys(product.quantities).some(id=>!pool.some(card=>card.id===id)))reject(400,"quantity_outside_pool","Per-card quantities must belong to this published product pool.");
  if(product.type==="bundle"&&quantities.fullTotal>10000)reject(400,"bundle_delivery_limit","A bundle exceeds the 10,000-copy atomic delivery limit.");
  await checkDeluxe(c,product,pool.map(card=>card.id),config);
  if(product.type==="booster"&&!packPlan(product,pool,rules).feasible)reject(400,"pack_unavailable","The published full pool cannot satisfy this pack's slot guarantees.");
  const ids=product.type==="cosmetic"?product.cosmetics:product.type==="booster"?product.slots.map(s=>s.id):pool.map(card=>card.id);offerPrice(product,ids,ids.length,rules,product.type==="bundle"?quantities:undefined);
 }
 for(const direct of [rules.directFirst,rules.directAdditional])if(direct.enabled){currency(direct.currency);for(const card of pack.cards.filter(card=>inPool(card,direct.pool,rules))){await guardUnlimitedProducts(c,[card.id]);if(!rules.rarities[card.id])reject(400,"rarity_unassigned","Every active direct acquisition needs an explicit rarity.");if(BigInt(direct.overrides[card.id]??direct.prices[rules.rarities[card.id]])*BigInt(direct.quantity)>1000000000000n)reject(400,"price_limit","Direct quantity pricing exceeds the supported operation limit.");}}
 for(const cosmetic of rules.cosmetics)await validateCosmetic(cosmetic,config);
 await validateStartingCosmetics(rules,config);
 for(const announcement of rules.announcements??[])if(announcement.artwork)await checkedArtwork(config,announcement.artwork,false);
 const covered=new Set<string>();
 if(rules.directFirst.enabled)for(const card of pack.cards)if(inPool(card,rules.directFirst.pool,rules)&&rules.collections.some(k=>k.status==="published"&&k.acquisition==="free"&&k.cards.includes(card.id)))covered.add(card.id);
 for(const product of rules.products.filter(p=>p.enabled&&p.status==="published"&&p.mode==="first_copy"&&p.currency==="gold"&&!p.testOnly&&!p.startsAt&&!p.endsAt&&!p.limit))for(const card of pack.cards)if(inPool(card,product.pool,rules)&&(product.type==="bundle"||product.slots.some(s=>inPool(card,s.pool,rules)&&(s.depleted==="available_pool"||s.weights[rules.rarities[card.id]]>0))))covered.add(card.id);
 if(rules.enabled&&ownerContent().cards.some(card=>!covered.has(card.id)))reject(400,"founding_free_path_required","Every founding identity must retain an always-available ordinary Gold first-copy path.");
 for(const card of pack.cards.filter(card=>covered.has(card.id)))if(!rules.rarities[card.id])reject(400,"rarity_unassigned","Assign a proposed rarity before activating acquisition for this card.");
 for(const product of rules.products.filter(p=>p.enabled&&p.status==="published"&&p.mode!=="cosmetic"))if(!pack.cards.some(card=>inPool(card,product.pool,rules)&&rules.rarities[card.id]))reject(400,"empty_product_pool","An active product has no published, rarity-assigned gameplay pool.");
 return {pack};
}
export async function publishShopIdentities(c:Client,rules:ShopRules){
 for(const collection of rules.collections)await remember(c,"collection",collection.id,{classification:collection.classification,...(collection.classification==="founding"?{cards:[...collection.cards].sort()}: {})});
 for(const product of rules.products)await remember(c,"product",product.id,{type:product.type,mode:product.mode,...(product.limitedEdition?{limitedEdition:product.limitedEdition}: {})});
 for(const [id]of Object.entries(rules.rarities))for(const mode of ["first","additional"])await remember(c,"product",`card-${mode}-${id}`,{type:"direct",mode,cardId:id});
 for(const format of rules.formats)await remember(c,"format",format.id,{kind:"deck-eligibility"});
 for(const cosmetic of rules.cosmetics){const old=(await c.query("SELECT * FROM kd.cosmetic_identity WHERE id=$1",[cosmetic.id])).rows[0];if(old&&(old.card_id!==(cosmetic.cardId??null)||old.type!==cosmetic.type))reject(409,"permanent_cosmetic_identity","A cosmetic ID cannot be reassigned to a different gameplay card or cosmetic type.");if(!old)await c.query("INSERT INTO kd.cosmetic_identity(id,card_id,type) VALUES($1,$2,$3)",[cosmetic.id,cosmetic.cardId??null,cosmetic.type]);}
}
function rewardReferences(rules:EconomyRules){
 const automatic=[...rules.accountLevels,...rules.masteryLevels,...rules.objectives.filter(o=>o.enabled)].map(v=>v.reward),promotions=rules.promotions.filter(p=>p.enabled).map(p=>rules.bundles[p.bundleId]);
 return [...automatic,...promotions,...Object.values(rules.bundles)].flatMap(bundle=>bundle.entitlements.map(entitlement=>({...entitlement,automatic:automatic.includes(bundle)||promotions.includes(bundle)})));
}
export function registerShopPublication(){
 registerConfiguration("shop",v=>shopSchema.parse(v),cosmeticProposal(DEFAULT_SHOP),{validate:validateShopPublication,published:async(c,document)=>publishShopIdentities(c,document)});
 const proposal=structuredClone(DEFAULT_ECONOMY);proposal.objectives.find(o=>o.id==="intro-tutorial")!.reward.entitlements=[{type:"booster",id:"founding-first",quantity:1}];
 registerConfiguration("economy",v=>economySchema.parse(v),proposal,{rewardEntitlements:true,validate:async(c,document:EconomyRules)=>{
  const references=rewardReferences(document);if(!references.length)return [];
  const selected=await selectedConfiguration(c,"shop");if(!selected)reject(400,"reward_shop_required","Publish a validated shop before configuring booster or cosmetic rewards.");const shop=shopSchema.parse(selected.document),pack=await activeContent(c),snapshots=new Map<string,unknown>();let maximumUnits=0;
  for(const reference of references){if(reference.type==="limited"){const e=await limitedEdition(c,reference.id),allocation=e.spec.allocations.find(a=>a.id===reference.allocationId);if(e.spec.status!=="published"||!e.spec.enabled||!allocation)reject(400,"limited_reward_allocation_required","Limited rewards need a published enabled edition and a named reserved reward allocation.");if(reference.automatic&&e.spec.testOnly)reject(400,"sandbox_reward_boundary","Sandbox limited rewards cannot enter ordinary automatic progression.");maximumUnits+=reference.quantity*e.spec.contents.length;if(maximumUnits>10000)reject(400,"reward_bundle_limit","Too many reward components.");snapshots.set("limited:"+e.id,{type:"limited",id:e.id,shopVersion:e.shop_version,contentVersion:e.content_version,snapshot:{definition:e.spec,core:e.core}});continue;}if(reference.type==="title")reject(400,"reward_type_inactive","Player-title rendering is inactive.");
   const definition=reference.type==="booster"?shop.products.find(p=>p.id===reference.id&&p.type==="booster"):shop.cosmetics.find(v=>v.id===reference.id);
   if(!definition||!definition.enabled||definition.status!=="published")reject(400,"reward_product_unavailable","Reward entitlements require an active published booster or cosmetic.");if(reference.automatic&&definition.testOnly)reject(400,"sandbox_reward_boundary","Testing-only artwork/products belong in explicitly issued sandbox bundles, not ordinary automatic rewards or promotions.");
   maximumUnits+=reference.quantity*("slots"in definition?definition.slots.length:1);if(maximumUnits>10000)reject(400,"reward_bundle_limit","This publication queues too many entitlement assets for one atomic reward configuration.");
   snapshots.set(reference.type+":"+reference.id,{type:reference.type,id:reference.id,shopVersion:selected.id,contentVersion:pack.id,snapshot:{definition,rules:shop}});
  }
  return [...snapshots.values()];
 },published:async(c,_document,id,_config,context)=>{for(const value of context as any[])await c.query("INSERT INTO kd.reward_product_snapshot(economy_version,type,definition_id,shop_version,content_version,snapshot) VALUES($1,$2,$3,$4,$5,$6)",[id,value.type,value.id,value.shopVersion,value.contentVersion,value.snapshot]);}});
}
