import type {Client} from "./economy-assets";
import type {BackendConfig} from "./config";
import {selectedConfiguration} from "./configuration";
import {starterSchema} from "./starter-rules";
import {economyDigest} from "./economy-hash";
import {ownerContent} from "../src/content/owner";
import type {Product} from "./shop-rules";
import {bundleQuantities} from "./shop-quantities";
import {reject} from "./errors";
export async function checkDeluxe(c:Client,product:Product,ids:string[],config:BackendConfig){
 if(product.edition!=="deluxe"&&!product.starterRecipe)return;
 const recipe=product.starterRecipe,selected=await selectedConfiguration(c,"starters");
 if(!recipe||!selected)reject(400,"deluxe_recipe_required","Deluxe publication requires its exact reviewed V1.6A starter recipe.");
 const rules=starterSchema.parse(selected.document),digest=economyDigest({upgradeId:rules.upgradeId,definitions:rules.definitions});
 if(recipe.version!==rules.recipeVersion||recipe.digest!==digest)reject(400,"deluxe_recipe_changed","The deluxe recipe does not match the selected immutable V1.6A definitions.");
 const expected=Object.fromEntries(ownerContent().cards.filter(c=>recipe.kindreds.includes(c.kindred as any)).map(c=>[c.id,1]));
 for(const definition of rules.definitions.filter(d=>recipe.kindreds.includes(d.kindred)))for(const extra of definition.additional)expected[extra.cardId]+=extra.quantity;
 const actual=bundleQuantities(product,ids).targets;
 if(economyDigest(actual)!==economyDigest(expected))reject(400,"deluxe_contents_changed","Deluxe contents must contain thirty identities and exactly the reviewed ten additional copies per Kindred.");
 if(config.environment==="prod"||(!(product.testOnly&&["dev","integration"].includes(config.environment))&&rules.hostedApproval?.digest!==digest))reject(403,"deluxe_owner_review_required","Unapproved deluxe recipes remain draft or isolated DEV sandbox products. Owner approval of the exact starter digest is required before hosted activation.");
}
