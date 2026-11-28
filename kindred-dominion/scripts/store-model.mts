import fs from "node:fs";
import {currentOwnerContent} from "../src/content/current";
import {DEFAULT_SHOP} from "../server/shop-rules";
import {cosmeticProposal} from "../server/cosmetic-proposals";
import {DEFAULT_COMMERCE} from "../server/commerce-rules";
import {DEFAULT_ECONOMY} from "../server/economy-rules";
import {DEFAULT_STARTERS} from "../server/starter-rules";
import {DEFAULT_STORE_MODEL,storeModelSchema} from "../server/store-model-settings";
import {financialModelSchema} from "../server/commercial-model";
import {completeStoreModel} from "../server/store-model";
// Pure, deterministic planning: no environment, database, credentials or grants.
const args=process.argv.slice(2),custom=args.find(a=>a.startsWith("--input="))?.slice(8),input=custom?JSON.parse(fs.readFileSync(custom,"utf8")):{},settings=storeModelSchema.parse({...DEFAULT_STORE_MODEL,...input.settings}),finance=financialModelSchema.parse({...DEFAULT_COMMERCE.financialModel,...input.finance}),shop=cosmeticProposal(DEFAULT_SHOP),result=completeStoreModel({pack:currentOwnerContent(),shop,economy:DEFAULT_ECONOMY,commerce:DEFAULT_COMMERCE,starters:DEFAULT_STARTERS,settings,finance}),file="docs/v1.6h/STORE-MODEL.json";
const catalog={proposalOnly:true,officialArtworkApproved:false,gameplayIdentityCount:150,explicitProducts:shop.products.map(p=>({id:p.id,type:p.type,mode:p.mode,status:p.status,enabled:p.enabled,testOnly:p.testOnly,category:p.category,currency:p.currency,price:p.price,edition:p.edition,starterRecipe:p.starterRecipe??null,cosmetics:p.cosmetics})),virtualDirectProducts:{firstCopy:150,additional:150},commercialProducts:DEFAULT_COMMERCE.products.map(p=>({id:p.id,type:p.type,amountMinor:p.amountMinor,status:p.status,enabled:p.enabled,sandbox:p.sandbox,liveEligible:p.liveEligible})),cosmeticDefinitions:shop.cosmetics.map(c=>({id:c.id,type:c.type,status:c.status,enabled:c.enabled,asset:c.asset??null})),featuredProducts:shop.products.filter(p=>p.featured||p.feature?.enabled).map(p=>p.id)};
fs.mkdirSync("docs/v1.6h",{recursive:true});const serialize=(v:unknown)=>JSON.stringify(v,null,2)+"\n";
for(const [name,value]of[[file,result],["docs/v1.6h/INTEGRATED-CATALOG.json",catalog]]as const){const text=serialize(value);if(args.includes("--check")){if(fs.readFileSync(name,"utf8").replace(/\r\n/g,"\n")!==text)throw Error(name+" differs from the deterministic model");}else fs.writeFileSync(name,text);}
console.log(JSON.stringify({modelOnly:true,check:args.includes("--check"),starting:result.startingCollection,firstCopyPacks:result.firstCopies.generalPacks,explicitProducts:shop.products.length,virtualDirectProducts:300,commercialProducts:catalog.commercialProducts.length,communityScenarios:result.finance.communities.length,actualRevenue:0}));
