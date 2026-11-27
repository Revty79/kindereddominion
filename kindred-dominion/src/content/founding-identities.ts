import type {ContentPack} from "./types";
export type RegistryIdentity={number:string;gameplayId:string;kindred:string;setId:string;retired?:boolean};
export function hasRegisteredPlayerIdentities(content:ContentPack,registry:RegistryIdentity[]){return content.cards.length>0&&content.cards.every(card=>registry.some(r=>!r.retired&&r.gameplayId===card.collectible?.gameplayId&&r.number===card.collectible?.number&&r.kindred===card.kindred&&r.setId===card.collectible?.setId));}
export function assertRegisteredPlayerIdentities(content:ContentPack,registry:RegistryIdentity[]){if(!hasRegisteredPlayerIdentities(content,registry))throw Error("Player content requires reviewed, active permanent registry assignments for every collectible.");}
// An expansion may add reviewed identities without replacing the permanent
// founding roster. Definition revisions and artwork remain independent.
export function assertFoundingIdentityCoverage(content:ContentPack,founding:ContentPack){
 for(const original of founding.cards){const matches=content.cards.filter(c=>c.id===original.id),card=matches[0];
  if(matches.length!==1||card.kindred!==original.kindred||card.collectible?.number!==original.collectible?.number||card.collectible?.gameplayId!==original.collectible?.gameplayId||card.collectible?.setId!==original.collectible?.setId)throw Error("Player content must preserve every permanent founding collectible identity.");
 }
}
