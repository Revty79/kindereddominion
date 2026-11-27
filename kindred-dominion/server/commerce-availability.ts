import type {Client} from "./economy-assets";
import type {BackendConfig} from "./config";
import {activeContent} from "./catalog";
import {checkedArtwork} from "./shop-publication";
import {reject} from "./errors";
export async function validateCommercialAvailability(c:Client,snapshot:any,config:BackendConfig){const pack=await activeContent(c),published=new Set(pack.cards.map(c=>c.id)),cosmetics=snapshot.components.flatMap((v:any)=>v.definition.cosmetics.map((id:string)=>snapshot.shopRules?.cosmetics.find((v:any)=>v.id===id))),ids=[...new Set<string>([...snapshot.components.flatMap((v:any)=>v.cardIds),...cosmetics.map((v:any)=>v?.cardId).filter(Boolean)])].sort();
 const rows=(await c.query("SELECT id,retired FROM kd.card_identity WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE",[ids])).rows;if(ids.some(id=>!published.has(id)||!rows.some(r=>r.id===id&&!r.retired)))reject(409,"commercial_content_unavailable","An associated card is retired or no longer published. Review an updated commercial catalog before starting Checkout.");
 for(const cosmetic of cosmetics){if(!cosmetic?.asset||!cosmetic.enabled||cosmetic.status!=="published")reject(409,"commercial_artwork_unavailable","An associated artwork definition requires a reviewed publication.");await checkedArtwork(config,cosmetic.asset,!!cosmetic.testOnly);}
}
