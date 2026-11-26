import published from "./published/founding-kindreds-artwork-v1.json" with {type:"json"};
import type {ContentPack} from "./types";
export const CURRENT_OWNER_CONTENT_ID="founding-kindreds-artwork-v1";
export function currentOwnerContent():ContentPack{return structuredClone(published as unknown as ContentPack);}
