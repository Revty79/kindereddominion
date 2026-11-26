import {expect,test} from "@playwright/test";
import fs from "node:fs/promises";
import {readConfig} from "../../config";
import {database} from "../../db";
test("G: a restored disposable database serves the original accounts, collection, decks, replay and private Studio",async({page})=>{
  test.skip(process.env.KINDRED_RESTORE_ACCEPT!=="yes","Requires the completed DEV backup and isolated restore.");
  const config=readConfig();expect(config.environment).toBe("integration");expect(config.database).toMatch(/^kd_restore_[0-9a-f]+$/);
  const player=JSON.parse(await fs.readFile(".local/v1.3d/dev-browser-account.private","utf8")),developer=JSON.parse(await fs.readFile(".local/v1.3d/dev-developer-account.private","utf8"));
  const login=async(value:any)=>{await page.goto("/#account");await page.getByLabel("Username",{exact:true}).fill(value.username);await page.getByLabel("Password",{exact:true}).fill(value.password);await page.getByRole("button",{name:"Log in",exact:true}).click();await expect(page.getByRole("navigation",{name:"Player account sections"})).toBeVisible();};
  const nav=(name:string)=>page.getByRole("navigation",{name:"Player account sections"}).getByRole("button",{name,exact:true}).click();
  await login(player);await expect(page.getByText("Starting Kindred: Nature.",{exact:false})).toBeVisible();await page.getByLabel("Ownership filter",{exact:true}).selectOption("owned");await expect(page.locator(".account-owned-grid article")).toHaveCount(30);
  await nav("Saved decks");await expect(page.getByRole("heading",{name:"Nature saved across devices",exact:true})).toBeVisible();
  await nav("Matches");await expect(page.getByText(/Verified statistics: 1 matches/)).toBeVisible();await page.getByRole("button",{name:"Review public replay",exact:true}).first().click();await page.getByRole("button",{name:"Final recorded action",exact:true}).click();await expect(page.locator(".account-replay")).toContainText("Finished:");
  await nav("Log out");await login(developer);await nav("Private developer workspace");await page.getByRole("button",{name:"Open saved private Studio",exact:true}).click();await page.getByRole("navigation",{name:"Developer Studio sections"}).getByRole("button",{name:"Card Library",exact:true}).click();await expect(page.getByRole("button",{name:"Edit Field Mouse",exact:true})).toBeVisible();
  const pool=database(config);try{const histories=(await pool.query("SELECT workspace FROM kd.studio_workspace_history WHERE player_id=$1",[developer.playerId])).rows;expect(histories.some(r=>r.workspace.working.cards.some((c:any)=>c.id==="n001"&&c.name==="Private server mouse"))).toBe(true);}finally{await pool.end();}
  await page.screenshot({path:".local/v1.3d/restored-private-studio.png",fullPage:true});
});
