import {expect,test} from "@playwright/test";
import crypto from "node:crypto";
import {readConfig} from "../../config";
import {database} from "../../db";
import {issueLocalRecovery} from "../../identity";
import {register,login,nav,chooseStarter,playerApi} from "./player-helpers";
const config=readConfig();if(config.environment!=="integration")throw Error("Player browser identity tests require the owned disposable PostgreSQL environment.");
const pool=database(config),run=crypto.randomBytes(5).toString("hex"),password=crypto.randomBytes(26).toString("base64url"),nextPassword=crypto.randomBytes(26).toString("base64url");
test.afterAll(()=>pool.end());
test("registration, starter ownership, email and password changes persist across logout and browser refresh",async({page})=>{
  const username=`ui_${run}_identity`;await register(page,username,password);await chooseStarter(page);const before=(await playerApi(page,"/collection")).body.inventory;expect(before).toHaveLength(30);
  await nav(page,"Settings");await page.getByLabel("New email address",{exact:true}).fill(`${username}_updated@example.test`);await page.getByLabel("Current password for email change",{exact:true}).fill(password);await page.getByRole("button",{name:"Update email",exact:true}).click();await expect(page.getByText("Email address updated.",{exact:false})).toBeVisible();
  await page.getByLabel("Current password",{exact:true}).fill(password);await page.getByLabel("New password",{exact:true}).fill(nextPassword);await page.getByLabel("Confirm new password",{exact:true}).fill(nextPassword);await page.getByRole("button",{name:"Change password",exact:true}).click();await expect(page.getByText("Password changed.",{exact:false})).toBeVisible();
  await page.reload();await expect(page.locator(".player-session")).toContainText("Test Traveler");await page.getByRole("button",{name:"Log out",exact:true}).click();await expect(page.getByRole("button",{name:"Log out",exact:true})).toHaveCount(0);await login(page,username,nextPassword);
  expect((await playerApi(page,"/collection")).body.inventory).toEqual(before);expect((await playerApi(page,"/profile")).body.player.email).toBe(`${username}_updated@example.test`);await expect(page.getByRole("button",{name:"Developer Studio",exact:true})).toHaveCount(0);
});
test("local recovery consumes an operator-issued code and requires a fresh login",async({page})=>{
  const username=`ui_${run}_recover`;await register(page,username,password);const code=await issueLocalRecovery(pool,config,username);await page.getByRole("button",{name:"Log out",exact:true}).click();await page.goto("/#recover");
  await page.getByLabel("Recovery username",{exact:true}).fill(username);await page.getByLabel("Private recovery code",{exact:true}).fill(code);await page.getByLabel("Recovery new password",{exact:true}).fill(nextPassword);await page.getByLabel("Confirm recovery password",{exact:true}).fill(nextPassword);await page.getByRole("button",{name:"Reset password",exact:true}).click();await expect(page.getByRole("heading",{name:"Welcome back",exact:true})).toBeVisible();
  await login(page,username,nextPassword);expect((await playerApi(page,"/profile")).body.player.username).toBe(username);
});
