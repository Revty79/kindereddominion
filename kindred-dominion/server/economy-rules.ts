import {z} from "zod";

export const kindreds=["Nature","Mythical","Arcane","Undead","Constructs"] as const;
export const portable=z.string().min(1).max(80).regex(/^[a-z][a-z0-9_-]*$/);
export const units=z.number().int().min(0).max(1_000_000_000_000);
export const origins=["earned","promotional","administrator","sandbox","purchased"] as const;
export const cardOrigins=["legacy_unknown","starter","first_copy","mastery","achievement","administrator","promotional","purchased","sandbox","traded"] as const;
export const bundleSchema=z.object({
  currencies:z.record(z.string(),units).default({}),xp:units.default(0),mastery:units.default(0),
  cards:z.array(z.object({cardId:portable.optional(),kindred:z.string().min(1).max(80).optional(),quantity:z.number().int().min(1).max(100),mode:z.enum(["first_copy","additional"]),tradeable:z.boolean().default(false)}).strict().refine(x=>!!x.cardId!==!!x.kindred).refine(x=>!(x.cardId&&x.mode==="first_copy"&&x.quantity!==1),"A specific first-copy card grants exactly one copy.")).max(150).default([]),
  entitlements:z.array(z.object({type:z.enum(["booster","cosmetic","title"]),id:portable,quantity:z.number().int().min(1).max(100)}).strict()).max(30).default([]),
}).strict();
export type RewardBundle=z.infer<typeof bundleSchema>;
const objective=z.object({id:portable,label:z.string().min(1).max(100),description:z.string().max(300),period:z.enum(["intro","daily","weekly","permanent"]),event:z.enum(["account_created","tutorial_completed","match_completed","match_won","evolution","ability_used","placement","deck_saved","collection_viewed","guide_viewed","unique_card","account_level","mastery_level","booster_acquired"]),target:z.number().int().min(1).max(100000),aggregation:z.enum(["count","distinct_kindreds"]).default("count"),claimAutomatically:z.boolean().default(false),kindred:z.string().max(80).optional(),difficulty:z.enum(["normal"]).optional(),reward:bundleSchema,enabled:z.boolean()}).strict();
const threshold=z.object({xp:units,reward:bundleSchema}).strict();
export const economySchema=z.object({
  label:z.string().min(1).max(100),enabled:z.boolean(),timeZone:z.literal("UTC"),
  currencies:z.array(z.object({id:portable,name:z.string().min(1).max(60),description:z.string().max(300),active:z.boolean()}).strict()).min(2).max(30),
  match:z.object({normal:z.object({win:units,draw:units,loss:units}).strict(),xp:z.object({win:units,draw:units,loss:units}).strict(),mastery:units,minSeconds:z.number().int().min(0).max(3600),minPlacements:z.number().int().min(0).max(100),forfeitMinSeconds:z.number().int().min(0).max(3600),forfeitMinPlacements:z.number().int().min(0).max(100),cooldownSeconds:z.number().int().min(0).max(86400),dailyLimit:z.number().int().min(1).max(1000),diminishAfter:z.number().int().min(1).max(1000),diminishBasisPoints:z.number().int().min(0).max(10000)}).strict(),
  accountLevels:z.array(threshold).min(2).max(200),masteryLevels:z.array(threshold).min(2).max(200),
  objectives:z.array(objective).max(300),dailyGraceDays:z.number().int().min(0).max(14),
  bundles:z.record(portable,bundleSchema).default({}),
  promotions:z.array(z.object({id:portable,label:z.string().min(1).max(80),bundleId:portable,startsAt:z.string().datetime(),endsAt:z.string().datetime(),kindred:z.string().min(1).max(80).optional(),enabled:z.boolean()}).strict()).max(100).default([]),
  competitive:z.object({enabled:z.literal(false),initialRating:z.number().int().min(0).max(10000),kFactor:z.number().int().min(1).max(100),formats:z.array(portable).max(20),ranks:z.array(z.object({id:portable,label:z.string().min(1).max(60),minimum:z.number().int().min(0).max(10000)}).strict()).max(30)}).strict(),
}).strict().superRefine((v,c)=>{
  for(const key of ["accountLevels","masteryLevels"] as const)if(v[key][0].xp!==0||v[key].some((x,i)=>i>0&&x.xp<=v[key][i-1].xp))c.addIssue({code:"custom",path:[key],message:"Thresholds must start at zero and increase strictly."});
  for(const level of [...v.accountLevels,...v.masteryLevels])if(level.reward.xp||level.reward.mastery)c.addIssue({code:"custom",message:"Level rewards cannot recursively grant XP."});
  for(const key of ["currencies","objectives","promotions"] as const)if(new Set(v[key].map(x=>x.id)).size!==v[key].length)c.addIssue({code:"custom",path:[key],message:"Identifiers must be unique."});
  if(!["gold","aether"].every(id=>v.currencies.some(x=>x.id===id)))c.addIssue({code:"custom",path:["currencies"],message:"Preserve Gold and Aether identifiers."});
  for(const promotion of v.promotions)if(!v.bundles[promotion.bundleId]||Date.parse(promotion.endsAt)<=Date.parse(promotion.startsAt)||v.bundles[promotion.bundleId]?.mastery&&!promotion.kindred)c.addIssue({code:"custom",message:"Promotions need a known bundle, a valid UTC window and explicit Kindred context for mastery."});
  for(const objective of v.objectives)if(objective.reward.mastery&&!objective.kindred)c.addIssue({code:"custom",message:"Mastery objective rewards require an explicit Kindred."});
  if(v.enabled&&Object.values(v.match.normal).some(n=>n>0)&&!v.currencies.some(c=>c.id==="gold"&&c.active))c.addIssue({code:"custom",message:"Match Gold rewards require an active Gold currency."});
  const bundles=[...[...v.accountLevels,...v.masteryLevels,...v.objectives].map(x=>x.reward),...Object.values(v.bundles)];
  for(const b of bundles)for(const id of Object.keys(b.currencies))if(!v.currencies.some(x=>x.id===id&&(!b.currencies[id]||x.active)))c.addIssue({code:"custom",message:"Reward references an unknown or inactive currency."});
});
export type EconomyRules=z.infer<typeof economySchema>;
const reward=(gold=0,xp=0):RewardBundle=>({currencies:gold?{gold}:{},xp,mastery:0,cards:[],entitlements:[]});
export const DEFAULT_ECONOMY:EconomyRules=economySchema.parse({
  label:"Provisional DEV economy",enabled:true,timeZone:"UTC",currencies:[{id:"gold",name:"Gold",description:"Earned through eligible gameplay and objectives.",active:true},{id:"aether",name:"Aether",description:"Premium currency; live purchases disabled.",active:true}],
  match:{normal:{win:25,draw:12,loss:8},xp:{win:60,draw:40,loss:30},mastery:30,minSeconds:30,minPlacements:3,forfeitMinSeconds:90,forfeitMinPlacements:5,cooldownSeconds:15,dailyLimit:100,diminishAfter:20,diminishBasisPoints:5000},
  accountLevels:[0,100,250,450,700,1000,1400,1900,2500,3200,4000,5000].map((xp,i)=>({xp,reward:reward(i?25+i*5:0)})),
  masteryLevels:[0,100,300,600,1000,1500,2200,3000].map((xp,i)=>({xp,reward:reward(i?50:0)})),dailyGraceDays:3,
  objectives:[
    {id:"intro-account",label:"A new beginning",description:"Create an account after DEV rewards are activated.",period:"intro",event:"account_created",target:1,reward:reward(100),claimAutomatically:true,enabled:true},
    {id:"intro-tutorial",label:"Ready to play",description:"Read the guide, view your collection, save a valid deck and complete an eligible battle.",period:"intro",event:"tutorial_completed",target:1,reward:reward(150),claimAutomatically:true,enabled:true},
    {id:"intro-match",label:"First completed battle",description:"Complete an eligible normal battle.",period:"intro",event:"match_completed",target:1,reward:reward(50),claimAutomatically:true,enabled:true},
    {id:"intro-win",label:"First victory",description:"Win an eligible normal battle.",period:"intro",event:"match_won",target:1,reward:reward(100),claimAutomatically:true,enabled:true},
    {id:"intro-guide",label:"Placement and scoring",description:"Read the introductory guide.",period:"intro",event:"guide_viewed",target:1,reward:reward(),enabled:true},
    {id:"intro-collection",label:"Meet your Kindred",description:"Open your collection.",period:"intro",event:"collection_viewed",target:1,reward:reward(),enabled:true},
    {id:"intro-deck",label:"Build a formation",description:"Save a valid ordinary deck.",period:"intro",event:"deck_saved",target:1,reward:reward(),enabled:true},
    {id:"intro-ability",label:"Card abilities",description:"Resolve an ability in an eligible battle.",period:"intro",event:"ability_used",target:1,reward:reward(),enabled:true},
    {id:"intro-evolution",label:"An evolving formation",description:"Perform an evolution in an eligible battle.",period:"intro",event:"evolution",target:1,reward:reward(),enabled:true},
    {id:"daily-complete",label:"Three battles",description:"Complete three eligible battles today.",period:"daily",event:"match_completed",target:3,reward:reward(50),enabled:true},
    {id:"daily-win",label:"Two victories",description:"Win two eligible battles today.",period:"daily",event:"match_won",target:2,reward:reward(75),enabled:true},
    {id:"daily-evolve",label:"Evolving tactics",description:"Perform three eligible evolutions today.",period:"daily",event:"evolution",target:3,reward:reward(60),enabled:true},
    {id:"daily-nature",label:"Nature prevails",description:"Win with meaningful Nature participation.",period:"daily",event:"match_won",kindred:"Nature",target:1,reward:reward(75),enabled:true},
    {id:"weekly-complete",label:"Weekly campaign",description:"Complete twenty eligible battles this week.",period:"weekly",event:"match_completed",target:20,reward:reward(300),enabled:true},
    {id:"weekly-diversity",label:"Three Kindreds",description:"Win with actual participation from three different Kindreds this week.",period:"weekly",event:"match_won",target:3,aggregation:"distinct_kindreds",reward:reward(350),enabled:true},
    ...["Nature","Mythical","Arcane","Undead","Constructs"].map((kindred,i)=>({id:"weekly-additional-"+kindred.toLowerCase(),label:kindred+" field experience",description:"Complete twenty eligible battles with actual "+kindred+" participation this week for an explicit tradeable additional copy.",period:"weekly",event:"match_completed",kindred,target:20,reward:{...reward(),cards:[{cardId:["n013","m014","a014","u014","c014"][i],quantity:1,mode:"additional",tradeable:true}]},enabled:true})),
    {id:"achievement-veteran",label:"Veteran",description:"Complete 100 eligible battles.",period:"permanent",event:"match_completed",target:100,reward:{...reward(500),cards:[{kindred:"Nature",quantity:1,mode:"additional",tradeable:true}]},enabled:true},
  ],bundles:{"development-welcome":reward(100)},promotions:[],competitive:{enabled:false,initialRating:1000,kFactor:32,formats:["founders"],ranks:[{id:"unranked",label:"Unranked",minimum:0}]},
});
export function scaleReward(amount:number,basisPoints:number){return Number(BigInt(amount)*BigInt(basisPoints)/10000n);}
export function levelAt(xp:number,levels:{xp:number}[]){let level=1;for(let i=0;i<levels.length;i++)if(xp>=levels[i].xp)level=i+1;return {level,next:levels[level]?.xp??null,into:xp-levels[level-1].xp};}
export function allocateMastery(budget:number,participation:Record<string,number>){
  const pairs=Object.entries(participation).filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)),total=pairs.reduce((n,[,v])=>n+v,0),result:Record<string,number>={};if(!total)return result;
  let used=0;for(const [k,n]of pairs){result[k]=Math.floor(budget*n/total);used+=result[k];}
  const order=pairs.map(([k,n])=>({k,remainder:budget*n%total})).sort((a,b)=>b.remainder-a.remainder||a.k.localeCompare(b.k));for(let i=0;i<budget-used;i++)result[order[i%order.length].k]++;return result;
}
export function objectivePeriod(period:string,now:Date,grace:number){const day=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));if(period==="weekly")day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);const end=new Date(day);end.setUTCDate(end.getUTCDate()+(period==="weekly"?7:1));return period==="intro"||period==="permanent"?{key:"lifetime",start:null,end:null,claimUntil:null}:{key:day.toISOString().slice(0,10),start:day.toISOString(),end:end.toISOString(),claimUntil:new Date(end.getTime()+grace*86400000).toISOString()};}
