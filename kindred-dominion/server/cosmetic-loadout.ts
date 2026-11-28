import {z} from "zod";
import type {DB} from "./db";
import type {Client} from "./economy-assets";
import type {BackendConfig} from "./config";
import {ownedCosmeticViews} from "./cosmetic-views";
import {checkedArtwork} from "./shop-publication";
import {portable} from "./economy-rules";
import {COSMETIC_SLOTS,type PersonalCosmetics} from "../src/shop/cosmetic-types";
import {reject} from "./errors";
export const cosmeticPreferences=z.object({card_back:portable.nullable(),battlefield:portable.nullable(),treatment:portable.nullable()}).strict();
export async function readCosmeticPreferences(c:DB|Client,playerId:string){const row=(await c.query("SELECT revision,card_back,battlefield,treatment FROM kd.cosmetic_preferences WHERE player_id=$1",[playerId])).rows[0];return row?{revision:row.revision,preferences:{card_back:row.card_back,battlefield:row.battlefield,treatment:row.treatment}}:{revision:0,preferences:{card_back:null,battlefield:null,treatment:null}};}
export async function validateCosmeticPreferences(c:Client,playerId:string,preferences:z.infer<typeof cosmeticPreferences>,config:BackendConfig){const owned=await ownedCosmeticViews(c,playerId),account=(await c.query("SELECT sandbox FROM kd.economy_account WHERE player_id=$1",[playerId])).rows[0];for(const slot of COSMETIC_SLOTS){const id=preferences[slot];if(!id)continue;const cosmetic=owned.find(c=>c.id===id&&!c.revoked&&!c.restricted&&c.type===(slot==="treatment"?"border":slot));if(!cosmetic||cosmetic.definition?.testOnly&&!account?.sandbox)reject(403,"cosmetic_not_owned","Select a functional, unrestricted cosmetic owned by this account for the matching appearance slot.");if(cosmetic.asset)await checkedArtwork(config,cosmetic.asset,!!account?.sandbox&&config.environment!=="prod");}}
export async function personalCosmetics(c:DB|Client,playerId:string,standardized=false):Promise<PersonalCosmetics>{if(standardized)return {};const saved=await readCosmeticPreferences(c,playerId),owned=await ownedCosmeticViews(c,playerId),result:PersonalCosmetics={};for(const slot of COSMETIC_SLOTS){const cosmetic=owned.find(c=>c.id===saved.preferences[slot]&&!c.revoked&&!c.restricted&&c.type===(slot==="treatment"?"border":slot));if(cosmetic?.definition&&(slot==="treatment"?!!cosmetic.definition.treatment:!!cosmetic.asset))result[slot]={cosmeticId:cosmetic.id,name:cosmetic.definition.name,url:cosmetic.url,asset:cosmetic.asset??undefined,treatment:cosmetic.definition.treatment,testing:cosmetic.definition.testOnly};}return result;}
