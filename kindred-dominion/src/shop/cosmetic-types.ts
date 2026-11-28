export const COSMETIC_SLOTS=["card_back","battlefield","treatment"] as const;
export type CosmeticSlot=typeof COSMETIC_SLOTS[number];
export const TREATMENTS=["metallic","holographic","edge"] as const;
export type Treatment=typeof TREATMENTS[number];
export const FUNCTIONAL_COSMETICS=["alternate_art","card_back","battlefield","border"] as const;
export type CosmeticPresentation={cosmeticId:string;name:string;url?:string|null;asset?:{id:string;revision:string};treatment?:Treatment;testing?:boolean};
export type PersonalCosmetics={card_back?:CosmeticPresentation;battlefield?:CosmeticPresentation;treatment?:CosmeticPresentation};
