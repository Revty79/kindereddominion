import {DEFAULT_ECONOMY,scaleReward,type EconomyRules} from "../server/economy-rules";

export type EconomyScenario={id:string;hoursPerDay:number;daysPerWeek:number;matchesPerHour:number;winRate:number;drawRate:number;eligible:boolean};
export const scenarios:EconomyScenario[]=[
 {id:"casual-free",hoursPerDay:.5,daysPerWeek:4,matchesPerHour:8,winRate:.45,drawRate:.1,eligible:true},
 {id:"average-free",hoursPerDay:1,daysPerWeek:5,matchesPerHour:10,winRate:.55,drawRate:.1,eligible:true},
 {id:"highly-active-free",hoursPerDay:3,daysPerWeek:6,matchesPerHour:10,winRate:.6,drawRate:.1,eligible:true},
 {id:"competitive-normal-ai-proxy",hoursPerDay:2,daysPerWeek:6,matchesPerHour:10,winRate:.7,drawRate:.1,eligible:true},
 {id:"rapid-surrender-attempt",hoursPerDay:4,daysPerWeek:7,matchesPerHour:60,winRate:0,drawRate:0,eligible:false},
];
export function simulateEconomy(scenario:EconomyScenario,options:{rules?:EconomyRules;days?:number;boosterGold?:number;seed?:number;introBoosters?:number;milestonesGold?:number[];timeline?:boolean}={}){
 const rules=options.rules??DEFAULT_ECONOMY,days=options.days??365,price=options.boosterGold??250;
 if(!Number.isSafeInteger(price)||price<=0)throw Error("Reference booster price must be a positive integer.");
 let seed=options.seed??150,random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let gold=0,earned=0,hours=0,matches=0,wins=0,xp=0,mastery=0,level=1,masteryLevel=1,packs=0,freePacks=0,unique=30,firstBoosterHour:number|null=null,completionHour:number|null=null,completionDay:number|null=null,weeklyMatches=0;
 const timeline:any[]=[];const milestones:Record<string,{hours:number;earnedGold:number}>={};const earn=(n:number)=>{gold+=n;earned+=n;for(const target of options.milestonesGold??[]){if(!Number.isSafeInteger(target)||target<1)throw Error("Gold milestones must be positive integer budgets.");if(earned>=target&&!milestones[target])milestones[target]={hours:Math.round(hours*100)/100,earnedGold:earned};}};
 // New-account grant remains bound to the account. Failed participation earns nothing further.
 earn(rules.objectives.find(o=>o.id==="intro-account"&&o.enabled)?.reward.currencies.gold??0);
 for(let day=0;day<days;day++){
  if(day%7===0)weeklyMatches=0;
  if(day%7>=scenario.daysPerWeek)continue;
  const count=Math.floor(scenario.hoursPerDay*scenario.matchesPerHour);let dailyWins=0;
  for(let n=0;n<count;n++){
   hours+=1/scenario.matchesPerHour;if(!scenario.eligible||n>=rules.match.dailyLimit)continue;
   matches++;weeklyMatches++;const sample=random(),outcome=sample<scenario.winRate?"win":sample<scenario.winRate+scenario.drawRate?"draw":"loss";if(outcome==="win"){wins++;dailyWins++;}
   if(matches===1){freePacks=Math.min(24,options.introBoosters??0);unique+=freePacks*5;}
   const basisPoints=n>=rules.match.diminishAfter?rules.match.diminishBasisPoints:10000;
   earn(scaleReward(rules.match.normal[outcome],basisPoints));xp+=scaleReward(rules.match.xp[outcome],basisPoints);mastery+=scaleReward(rules.match.mastery,basisPoints);
   for(const [id,when]of [["intro-match",matches===1],["intro-win",outcome==="win"&&wins===1],["intro-tutorial",matches===1],["daily-complete",n===2],["daily-win",outcome==="win"&&dailyWins===2],["daily-nature",outcome==="win"&&dailyWins===1],["weekly-complete",weeklyMatches===20],["achievement-veteran",matches===100]] as const)if(when){const objective=rules.objectives.find(o=>o.id===id&&o.enabled);earn(objective?.reward.currencies.gold??0);}
   while(level<rules.accountLevels.length&&xp>=rules.accountLevels[level].xp){earn(rules.accountLevels[level].reward.currencies.gold??0);level++;}
   while(masteryLevel<rules.masteryLevels.length&&mastery>=rules.masteryLevels[masteryLevel].xp){earn(rules.masteryLevels[masteryLevel].reward.currencies.gold??0);masteryLevel++;}
   while(unique<150){const size=Math.min(5,150-unique),cost=Math.ceil(price*size/5);if(gold<cost)break;gold-=cost;unique+=size;packs++;firstBoosterHour??=hours;if(unique===150){completionHour=hours;completionDay=day+1;}}
  }
  if(options.timeline)timeline.push({day:day+1,hours,earnedGold:earned,matches,xp,mastery,accountLevel:level,masteryLevel});
 }
 const baseGoldPerHour=scenario.eligible?scenario.matchesPerHour*(scenario.winRate*rules.match.normal.win+scenario.drawRate*rules.match.normal.draw+(1-scenario.winRate-scenario.drawRate)*rules.match.normal.loss):0;
 return {...(options.timeline?{timeline}:{}),...(options.milestonesGold?{goldBudgetMilestones:milestones}:{}),scenario:scenario.id,modelOnly:true,days,hours:Math.round(hours*100)/100,matches,earnedGold:earned,remainingGold:gold,accountXP:xp,accountLevel:level,masteryXP:mastery,masteryLevel,referenceBoosterGold:price,firstBoosterHour,completionHour,completionDay,packs,freePacks,uniqueCards:unique,additionalCopiesModeled:0,baseGoldPerHour,baseBoosterMinutes:baseGoldPerHour?price/baseGoldPerHour*60:null};
}
export const assumptions={version:1,modelOnly:true,referenceOrdinaryBoosterGold:250,referenceTargetedBoosterGold:300,startingUniqueCards:30,foundingUniqueCards:150,guaranteedNewCardsPerOrdinaryBooster:5,requiredOrdinaryBoosters:24,notes:["Prices are simulation references; this milestone has no shop.","Eligible normal computer matches only; competitive scenario is an AI engagement proxy, not ranked multiplayer.","Guide, collection inspection and legal deck save are assumed before the first eligible battle.","Single Nature deck used for mastery and daily Nature wins. Ability, evolution and diversity rewards excluded because their rates depend on actual play.","UTC daily/weekly claims are assumed on completion; no backlogged rewards counted twice.","Additional playable copies, trading, premium spending and genuine cash revenue are excluded.","No artificial delay is added after the remaining 120 cards are acquired in 24 guaranteed-new packs."]};
