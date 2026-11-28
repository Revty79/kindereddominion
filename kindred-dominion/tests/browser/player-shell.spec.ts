import {expect,test} from "@playwright/test";
import {currentOwnerContent} from "../../src/content/current";
test.beforeEach(async({page})=>{
  await page.route("**/api/session",route=>route.fulfill({json:{player:null,csrf:"shell-preview",registration:"local"}}));
  await page.route("**/api/catalog",route=>route.fulfill({json:{content:currentOwnerContent()}}));
});
test("ordinary main menu presents published full-bleed cards and functional player navigation",async({page})=>{
  await page.goto("/");await expect(page.getByRole("heading",{name:/Claim your ground/})).toBeVisible();await expect(page.getByRole("button",{name:"Developer Studio",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Card Catalog",exact:true}).click();await expect(page.locator(".player-catalog-card")).toHaveCount(150);
  await page.getByRole("searchbox",{name:"Search cards",exact:true}).fill("N027");await expect(page.locator(".player-catalog-card")).toHaveCount(1);
  await page.getByRole("button",{name:"Inspect N027 Grey Wolf",exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog).toContainText("N002 Wolf Cub");await expect(dialog.locator(".collectible-power b")).toHaveText("4");
  const filled=await dialog.locator(".collectible-card").evaluate(element=>{const face=element.getBoundingClientRect(),image=element.querySelector("img")!.getBoundingClientRect();return Math.abs(face.width/face.height-.75)<.001&&Math.abs(image.width-face.width)<.1&&Math.abs(image.height-face.height)<.1;});expect(filled).toBe(true);
  await page.getByRole("button",{name:"Close card inspection"}).click();await page.getByRole("button",{name:"Play",exact:true}).click();await expect(page.getByRole("heading",{name:"Welcome back",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Create an account",exact:true}).click();await expect(page.getByRole("heading",{name:"Create your account",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Settings",exact:true}).click();await expect(page.getByRole("heading",{name:"Presentation settings",exact:true})).toBeVisible();await expect(page.getByText("Log in to save display settings across your devices. System reduced motion applies by default.",{exact:true})).toBeVisible();await expect(page.getByLabel("Reduce interface motion")).toHaveCount(0);await page.reload();await expect(page.getByRole("heading",{name:"Presentation settings",exact:true})).toBeVisible();
});
test("mobile main menu and catalog stay within the viewport",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/");await expect(page.getByRole("heading",{name:/Claim your ground/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button",{name:"Card Catalog",exact:true}).click();await page.getByRole("searchbox",{name:"Search cards",exact:true}).fill("A015");await expect(page.locator(".player-catalog-card")).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
