import type {Client,Provenance} from "./economy-assets";
import {limitedReady} from "./limited-supply";
import {reject} from "./errors";
// Ordinary card-grant/correction APIs cannot mint or consume limited variants.
// Only the locked, exact instance operation may change its backing quantities.
export async function guardLimitedInventory(c:Client,playerId:string,changes:{editionId:string;quantity:number}[],provenance:Provenance){if(!changes.length||!await limitedReady(c))return;
 for(const change of changes){const row=(await c.query("SELECT l.*,e.card_id FROM kd.edition e LEFT JOIN kd.limited_card_edition l ON l.inventory_edition=e.id WHERE e.id=$1",[change.editionId])).rows[0];if(!row)continue;
  if(!row.edition_id){if(change.quantity>0&&(await c.query("SELECT 1 FROM kd.limited_card_edition WHERE card_id=$1 AND exclusive_gameplay",[row.card_id])).rowCount)reject(409,"limited_issuance_required","This exclusive gameplay identity can only be issued through its published limited supply.");continue;}
  const context=provenance.limitedInstance;if(!context)reject(409,"limited_instance_required","Use the exact limited collectible operation; ordinary quantity adjustments cannot mint or substitute serialized collectibles.");
  const instance=(await c.query("SELECT * FROM kd.limited_instance WHERE id=$1 AND edition_id=$2 FOR UPDATE",[context.id,row.edition_id])).rows[0];if(!instance||instance.state==="retired")reject(409,"limited_instance_unavailable","The exact collectible is unavailable.");const component=instance.definition_snapshot.contents.find((x:any)=>x.kind==="card"&&x.id===row.card_id);if(!component||Math.abs(change.quantity)!==component.quantity)reject(409,"limited_component_mismatch","Every limited operation must preserve its exact component quantities.");
  if(context.operation==="issue"?(instance.state!=="issuing"||instance.owner_id!==playerId||change.quantity<0):context.operation==="retire"?(instance.owner_id!==playerId||change.quantity>0):!context.parties?.includes(playerId))reject(409,"limited_operation_invalid","The limited instance does not authorize this ownership mutation.");
 }
}
