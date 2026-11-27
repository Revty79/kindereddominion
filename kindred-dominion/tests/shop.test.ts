import {describe,it,expect} from "vitest";
import {DEFAULT_SHOP,STANDARD_SLOTS,FIRST_PRICES,ADDITIONAL_PRICES,rarities,weightsSchema,shopSchema,productSchema,slotSchema,formatIssues} from "../server/shop-rules";
import {drawPack,canFill,conditionalChoices,packPlan,seededRandom,weightedRarity} from "../server/shop-draw";
import {ownerContent} from "../src/content/owner";
import {libraryOf} from "../src/content/validation";

const pack=ownerContent(),rules=DEFAULT_SHOP,first=rules.products.find(p=>p.id==="founding-first")!;
describe("shop configuration and exact pack allocation",()=>{
 it("proposes exactly 12/8/5/3/2 per Kindred without changing published gameplay/metadata",()=>{
  expect(shopSchema.parse(rules)).toEqual(rules);for(const kindred of pack.collections)expect(rarities.map(rarity=>pack.cards.filter(c=>c.kindred===kindred.id&&rules.rarities[c.id]===rarity).length)).toEqual([12,8,5,3,2]);expect(pack.cards.every(c=>pack.metadata[c.id].rarity==="Unassigned")).toBe(true);expect(FIRST_PRICES).toEqual({common:75,uncommon:150,rare:300,epic:600,legendary:1200});expect(ADDITIONAL_PRICES.common).toBe(20);
 });
 it("rejects malformed probabilities, duplicate identities and misleading first-copy products",()=>{
  expect(weightsSchema.safeParse({common:7500,uncommon:2000,rare:400,epic:90,legendary:11}).success).toBe(false);expect(weightsSchema.safeParse({...STANDARD_SLOTS[0].weights,common:7499.5}).success).toBe(false);
  for(const change of [(r:any)=>r.products.push(r.products[0]),(r:any)=>r.directFirst.tradeable=true,(r:any)=>r.products[0].quantity=2,(r:any)=>r.products[0].duplicates="allowed",(r:any)=>r.products[0].price=-1,(r:any)=>r.defaultFormat="missing",(r:any)=>r.formats[0].deckSize=20]){const copy=structuredClone(rules);change(copy);expect(shopSchema.safeParse(copy).success).toBe(false);}
 });
 it("uses exact rarity intervals, including the one-in-one-thousand Legendary slot",()=>{
  const weights=STANDARD_SLOTS[0].weights;for(const [value,expected]of [[0,"common"],[7499,"common"],[7500,"uncommon"],[9499,"uncommon"],[9500,"rare"],[9899,"rare"],[9900,"epic"],[9989,"epic"],[9990,"legendary"],[9999,"legendary"]] as const)expect(weightedRarity(weights,()=>value)).toBe(expected);
  expect(()=>weightedRarity(weights,()=>10000)).toThrow("out-of-range");
 });
 it("prevents duplicate first copies and reproduces seeded simulation without a client seed",()=>{
  const eligible=pack.cards.filter(c=>c.kindred!=="Nature"),a=drawPack(first,eligible,rules,new Set(),seededRandom(99)),b=drawPack(first,eligible,rules,new Set(),seededRandom(99));expect(a).toEqual(b);expect(new Set(a.map(r=>r.cardId)).size).toBe(5);expect(a.every(r=>!r.cardId.startsWith("n"))).toBe(true);expect(a[3].rarity).not.toMatch(/common|uncommon/);
 });
 it("reduces the final pack explicitly and reports conditional depleted-pool fallback",()=>{
  const cards=pack.cards.filter(c=>["n001","n002","n003"].includes(c.id)),plan=packPlan(first,cards,rules);expect(plan.size).toBe(3);expect(plan.omittedSlots).toEqual(["slot-4","slot-5"]);const draws=drawPack(first,cards,rules,new Set(),seededRandom(5));expect(new Set(draws.map(r=>r.cardId)).size).toBe(3);expect(draws[2].fallback).toBe(true);expect(draws[2].rarity).toBe("common");expect(packPlan(first,[],rules).feasible).toBe(false);
 });
 it("reserves the only eligible Rare for a strict guaranteed slot",()=>{
  const common=pack.cards.find(c=>c.id==="n001")!,rare=pack.cards.find(c=>c.id==="n021")!,strict=slotSchema.parse({id:"guaranteed-rare",weights:{common:0,uncommon:0,rare:10000,epic:0,legendary:0},depleted:"unavailable"}),earlier=slotSchema.parse({id:"conditional-slot",weights:{common:0,uncommon:0,rare:10000,epic:0,legendary:0},depleted:"available_pool"});
  const product=productSchema.parse({...first,slots:[earlier,strict]}),draw=drawPack(product,[common,rare],rules,new Set(),()=>0);expect(draw.map(r=>r.cardId)).toEqual([common.id,rare.id]);expect(draw[0].fallback).toBe(true);expect(draw[1].fallback).toBe(false);expect(canFill([strict],[common],rules)).toBe(false);expect(conditionalChoices(strict,[],[common],rules,true).totalWeight).toBe(0);
 });
 it("keeps additional-copy repeats explicit and marks only the first lifetime acquisition new",()=>{
  const additional=productSchema.parse({...first,mode:"additional",duplicates:"allowed",slots:STANDARD_SLOTS,tradeable:true}),card=pack.cards.find(c=>c.id==="n001")!,draws=drawPack(additional,[card],rules,new Set(),()=>0);expect(draws).toHaveLength(5);expect(draws.map(r=>r.newCard)).toEqual([true,false,false,false,false]);expect(draws.every(r=>r.cardId===card.id&&r.quantity===1)).toBe(true);
 });
 it("validates the selected deck independently of unrelated premium ownership",()=>{
  const cards=pack.decks[0].cards,library=libraryOf(pack),format=rules.formats[0];expect(formatIssues(cards,library,format,rules)).toEqual([]);expect(formatIssues(cards,library,{...format,excludeCards:[cards[0]]},rules).join(" ")).toContain("excluded");expect(formatIssues(cards,library,{...format,collections:["nonexistent-expansion"]},rules).join(" ")).toContain("allowed collections");expect(formatIssues(cards,library,{...format,maxCopies:0},rules).join(" ")).toContain("at most 0");
 });
 it("matches all five proposed slot distributions in a large deterministic sample",()=>{
  for(let slot=0;slot<STANDARD_SLOTS.length;slot++){const weights=STANDARD_SLOTS[slot].weights,random=seededRandom(1530+slot),counts=Object.fromEntries(rarities.map(r=>[r,0])) as Record<typeof rarities[number],number>,samples=100000;for(let n=0;n<samples;n++)counts[weightedRarity(weights,random)]++;let chi=0;for(const rarity of rarities){const expected=samples*weights[rarity]/10000;if(!expected)expect(counts[rarity]).toBe(0);else chi+=(counts[rarity]-expected)**2/expected;}expect(chi).toBeLessThan(30);}
 });
});
