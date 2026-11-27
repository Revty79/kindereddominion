import {describe,it,expect,vi,afterEach} from "vitest";
import {currentOwnerContent} from "../src/content/current";
import {analyzeDeck,emptyEligibility,type DeckDocument} from "../src/player/deck-analysis";
import {deviceDeckEdits,removeDeviceEdit,recoveryPrefix,validDeckDocument} from "../src/player/deck-recovery";
import type {PlayingFormat,EligibilityCatalog} from "../src/content/eligibility";
const content=currentOwnerContent(),owned=new Map(content.cards.map(c=>[c.id,3]));
const document=(cards:string[]):DeckDocument=>({name:"Custom formation",cards,config:{mode:"standard",scoring:"classic",collection:"mixed"},formatId:null,testingAccess:false});
const mixed=["n001","n002","n002","n003","n004","n005","n006","n007","n008","n009","n010","n011","n012","n013","m001"];
const format:PlayingFormat={id:"test-format",name:"Test format",description:"Declared unit fixture",enabled:true,collections:[],excludeCollections:[],kindreds:[],excludeCards:[],rarities:[],deckSize:15,maxCopies:2,cardLimits:{},standardArtwork:false,eventPool:[]};
const eligibility=(f:PlayingFormat):EligibilityCatalog=>({...emptyEligibility,defaultFormat:f.id,formats:[f]});
afterEach(()=>vi.unstubAllGlobals());
describe("Player deck construction previews",()=>{
  it("counts duplicate quantities and cross-Kindred composition without reserving owned copies",()=>{
    const a=analyzeDeck(document(mixed),content,owned);expect(a.errors).toEqual([]);expect(a.unique).toBe(14);expect(a.additional).toBe(1);expect(a.kindreds).toEqual({Nature:14,Mythical:1});expect(a.addition(content.cards.find(c=>c.id==="n002")!)).toMatchObject({owned:3,selected:2,remaining:1,limit:2,allowed:false});expect(owned.get("n002")).toBe(3);
  });
  it("preserves card-specific copy overrides and existing Free Play owned-copy rules",()=>{
    const mouse=content.cards.find(c=>c.id==="n001")!,wolf=content.cards.find(c=>c.id==="n002")!;
    expect(analyzeDeck(document([]),content,owned).addition(mouse).limit).toBe(mouse.maxCopies??2);
    const d=document(["n002","n002"]);d.config.mode="free";expect(analyzeDeck(d,content,owned).addition(wolf)).toMatchObject({allowed:true,limit:15,remaining:1});
    expect(analyzeDeck(document(["n002","n002"]),content,new Map([["n002",1]])).errors.some(e=>e.includes("requires 2, owned 1"))).toBe(true);
  });
  it("applies selected competitive exclusions, copy caps, retirement and explicit Kindred restrictions",()=>{
    const f={...format,maxCopies:1,excludeCards:["m001"]},a=analyzeDeck(document(mixed),content,owned,eligibility(f));
    expect(a.errors.some(e=>e.includes("at most 1"))).toBe(true);expect(a.errors.some(e=>e.includes("excluded"))).toBe(true);
    const d=document([]);d.config.collection="Nature";expect(analyzeDeck(d,content,owned).addition(content.cards.find(c=>c.id==="m001")!).allowed).toBe(false);
    expect(analyzeDeck(document([]),content,owned,{...emptyEligibility,retired:["n001"]}).addition(content.cards[0]).allowed).toBe(false);
    expect(analyzeDeck(document([]),content,owned,eligibility({...format,cardLimits:{n002:0}})).addition(content.cards.find(c=>c.id==="n002")!).allowed).toBe(false);
  });
  it("keeps unconventional legal decks playable while labeling evolution/development warnings separately",()=>{
    const cards=Array.from({length:15},(_,n)=>"n"+String(n+16).padStart(3,"0")),a=analyzeDeck(document(cards),content,owned);
    expect(a.errors).toEqual([]);expect(a.warnings.some(w=>w.includes("predecessor"))).toBe(true);expect(a.warnings.some(w=>w.includes("rank-one"))).toBe(true);
    expect(a.evolutions.find(e=>e.id==="n027")?.supported).toBe(false);
  });
  it("matches the engine's explicitly empty predecessor lists instead of treating them as unrestricted",()=>{
    const fixture=structuredClone(content);fixture.cards.find(c=>c.id==="n027")!.prerequisite={definitions:[]};
    const result=analyzeDeck(document(["n002","n027"]),fixture,owned);
    expect(result.evolutions[0]).toMatchObject({possible:[],selected:[],supported:false});
  });
  it("does not silently remove missing identities or quantities and does not require the original Kindred",()=>{
    const cards=[...mixed.slice(0,14),"retired-example"],a=analyzeDeck(document(cards),content,new Map([["n001",1]]));
    expect(a.errors.some(e=>e.includes("Unknown card"))).toBe(true);expect(a.errors.some(e=>e.includes("owned 0"))).toBe(true);expect(cards).toHaveLength(15);
    expect(analyzeDeck(document([]),content,new Map([["m001",1]])).addition(content.cards.find(c=>c.id==="m001")!).allowed).toBe(true);
  });
});
describe("Account-scoped interrupted deck recovery",()=>{
  it("retains distinct tab edits, excludes other accounts, and never deletes a newer local edit",()=>{
    const data=new Map<string,string>();vi.stubGlobal("localStorage",{get length(){return data.size;},key:(n:number)=>[...data.keys()][n],getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});
    for(const [player,tab]of[["alice","one"],["alice","two"],["bob","one"]])data.set(recoveryPrefix(player,"deck-id")+tab,JSON.stringify({schema:1,deckId:"deck-id",baseRevision:1,revision:0,document:document(["n001"]),at:1}));
    const entries=deviceDeckEdits("alice");expect(entries).toHaveLength(2);data.set(entries[0].key,entries[0].raw+" ");removeDeviceEdit(entries[0]);expect(data.has(entries[0].key)).toBe(true);expect(deviceDeckEdits("bob")).toHaveLength(1);
  });
  it("rejects malformed or oversized recovery documents instead of replacing server data",()=>{
    expect(validDeckDocument(document(["n001"]))).toBe(true);expect(validDeckDocument({...document([]),cards:Array(16).fill("n001")})).toBe(false);expect(validDeckDocument({...document([]),config:null})).toBe(false);
    vi.stubGlobal("localStorage",{get length(){throw Error("Disabled by browser");}});expect(deviceDeckEdits("alice")).toEqual([]);
  });
});
