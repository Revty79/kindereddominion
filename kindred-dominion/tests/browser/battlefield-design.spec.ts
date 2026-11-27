import {expect,test} from "@playwright/test";

test("full-bleed portrait cards remain separate from tiles and live gameplay state",async({page})=>{
  await page.setViewportSize({width:1600,height:1050});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/battlefield-design.html");
  const tiles=page.locator(".battle-study-tile");await expect(tiles).toHaveCount(5);
  await expect(page.getByText("AWAITING OWNER APPROVAL",{exact:true})).toBeVisible();
  for(let i=0;i<5;i++){
    const tile=tiles.nth(i),card=tile.locator(".collectible-card"),image=card.locator("img");
    await expect.poll(()=>image.evaluate((element:HTMLImageElement)=>element.complete&&element.naturalWidth>0)).toBe(true);
    const bounds=await card.evaluate(element=>{
      const face=element.getBoundingClientRect(),art=element.querySelector("img")!.getBoundingClientRect(),overlay=element.querySelector('[data-layer="permanent"]')!.getBoundingClientRect();
      return {ratio:parseFloat(getComputedStyle(element).aspectRatio.split("/")[0])/parseFloat(getComputedStyle(element).aspectRatio.split("/")[1]),artWidth:art.width,faceWidth:face.width,artHeight:art.height,faceHeight:face.height,overlayWidth:overlay.width};
    });
    expect(bounds.ratio).toBe(.75);expect(bounds.artWidth).toBeCloseTo(bounds.faceWidth,1);expect(bounds.artHeight).toBeCloseTo(bounds.faceHeight,1);expect(bounds.overlayWidth).toBeCloseTo(bounds.faceWidth,1);
    const floor=(await tile.boundingBox())!,face=(await card.boundingBox())!;
    expect(face.x-floor.x).toBeGreaterThan(10);expect(floor.x+floor.width-face.x-face.width).toBeGreaterThan(10);
    await expect(card.locator('[data-layer="gameplay"]')).toHaveCount(0);
  }
  const printed=["2","3","4","2","7"],current=["3","3","5","4","7"];
  for(let i=0;i<5;i++){await expect(tiles.nth(i).locator(".collectible-power b")).toHaveText(printed[i]);await expect(tiles.nth(i).locator(".battle-current-power b")).toHaveText(current[i]);}
  await expect(tiles.nth(2).locator(".collectible-rank")).toContainText("EVOLVE");
  await expect(tiles.nth(3).locator(".collectible-rank")).toContainText("REPLACE");
  await expect(tiles.nth(4).getByLabel("Protected from destruction and weakening")).toBeVisible();
  await expect(page.locator(".battle-total")).toContainText("0 : 0");
  await page.getByRole("button",{name:"Domination",exact:true}).click();await expect(page.locator(".battle-total")).toContainText("3 : 2");await expect(page.locator(".battle-column-context")).toHaveCount(5);
  expect(errors).toEqual([]);
});

test("selection, hover and keyboard inspection leave the printed face unchanged",async({page})=>{
  await page.setViewportSize({width:1600,height:1050});await page.goto("/battlefield-design.html");
  const fox=page.getByRole("button",{name:"Select Red Fox on A1",exact:true}),wolf=page.getByRole("button",{name:"Select Grey Wolf on A3",exact:true});
  await expect(wolf).toHaveAttribute("aria-pressed","true");
  const original=(await fox.boundingBox())!;await fox.hover();await expect.poll(async()=>(await fox.boundingBox())!.y).toBeLessThan(original.y-8);
  await fox.click();await expect(fox).toHaveAttribute("aria-pressed","true");await expect(wolf).toHaveAttribute("aria-pressed","false");
  const inspect=page.getByRole("button",{name:"Inspect Red Fox on A1",exact:true});await inspect.focus();await page.keyboard.press("Enter");
  const dialog=page.getByRole("dialog",{name:"Red Fox full inspection"});await expect(dialog).toBeVisible();await expect(dialog.locator(".collectible-power b")).toHaveText("2");await expect(dialog).toContainText("Current power 3; printed 2; continuous power +1");
  await expect(dialog.locator(".collectible-ability p")).toBeVisible();
  await expect(page.getByRole("button",{name:"Close card inspection"})).toBeFocused();await page.keyboard.press("Tab");await expect(page.getByRole("button",{name:"Close card inspection"})).toBeFocused();
  await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);await expect(inspect).toBeFocused();
});

test("mobile row scrolls locally and supports full-size card inspection",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/battlefield-design.html");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const row=page.getByLabel("Scrollable battlefield row");expect(await row.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);
  await page.getByRole("button",{name:"Inspect Iron Golem on A5",exact:true}).click();
  const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();await expect(dialog.locator(".collectible-ability p")).toBeVisible();await expect(page.getByRole("button",{name:"Close card inspection"})).toBeInViewport();
  const card=dialog.locator(".collectible-card"),face=(await card.boundingBox())!;expect(face.width/face.height).toBeCloseTo(.75,2);expect(face.x).toBeGreaterThanOrEqual(0);expect(face.x+face.width).toBeLessThanOrEqual(390);
  const layout=await card.locator(".collectible-permanent").evaluate(element=>({height:element.clientHeight,content:element.scrollHeight}));expect(layout.content).toBeLessThanOrEqual(layout.height+1);
  await page.getByRole("button",{name:"Close card inspection"}).click();
});

test("the shared face fills its card at hand and collection scales and remains approval gated",async({page})=>{
  await page.setViewportSize({width:1600,height:1050});await page.goto("/card-design.html");
  for(const name of ["Collection / inspection","Player hand"]){
    await page.getByRole("button",{name,exact:true}).click();
    for(const card of await page.locator(".design-gallery .collectible-card").all()){
      const geometry=await card.evaluate(element=>{const face=element.getBoundingClientRect(),art=element.querySelector("img")!.getBoundingClientRect(),overlay=element.querySelector(".collectible-permanent")!;return {ratio:face.width/face.height,filled:Math.abs(art.width-face.width)<.1&&Math.abs(art.height-face.height)<.1,overflow:overlay.scrollHeight-overlay.clientHeight};});
      expect(geometry.ratio).toBeCloseTo(.75,2);expect(geometry.filled).toBe(true);expect(geometry.overflow).toBeLessThanOrEqual(1);
    }
  }
  await page.goto("/");await expect(page.locator(".collectible-card")).toHaveCount(0);
});
