import {expect,test} from "@playwright/test";
import crypto from "node:crypto";
import {readConfig} from "../../config";
import {register,nav,chooseStarter,playerApi,completeNormalMatch} from "./player-helpers";
const config=readConfig();if(config.environment!=="integration")throw Error("Match browser acceptance requires owned disposable PostgreSQL.");
test("selects a published opponent, exchanges an opening card, resumes after reload and completes a saved Domination battle",async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await register(page,`battle_${crypto.randomBytes(6).toString("hex")}`,crypto.randomBytes(26).toString("base64url"));await chooseStarter(page,"Nature");await nav(page,"Play");
  await expect(page.getByRole("button",{name:"Begin match",exact:true})).toBeEnabled();await page.getByLabel("Opponent",{exact:true}).selectOption("owner-constructs-bastion");await page.getByLabel("Game mode",{exact:true}).selectOption("domination");await expect(page.getByRole("region",{name:"Match settings review"})).toContainText("15 owned cards");await page.locator(".player-battle-preview-cards img").evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));await page.screenshot({path:".local/v1.4/D-setup.png",fullPage:true});
  await page.getByRole("button",{name:"Begin match",exact:true}).click();await expect(page.getByRole("button",{name:"Keep hand",exact:true})).toBeVisible();await page.locator(".player-hand-card").first().click();await expect(page.locator(".player-hand-card").first()).toHaveAttribute("aria-pressed","true");
  const response=page.waitForResponse(response=>response.url().endsWith("/actions")&&response.request().method()==="POST");await page.getByRole("button",{name:"Exchange 1 selected cards",exact:true}).click();expect((await response).ok()).toBe(true);
  const active=(await playerApi(page,"/matches")).body.matches[0],saved=(await playerApi(page,`/matches/${active.id}`)).body;expect(saved.opponent.name).toBe("Iron Bastion");expect(saved.configuration.scoring).toBe("domination");
  await page.reload();await page.getByRole("button",{name:/^Resume domination match/}).click();const resumed=(await playerApi(page,`/matches/${active.id}`)).body;expect(resumed.board).toEqual(saved.board);expect(resumed.revision).toBe(saved.revision);
  const result=await completeNormalMatch(page,".local/v1.4/D");expect(result.result.reason).not.toBe("surrender");await expect(page.locator('.owner-1 .collectible-influence[aria-label^="Territory influence facing left"]')).not.toHaveCount(0);await expect(page.locator('.owner-0 .collectible-influence[aria-label^="Territory influence facing right"]')).not.toHaveCount(0);
  await page.getByRole("region",{name:"Match result"}).getByRole("button",{name:"Return to main menu",exact:true}).click();await nav(page,"Match history");await page.getByRole("button",{name:"Watch replay",exact:true}).click();await page.getByRole("button",{name:"Final position",exact:true}).click();await expect(page.locator(".player-public-replay .collectible-card")).not.toHaveCount(0);
  const stats=(await playerApi(page,"/progression")).body.stats;expect(stats.matches).toBe(1);expect(stats.wins+stats.losses+stats.draws).toBe(1);expect(errors).toEqual([]);
});
