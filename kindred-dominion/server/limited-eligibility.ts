import type {DB} from "./db";
import type {Client} from "./economy-assets";
import {limitedReady} from "./limited-supply";
export async function limitedFormatIssues(c:DB|Client,cards:string[],format:string|null,playerId?:string){if(!await limitedReady(c))return [];const rows=(await c.query("SELECT m.card_id,e.definition,i.quantity FROM kd.limited_card_edition m JOIN kd.limited_edition e ON e.id=m.edition_id LEFT JOIN kd.inventory i ON i.edition_id=m.inventory_edition AND i.player_id=$2 WHERE m.exclusive_gameplay AND m.card_id=ANY($1)",[cards,playerId??null])).rows,errors:string[]=[];
 for(const id of new Set(rows.map(r=>r.card_id))){const variants=rows.filter(r=>r.card_id===id),allowed=variants.filter(r=>!r.definition.allowedFormats.length||r.definition.allowedFormats.includes(format));if(playerId?allowed.reduce((n,r)=>n+(r.quantity??0),0)<cards.filter(x=>x===id).length:!allowed.length)errors.push(id.toUpperCase()+": this exclusive gameplay identity needs sufficient owned copies eligible for the selected deck format.");}return errors;
}
