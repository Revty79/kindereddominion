import {describe,it,expect} from "vitest";
import {DEFAULT_ECONOMY,economySchema,bundleSchema,allocateMastery,levelAt,objectivePeriod,scaleReward} from "../server/economy-rules";
import {economyDigest} from "../server/economy-hash";
import {scenarios,simulateEconomy,assumptions} from "../scripts/economy-model";
describe("economy rules and deterministic modeling",()=>{
 it("preserves currency identifiers, integer accounting and strictly increasing XP thresholds",()=>{
  expect(economySchema.parse(DEFAULT_ECONOMY)).toEqual(DEFAULT_ECONOMY);expect(scaleReward(999999990001,9999)).toBe(999899990001);
  for(const change of [(x:any)=>x.currencies.splice(0,1),(x:any)=>x.accountLevels[1].xp=0,(x:any)=>x.accountLevels[1].reward.xp=1,(x:any)=>x.match.normal.win=.1,(x:any)=>x.competitive.enabled=true,(x:any)=>x.objectives.push(x.objectives[0]),(x:any)=>x.bundles.bad={...bundleSchema.parse({}),currencies:{unknown:1}}]){const rules=structuredClone(DEFAULT_ECONOMY);change(rules);expect(economySchema.safeParse(rules).success).toBe(false);}
 });
 it("requires explicit first-copy quantity and selector, and an allocated mastery budget",()=>{
  expect(bundleSchema.safeParse({cards:[{cardId:"n001",quantity:2,mode:"first_copy"}]}).success).toBe(false);expect(bundleSchema.safeParse({cards:[{cardId:"n001",kindred:"Nature",quantity:1,mode:"additional"}]}).success).toBe(false);
 });
 it("splits one mastery budget fairly across meaningful participation, including new Kindreds",()=>{
  expect(allocateMastery(30,{Nature:1,Arcane:1,Undead:1})).toEqual({Arcane:10,Nature:10,Undead:10});expect(allocateMastery(7,{Future:2,Nature:1})).toEqual({Future:5,Nature:2});expect(allocateMastery(30,{})).toEqual({});
  for(let budget=0;budget<100;budget++)expect(Object.values(allocateMastery(budget,{Nature:5,Mythical:3,Future:7})).reduce((a,b)=>a+b,0)).toBe(budget);
 });
 it("uses UTC boundaries, Monday weeks, grace periods and lifetime achievements",()=>{
  expect(objectivePeriod("daily",new Date("2026-11-27T23:59:59.999Z"),3)).toMatchObject({key:"2026-11-27",end:"2026-11-28T00:00:00.000Z",claimUntil:"2026-12-01T00:00:00.000Z"});expect(objectivePeriod("weekly",new Date("2026-11-29T04:00:00Z"),3).key).toBe("2026-11-23");expect(objectivePeriod("daily",new Date("2026-11-28T00:00:00Z"),0).key).toBe("2026-11-28");expect(objectivePeriod("permanent",new Date(),3).claimUntil).toBeNull();
 });
 it("does not confuse level thresholds or JSON property ordering with new rewards",()=>{
  expect(levelAt(99,DEFAULT_ECONOMY.accountLevels)).toMatchObject({level:1,next:100});expect(levelAt(100,DEFAULT_ECONOMY.accountLevels).level).toBe(2);expect(economyDigest({a:1,b:{c:2,d:3}})).toBe(economyDigest({b:{d:3,c:2},a:1}));
 });
 it("reproduces ordinary collection completion in exactly 24 new-card packs",()=>{
  expect(assumptions.requiredOrdinaryBoosters).toBe((150-30)/5);for(const scenario of scenarios.filter(s=>s.eligible)){const result=simulateEconomy(scenario);expect(result).toEqual(simulateEconomy(scenario));expect(result.uniqueCards).toBe(150);expect(result.packs).toBe(24);expect(result.completionHour).toBeGreaterThan(0);expect(result.remainingGold).toBeGreaterThanOrEqual(0);expect(result.additionalCopiesModeled).toBe(0);}
 });
 it("rejects rapid surrender farming without inventing negative balances or paid revenue",()=>{
  const result=simulateEconomy(scenarios.at(-1)!);expect(result.earnedGold).toBe(100);expect(result.matches).toBe(0);expect(result.packs).toBe(0);expect(result.uniqueCards).toBe(30);expect(result.completionHour).toBeNull();expect(result.modelOnly).toBe(true);
 });
});
