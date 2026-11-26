import {expect,test} from "@playwright/test";
test("isolated card study presents seven actual cards at three scales with full inspection",async({page})=>{
  await page.goto("/card-design.html");const cards=page.locator(".design-gallery .collectible-card");await expect(cards).toHaveCount(7);await expect(page.getByText("AWAITING OWNER APPROVAL",{exact:true})).toBeVisible();
  await expect(cards.locator("img")).toHaveCount(7);const first=page.locator('.design-gallery [data-card-id="n003"]');await expect(first).toContainText("Red Fox");await expect(first.locator(".collectible-power b")).toHaveText("2");await expect(page.locator('[data-card-id="n027"] .collectible-requirement')).toContainText("N002 Wolf Cub");await expect(page.locator('[data-card-id="n026"] .collectible-rank')).toContainText("REPLACE");
  const inspection=(await first.boundingBox())!.width;await page.getByRole("button",{name:"Player hand",exact:true}).click();const hand=(await first.boundingBox())!.width;expect(hand).toBeLessThan(inspection);await page.getByRole("button",{name:"Battlefield",exact:true}).click();expect((await first.boundingBox())!.width).toBeLessThan(hand);
  await page.getByRole("button",{name:"Inspect Red Fox",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Flexible expansion.");await expect(page.getByRole("dialog").locator(".collectible-power b")).toHaveText("2");await page.getByRole("button",{name:"Close card inspection",exact:true}).click();
  await page.goto("/");await expect(page.locator(".collectible-card")).toHaveCount(0);
});
