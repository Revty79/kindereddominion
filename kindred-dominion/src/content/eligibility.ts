import type {CardDefinition} from "../engine/types";

export type PlayingFormat = {
  id:string; name:string; description:string; enabled:boolean;
  collections:string[]; excludeCollections:string[]; kindreds:string[];
  excludeCards:string[]; rarities:string[]; deckSize:number; maxCopies:number;
  cardLimits:Record<string,number>; standardArtwork:boolean; eventPool:string[];
};
export type EligibilityCatalog = {
  version:string|null; defaultFormat:string|null; formats:PlayingFormat[];
  collections:{id:string;name?:string;status:string;cards:string[]}[];
  rarities:Record<string,string>; retired:string[];
};

// Shared by authoritative publication/match checks and the player's preview.
// Server checks always run again; a client preview never authorizes a deck.
export function formatIssues(cards:string[],library:Record<string,CardDefinition>,format:PlayingFormat,rules:Pick<EligibilityCatalog,"collections"|"rarities">){
  const errors:string[]=[];
  if(!format.enabled)return ["This event format is not active."];
  if(cards.length!==format.deckSize)errors.push(`This format requires ${format.deckSize} cards.`);
  const counts=new Map<string,number>();for(const id of cards)counts.set(id,(counts.get(id)??0)+1);
  for(const [id,count]of counts){
    const card=library[id];if(!card){errors.push(id+": unpublished card.");continue;}
    const membership=rules.collections.filter(c=>c.status!=="draft"&&c.cards.includes(id));
    if(format.collections.length&&!membership.some(c=>format.collections.includes(c.id)))errors.push(id.toUpperCase()+": outside this format's allowed collections.");
    if(membership.some(c=>format.excludeCollections.includes(c.id))||format.excludeCards.includes(id))errors.push(id.toUpperCase()+": excluded by this format.");
    if(format.kindreds.length&&!format.kindreds.includes(card.kindred))errors.push(id.toUpperCase()+": Kindred not permitted.");
    if(format.rarities.length&&!format.rarities.includes(rules.rarities[id]))errors.push(id.toUpperCase()+": rarity not permitted.");
    if(format.eventPool.length&&!format.eventPool.includes(id))errors.push(id.toUpperCase()+": outside the event pool.");
    const maximum=Math.min(format.maxCopies,format.cardLimits[id]??format.maxCopies);
    if(count>maximum)errors.push(`${id.toUpperCase()}: this format permits at most ${maximum} copies.`);
  }
  return errors;
}
