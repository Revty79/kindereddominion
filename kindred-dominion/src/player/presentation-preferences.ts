export const PRESENTATION_MODES=["system","normal","fast","reduced","instant"]as const;
export type PresentationMode=typeof PRESENTATION_MODES[number];
export type PresentationPreferences={schema:1;mode:PresentationMode;cardMovement:boolean;abilityAnimations:boolean;scoreAnimations:boolean;highlighting:boolean;descriptions:boolean;neutralBattlefield:boolean};
export const DEFAULT_PRESENTATION:PresentationPreferences={schema:1,mode:"system",cardMovement:true,abilityAnimations:true,scoreAnimations:true,highlighting:true,descriptions:true,neutralBattlefield:false};
export function normalizePresentation(value:unknown):PresentationPreferences{
 const v=value&&typeof value==="object"?value as Partial<PresentationPreferences>:{},result={...DEFAULT_PRESENTATION};
 if(v.schema!==1)return result;
 if(PRESENTATION_MODES.includes(v.mode as PresentationMode))result.mode=v.mode!;
 for(const key of["cardMovement","abilityAnimations","scoreAnimations","highlighting","descriptions","neutralBattlefield"]as const)if(typeof v[key]==="boolean")result[key]=v[key]!;
 return result;
}
export function motionProfile(preferences:PresentationPreferences,systemReduced:boolean){
 const mode=preferences.mode==="system"?(systemReduced?"reduced":"normal"):preferences.mode;
 return {mode,neutralBattlefield:preferences.neutralBattlefield,multiplier:mode==="fast"?.5:mode==="reduced"?.7:1,instant:mode==="instant",movement:preferences.cardMovement&&!["reduced","instant"].includes(mode),effects:preferences.abilityAnimations&&!["reduced","instant"].includes(mode),scores:preferences.scoreAnimations&&!["reduced","instant"].includes(mode),highlighting:preferences.highlighting,descriptions:preferences.descriptions};
}
export type MotionProfile=ReturnType<typeof motionProfile>;
