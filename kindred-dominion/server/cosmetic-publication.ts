import type {ShopRules,Cosmetic} from "./shop-rules";
import type {BackendConfig} from "./config";
import {checkedArtwork} from "./shop-publication";
import {economyDigest} from "./economy-hash";
import {reject} from "./errors";
export function startingCosmeticDigest(rules:ShopRules){return economyDigest({kindreds:rules.startingCosmetics?.kindreds,definitions:rules.cosmetics.filter(c=>Object.values(rules.startingCosmetics?.kindreds??{}).some(d=>d.cardBack===c.id||d.battlefield===c.id)).map(c=>({id:c.id,type:c.type,kindred:c.kindred,asset:c.asset,testOnly:c.testOnly})).sort((a,b)=>a.id.localeCompare(b.id))});}
export async function validateCosmetic(cosmetic:Cosmetic,config:BackendConfig){
 if(!cosmetic.asset)return;
 const {asset}=await checkedArtwork(config,cosmetic.asset,cosmetic.testOnly),category=cosmetic.type==="alternate_art"?"cards":cosmetic.type==="card_back"?"card-backs":cosmetic.type==="battlefield"?"battlefields":null;
 if(category&&asset.category!==category)reject(400,"cosmetic_asset_category","Use an approved image from this cosmetic's matching repository asset category.");
 if(!cosmetic.enabled)return;
 const portrait=cosmetic.type==="alternate_art"||cosmetic.type==="card_back";
 if(portrait&&Math.abs(asset.width/asset.height-.75)>.01)reject(400,"cosmetic_portrait_ratio","Creature artwork and card backs preserve the 3:4 portrait ratio.");
 if(cosmetic.type==="battlefield"&&Math.abs(asset.width/asset.height-16/9)>.04)reject(400,"battlefield_asset_ratio","Battlefield artwork uses a landscape 16:9 source with a crop-safe center.");
 if(asset.width>4096||asset.height>4096||asset.bytes>4*1024*1024)reject(400,"cosmetic_runtime_size","Use optimized runtime artwork within 4096 pixels and 4 MiB; preserve large masters separately.");
}
export async function validateStartingCosmetics(rules:ShopRules,config:BackendConfig){
 const policy=rules.startingCosmetics;if(!policy?.enabled){if(policy?.backfillEnabled)reject(400,"starting_cosmetics_disabled","Enable the reviewed starting cosmetic policy before backfill.");return;}
 if(config.environment==="prod")reject(403,"production_cosmetics_disabled","Production cosmetic activation requires separate authorization.");
 if(policy.approval?.digest!==startingCosmeticDigest(rules))reject(403,"starting_cosmetic_review_required","Approve this exact starting cosmetic assignment and immutable asset revisions before activating free grants.");
 for(const[kindred,ids]of Object.entries(policy.kindreds))for(const[key,type]of[["cardBack","card_back"],["battlefield","battlefield"]]as const){const definition=rules.cosmetics.find(c=>c.id===ids[key]);if(!definition||!definition.enabled||definition.status!=="published"||definition.type!==type||definition.kindred!==kindred||!definition.asset)reject(400,"starting_cosmetic_definition","Each founding Kindred needs its active standard card back and battlefield, with matching approved assets.");if(definition.testOnly&&!["dev","integration"].includes(config.environment))reject(403,"starting_cosmetic_testing_only","Temporary starting appearances cannot activate on hosted servers.");await checkedArtwork(config,definition.asset,definition.testOnly);}
}
