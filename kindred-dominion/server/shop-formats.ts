import type {BackendConfig} from "./config";
import type {DB} from "./db";
import type {Client} from "./economy-assets";
import type {ContentPack} from "../src/content/types";
import type {GameConfig} from "../src/engine/types";
import {libraryOf} from "../src/content/validation";
import {selectedConfiguration} from "./configuration";
import {shopSchema,formatIssues} from "./shop-rules";
import {equippedAppearances,appearanceURL} from "./shop-appearance";
import {reject} from "./errors";
import {personalCosmetics} from "./cosmetic-loadout";

export async function deckFormat(c:DB|Client,cards:string[],pack:ContentPack,game:GameConfig,formatId?:string|null){
 const selected=await selectedConfiguration(c,"shop");if(!selected){if(formatId)reject(400,"format_unavailable","Publish an eligibility definition before selecting this format.");return {formatId:null,shopVersion:null,definition:null,errors:[] as string[],rarities:{}};}
 const rules=shopSchema.parse(selected.document);
 // Legacy Free Play keeps its existing owned-copy rules unless the player
 // explicitly selects an additional format. Standard decks use the published default.
 if(game.mode==="free"&&!formatId)return {formatId:null,shopVersion:selected.id,definition:null,errors:[] as string[],rarities:rules.rarities};
 const chosen=formatId??rules.defaultFormat,definition=rules.formats.find(format=>format.id===chosen);if(!definition)return {formatId:chosen,shopVersion:selected.id,definition:null,errors:["The saved format is unavailable; select a published playing format."],rarities:rules.rarities};
 return {formatId:chosen,shopVersion:selected.id,definition,errors:formatIssues(cards,libraryOf(pack),definition,rules),rarities:rules.rarities};
}
export async function captureMatchShop(c:Client,matchId:string,playerId:string,cards:string[],pack:ContentPack,game:GameConfig,formatId?:string|null,testing=false){
 const report=await deckFormat(c,cards,pack,game,formatId);if(report.errors.length&&!testing)reject(400,"deck_format_ineligible",report.errors.join(" "));const personal=await personalCosmetics(c,playerId,!!report.definition?.standardArtwork);await c.query("INSERT INTO kd.match_cosmetic_presentation(match_id,presentation) VALUES($1,$2)",[matchId,personal]);if(!report.shopVersion)return;
 const cosmetics=await equippedAppearances(c,playerId,!!report.definition?.standardArtwork);
 await c.query("INSERT INTO kd.match_shop_context(match_id,shop_version,format_id,eligibility,cosmetics,rarities) VALUES($1,$2,$3,$4,$5,$6)",[matchId,report.shopVersion,report.formatId??"base-free-play",{definition:report.definition,baseRulesPreserved:true},cosmetics,report.rarities]);
}
export async function decorateMatch(c:DB|Client,row:any){const context=(await c.query("SELECT cosmetics,rarities FROM kd.match_shop_context WHERE match_id=$1",[row.id])).rows[0];const personal=(await c.query("SELECT presentation FROM kd.match_cosmetic_presentation WHERE match_id=$1",[row.id])).rows[0]?.presentation??{};return {...row,personalCosmetics:personal,cosmetics:Object.fromEntries(Object.entries(context?.cosmetics??{}).map(([card,value]:[string,any])=>[card,appearanceURL(value.asset.id,value.asset.revision)])),rarities:context?.rarities??{}};}
export async function collectionAppearance(c:DB|Client,playerId:string){const selected=await selectedConfiguration(c,"shop"),appearances=await equippedAppearances(c,playerId);return {personalCosmetics:await personalCosmetics(c,playerId),cosmetics:Object.fromEntries(Object.entries(appearances).map(([card,value]:[string,any])=>[card,appearanceURL(value.asset.id,value.asset.revision)])),rarities:selected?shopSchema.parse(selected.document).rarities:{},formats:selected?shopSchema.parse(selected.document).formats.filter(f=>f.enabled).map(f=>({id:f.id,name:f.name,description:f.description})):[]};}
