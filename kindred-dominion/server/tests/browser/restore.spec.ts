import {expect,test} from "@playwright/test";
import fs from "node:fs/promises";
import {readConfig} from "../../config";
import {database} from "../../db";
import {releaseServices} from "./release-services";
import {login,nav,playerApi} from "./player-helpers";
const enabled=process.env.KINDRED_RESTORE_ACCEPT==="yes",config=readConfig(),services=releaseServices(config.apiPort,Number(new URL(config.origin).port),"dist");
test.use({baseURL:config.origin});test.beforeAll(async()=>{if(enabled){expect(config.environment).toBe("integration");expect(config.database).toMatch(/^kd_restore_[0-9a-f]+$/);await services.start();}});test.afterAll(()=>services.stop());
test("restored disposable backup serves persisted player accounts, rewards, decks, replay and archived private Studio",async({page,context})=>{
  test.skip(!enabled,"Requires an isolated backup restore and matching private acceptance checkpoints.");expect((await context.storageState()).origins).toEqual([]);
  const player=JSON.parse(await fs.readFile(".local/v1.4/collection.private","utf8")),developer=JSON.parse(await fs.readFile(".local/v1.4/studio.private","utf8"));
  await login(page,player.username,player.password);expect((await playerApi(page,"/collection")).body.inventory).toEqual(player.inventory);expect((await playerApi(page,"/decks")).body.decks).toEqual(player.decks);expect((await playerApi(page,"/progression")).body.stats).toEqual(player.stats);
  await nav(page,"Match history");await page.getByRole("button",{name:"Watch replay",exact:true}).first().click();await page.getByRole("button",{name:"Final position",exact:true}).click();await expect(page.locator(".player-public-replay .collectible-card").first()).toBeVisible();
  await page.getByRole("button",{name:"Log out",exact:true}).click();await login(page,developer.username,developer.password);await nav(page,"Developer Studio");await page.getByRole("button",{name:"Open saved private Studio",exact:true}).click();await page.getByRole("navigation",{name:"Developer Studio sections"}).getByRole("button",{name:"Card Library",exact:true}).click();const restored=(await playerApi(page,"/developer/workspace")).body.workspace;await expect(page.getByRole("button",{name:`Edit ${restored.working.cards[0].name}`,exact:true})).toBeVisible();
  const pool=database(config);try{const histories=(await pool.query("SELECT workspace FROM kd.studio_workspace_history WHERE player_id=$1",[developer.playerId])).rows;expect(histories.some(row=>row.workspace.working.cards.some((card:any)=>card.id==="n001"&&card.name==="Private server mouse"))).toBe(true);expect(histories.some(row=>row.workspace.replays.length>0)).toBe(true);}finally{await pool.end();}
  await page.screenshot({path:".local/v1.4/E-restored-studio.png",fullPage:false});
});
