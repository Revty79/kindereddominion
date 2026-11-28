import {expect,test} from "./practice-fixture";
import {currentOwnerContent} from "../../src/content/current";
import {validateRecord} from "../../src/replay/record";
const pack=currentOwnerContent();
test("founding artwork covers the library, builder, Studio preview and fallback",async({page})=>{
  await page.goto("/practice.html");await page.getByRole("button",{name:"Card library",exact:true}).click();const cards=page.locator(".library-grid > article");await expect(cards).toHaveCount(150);await expect(cards.locator(".collectible-art img")).toHaveCount(150);
  for(const card of pack.cards){const image=cards.filter({has:page.locator(".collectible-number",{hasText:card.collectible!.number})}).locator("img");const asset=pack.assets!.find(a=>a.id===card.id)!;expect(["/"+asset.path,"./"+asset.path]).toContain(await image.getAttribute("src"));expect(await image.getAttribute("loading")).toBe("lazy");}
  for(const number of ["N001","N030","M001","M030","A001","A030","U001","U030","C001","C030"]){await page.getByLabel("Search cards",{exact:true}).fill(number);await expect(cards).toHaveCount(1);await expect.poll(()=>cards.locator("img").evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth>0)).toBe(true);}
  await page.getByRole("button",{name:"Close The Founding Kindreds",exact:true}).click();await page.getByRole("button",{name:"Build deck",exact:true}).first().click();await expect(page.locator(".library-grid .collectible-art img")).toHaveCount(150);await page.getByRole("button",{name:/Close Jade.*Deck builder/}).click();
  await page.getByRole("button",{name:"Developer Studio",exact:true}).click();await page.getByRole("navigation",{name:"Developer Studio sections"}).getByRole("button",{name:"Card Library",exact:true}).click();await page.getByRole("button",{name:"Edit Field Mouse",exact:true}).click();await expect(page.locator(".studio-card-preview img")).toBeVisible();
  await page.goto("/practice.html");const asset=pack.assets!.find(a=>a.id==="n001")!;await page.route("**/"+asset.path,route=>route.abort());await page.getByRole("button",{name:"Card library",exact:true}).click();await page.getByLabel("Search cards",{exact:true}).fill("N001");await expect(page.locator(".library-grid img")).toHaveAttribute("src",/^\.?\/assets\/cards\/fallback\.svg$/);
});
for(const [index,kindred] of ["Nature","Mythical","Arcane","Undead","Constructs"].entries())test(`${kindred} completes a computer match with illustrated hand, battlefield and verified replay`,async({page})=>{
  test.setTimeout(180000);await page.goto("/practice.html");await page.getByText("Learning and action playback",{exact:true}).click();await page.getByLabel("Presentation speed",{exact:true}).selectOption("skip");await page.getByText("Learning and action playback",{exact:true}).click();await page.getByLabel("Jade deck",{exact:true}).selectOption(pack.decks[index].id);await page.getByText("Play format & battlefield options",{exact:true}).click();await page.getByLabel("Match seed (optional)",{exact:true}).fill("9461");await page.getByRole("button",{name:/^Begin match/}).click();await page.getByRole("button",{name:"Keep hand",exact:true}).click();
  let placed=false;
  for(let turn=0;turn<100;turn++){
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("kindred-dominion:v1:match")!).game);if(state.phase==="finished")break;
    await expect(page.getByRole("heading",{name:"Jade to command.",exact:true})).toBeVisible();if(state.players[0].hand.length)await expect(page.locator(".hand-card .collectible-art img").first()).toBeVisible();const playable=page.locator(".hand-card:not(.unplayable)");
    if(await playable.count()){await playable.first().click();await page.locator(".cell.legal").first().click();placed=true;}else await page.getByRole("button",{name:/Confirm forced pass|Pass turn/}).click();
    await expect.poll(async()=>{const next=await page.evaluate(()=>JSON.parse(localStorage.getItem("kindred-dominion:v1:match")!).game);return next.phase==="finished"||(next.active===0&&next.turn>state.turn);}).toBe(true);
  }
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("kindred-dominion:v1:match")!));expect(placed).toBe(true);expect(saved.game.phase).toBe("finished");expect(saved.game.fault).toBeNull();await expect(page.locator(".cell img").first()).toBeVisible();expect(()=>validateRecord(saved.record)).not.toThrow();await page.screenshot({path:`.local/founding-artwork/${kindred.toLowerCase()}-finished.png`,fullPage:true});
});
