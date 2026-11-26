import {expect,test,type Page} from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import {readConfig} from "../../config";
import {database,target} from "../../db";
import {keyed,token} from "../../security";
import {publishContent} from "../../catalog";
import {ownerContent} from "../../../src/content/owner";
import {validateRecord} from "../../../src/replay/record";
const config=readConfig();
if(config.environment!=="integration"&&!(config.environment==="dev"&&process.env.KINDRED_ACCEPT_DEV==="yes"))throw Error("Browser fixtures require the owned integration instance or explicit non-destructive DEV acceptance.");
const pool=database(config),run=`${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`,password=crypto.randomBytes(24).toString("base64url"),base=process.env.KINDRED_ACCOUNT_URL??"http://127.0.0.1:5177";
test.beforeAll(async()=>{await target(pool,config);await fs.mkdir(".local/v1.3d",{recursive:true});
  // Isolated synthetic runs share a loopback address. Reset only their own
  // disposable counters, never an owner DEV/TEST/PROD limiter or player record.
  if(config.environment==="integration")await pool.query("DELETE FROM kd.rate_bucket WHERE key=ANY($1)",[["register:","session:","api:"].map(prefix=>prefix+keyed("127.0.0.1",config))]);
});
test.afterAll(async()=>{await pool.end();});
async function account(page:Page,suffix:string,navigate=true){
  const username=`browser_${run}_${suffix}`;let invite:string|undefined;
  if(config.registration==="invite"){invite=token();await pool.query("INSERT INTO kd.invite(token_hash,max_uses,expires_at) VALUES($1,1,now()+interval '1 hour')",[keyed(invite,config)]);}
  if(navigate)await page.goto("/#account");await page.getByRole("button",{name:"Create an account",exact:true}).click();
  await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Display name",{exact:true}).fill(`Validation ${suffix}`);await page.getByLabel("Password",{exact:true}).fill(password);if(invite)await page.getByLabel("Invitation code",{exact:true}).fill(invite);
  await page.getByRole("button",{name:"Create account",exact:true}).click();await expect(page.getByRole("heading",{name:`Welcome, Validation ${suffix}.`,exact:true})).toBeVisible();return username;
}
async function login(page:Page,username:string){await page.goto("/#account");await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Log in",exact:true}).click();await expect(page.getByRole("navigation",{name:"Player account sections"})).toBeVisible();}
const nav=(page:Page,name:string)=>page.getByRole("navigation",{name:"Player account sections"}).getByRole("button",{name,exact:true}).click();
async function api(page:Page,path:string,method="GET",body?:unknown){return page.evaluate(async({path,method,body})=>{const session=await fetch("/api/session").then(r=>r.json());const r=await fetch("/api"+path,{method,headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};},{path,method,body});}
async function chooseNature(page:Page){await page.getByRole("button",{name:/^Nature Strength/}).click();await page.getByRole("button",{name:"Confirm Nature starting collection",exact:true}).click();await expect(page.getByText("Starting Kindred: Nature.",{exact:false})).toBeVisible();}
async function play(page:Page){
  const revisionText=await page.locator(".account-match>p").first().innerText();
  const ready=page.getByRole("button",{name:/^Server hand .*, [1-9][0-9]* legal positions$/});
  if(await ready.count()){await ready.first().click();await page.getByRole("button",{name:/^Server [A-Z][0-9]+: .*legal placement$/}).first().click();await expect(page.locator(".server-preview")).toBeVisible();await page.getByRole("button",{name:"Confirm server placement",exact:true}).click();}
  else await page.getByRole("button",{name:/Pass server turn|Confirm server forced pass/}).click();
  await expect(page.locator(".account-match>p").first()).not.toHaveText(revisionText);
}
test("A–D: new collection, owned decks, persisted computer play, replay and a fresh-device login",async({page,browser})=>{
  test.setTimeout(300000);const username=await account(page,"a");
  for(const kindred of ["Nature","Mythical","Arcane","Undead","Constructs"]){await page.locator(".kindred-choices button").filter({has:page.getByText(kindred,{exact:true})}).click();await expect(page.locator(".account-owned-grid article")).toHaveCount(30);}
  await chooseNature(page);await expect(page.locator(".owned-quantity").filter({hasText:"Owned 1"})).toHaveCount(30);await page.reload();await expect(page.getByText("Starting Kindred: Nature.",{exact:false})).toBeVisible();
  const second=await api(page,"/starting-collection","POST",{kindred:"Mythical",idempotencyKey:crypto.randomUUID()});expect(second.status).toBe(409);
  await nav(page,"Saved decks");await page.getByRole("button",{name:"Create deck",exact:true}).click();await page.getByLabel("Deck name",{exact:true}).fill("Nature saved across devices");await page.getByRole("button",{name:"Use my recommended starter",exact:true}).click();await page.getByRole("button",{name:"Save permanent deck",exact:true}).click();await expect(page.getByRole("heading",{name:"Nature saved across devices",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Create deck",exact:true}).click();await page.getByLabel("Deck name",{exact:true}).fill("Rejected unowned test");await page.getByRole("button",{name:"Use my recommended starter",exact:true}).click();await page.getByRole("button",{name:"Remove deck card 1",exact:true}).click();await page.getByLabel("Add collectible card",{exact:true}).selectOption("m001");await page.getByRole("button",{name:"Add card to deck",exact:true}).click();await page.getByRole("button",{name:"Save permanent deck",exact:true}).click();await expect(page.getByRole("alert")).toContainText("owned 0");await page.getByRole("button",{name:"Cancel deck editing",exact:true}).click();
  await nav(page,"Profile");const player=(await api(page,"/profile")).body.player;await nav(page,"Log out");await login(page,username);await nav(page,"Saved decks");await expect(page.getByRole("heading",{name:"Nature saved across devices",exact:true})).toBeVisible();
  await nav(page,"Matches");await page.getByLabel("Playing deck",{exact:true}).selectOption({label:"Nature saved across devices"});await page.getByRole("button",{name:"Begin persistent match",exact:true}).click();await expect(page.getByRole("button",{name:"Keep server hand",exact:true})).toBeVisible();const created=(await api(page,"/matches")).body.matches[0];const opening=(await api(page,`/matches/${created.id}`)).body;let keep=0;for(const c of opening.hand){if(c.placementType==="standard"&&c.rank===1&&keep++<3)continue;await page.getByRole("button",{name:`Server hand ${c.name}`,exact:true}).click();}await page.getByRole("button",{name:/Keep server hand|Exchange [0-9]+ selected cards/}).click();await expect(page.getByRole("heading",{name:"Your turn.",exact:true})).toBeVisible();
  for(let i=0;i<2;i++)await play(page);
  await expect(page.locator(".account-hand-art").first()).toBeVisible();await expect(page.locator(".account-creature-art").first()).toBeVisible();expect(await page.locator(".account-hand-art").first().evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  const list=(await api(page,"/matches")).body.matches;const id=list[0].id;await page.screenshot({path:`.local/v1.3d/${config.environment}-server-game.png`,fullPage:true});
  await page.reload();await nav(page,"Matches");await page.getByRole("button",{name:"Resume match",exact:true}).first().click();await expect(page.locator(".account-match")).toContainText(id);
  for(let i=0;i<100&&!await page.locator(".result-banner").count();i++)await play(page);
  await expect(page.locator(".result-banner")).toBeVisible();await page.getByRole("button",{name:"Return to account",exact:true}).click();await nav(page,"Matches");await expect(page.getByText(/Verified statistics: 1 matches/)).toBeVisible();await page.getByRole("button",{name:"Review public replay",exact:true}).first().click();await page.getByRole("button",{name:"Final recorded action",exact:true}).click();await expect(page.locator(".account-replay")).toContainText("Finished:");
  const record=(await pool.query("SELECT record FROM kd.match WHERE id=$1 AND player_id=$2",[id,player.id])).rows[0].record;expect(()=>validateRecord(record)).not.toThrow();
  const context=await browser.newContext({baseURL:base}),fresh=await context.newPage();expect((await context.storageState()).origins).toEqual([]);await login(fresh,username);await expect(fresh.getByText("Starting Kindred: Nature.",{exact:false})).toBeVisible();await nav(fresh,"Saved decks");await expect(fresh.getByRole("heading",{name:"Nature saved across devices",exact:true})).toBeVisible();await nav(fresh,"Matches");await expect(fresh.getByText(/Verified statistics: 1 matches/)).toBeVisible();await context.close();
  await fs.writeFile(`.local/v1.3d/${config.environment}-browser-account.private`,JSON.stringify({username,password,playerId:player.id,matchId:id}),{mode:0o600});
});
test("E: controlled isolated publication retains ownership, decks and old match definitions",async({page})=>{
  test.skip(config.environment!=="integration","Controlled numerical revisions are exercised only in the disposable database.");
  await account(page,"e");await chooseNature(page);const before=(await api(page,"/collection")).body.inventory,decks=(await api(page,"/decks")).body.decks;
  await nav(page,"Matches");await page.getByRole("button",{name:"Begin persistent match",exact:true}).click();await expect(page.getByRole("button",{name:"Keep server hand",exact:true})).toBeVisible();let matches=(await api(page,"/matches")).body.matches;const oldId=matches[0].id,old=(await api(page,`/matches/${oldId}`)).body.content.cards[0];await page.getByRole("button",{name:"Return to account",exact:true}).click();
  const changed=ownerContent();changed.id=`browser-controlled-${run}`;changed.name="Controlled browser validation revision";changed.cards[0].name="Field Mouse · controlled validation";changed.cards[0].power++;changed.cards[0].collectible!.definitionRevision++;
  try{await publishContent(pool,changed,"official",true);await page.reload();await page.getByLabel("Search collection",{exact:true}).fill("N001");await expect(page.locator(".account-owned-grid article")).toContainText(changed.cards[0].name);expect((await api(page,"/collection")).body.inventory).toEqual(before);expect((await api(page,"/decks")).body.decks).toEqual(decks);expect((await api(page,`/matches/${oldId}`)).body.content.cards[0]).toEqual(old);await nav(page,"Matches");await page.getByRole("button",{name:"Begin persistent match",exact:true}).click();await expect(page.getByRole("button",{name:"Keep server hand",exact:true})).toBeVisible();matches=(await api(page,"/matches")).body.matches;expect((await api(page,`/matches/${matches[0].id}`)).body.contentVersion).toBe(changed.id);}finally{await publishContent(pool,ownerContent(),"official",true);}
});
test("F: private Studio survives login, imports local content explicitly and rejects ordinary access",async({page,browser})=>{
  const username=await account(page,"f"),player=(await api(page,"/profile")).body.player;
  expect((await api(page,"/developer/workspace")).status).toBe(403);
  await pool.query("UPDATE kd.player SET role='developer' WHERE id=$1",[player.id]);await pool.query("INSERT INTO kd.audit_event(operation,target_id,details) VALUES('acceptance-developer-fixture',$1,'{}')",[player.id]);await page.reload();await nav(page,"Private developer workspace");await page.getByRole("button",{name:"Initialize private Studio from bundled content",exact:true}).click();await page.getByRole("button",{name:"Open saved private Studio",exact:true}).click();
  const studioNav=(name:string)=>page.getByRole("navigation",{name:"Developer Studio sections"}).getByRole("button",{name,exact:true}).click();await studioNav("Card Library");await page.getByRole("button",{name:"Edit Field Mouse",exact:true}).click();await page.getByLabel("Card name",{exact:true}).fill("Private server mouse");await page.getByRole("button",{name:"Save card",exact:true}).first().click();await expect(page.getByText("Card saved to the working draft.",{exact:false})).toBeVisible();await page.getByRole("button",{name:"Return to game",exact:true}).click();await nav(page,"Log out");await login(page,username);await nav(page,"Private developer workspace");await page.getByRole("button",{name:"Open saved private Studio",exact:true}).click();await studioNav("Card Library");await page.getByLabel("Search name or identifier",{exact:true}).fill("Private server mouse");await expect(page.getByRole("button",{name:"Edit Private server mouse",exact:true})).toBeVisible();await page.getByRole("button",{name:"Return to game",exact:true}).click();
  await page.getByRole("button",{name:"Preview local Studio import",exact:true}).click();await expect(page.getByRole("heading",{name:"Import preview",exact:true})).toBeVisible();await expect(page.getByText("No ownership or competitive statistics will be imported.",{exact:true})).toBeVisible();const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download original local backup",exact:true}).click();expect((await download).suggestedFilename()).toContain("before-server-import");await page.getByLabel("I reviewed the conflicts and private-workspace replacement.",{exact:true}).check();await page.getByRole("button",{name:"Import reviewed development snapshot",exact:true}).click();await expect(page.getByText("Development content imported and verified.",{exact:false})).toBeVisible();expect((await api(page,"/collection")).body.inventory).toEqual([]);expect((await api(page,"/progression")).body.stats.matches).toBe(0);
  const context=await browser.newContext({baseURL:base}),ordinary=await context.newPage();await account(ordinary,"ordinary");expect((await api(ordinary,"/developer/workspace")).status).toBe(403);await expect(ordinary.getByRole("button",{name:"Private developer workspace",exact:true})).toHaveCount(0);await context.close();
  await fs.writeFile(`.local/v1.3d/${config.environment}-developer-account.private`,JSON.stringify({username,password,playerId:player.id}),{mode:0o600});
});
test("account switching clears private cached views even if the new account data request fails",async({page})=>{
  test.skip(config.environment!=="integration","Fault injection and additional synthetic accounts stay in the disposable database.");
  await account(page,"cacheA");await chooseNature(page);await nav(page,"Log out");
  await page.route("**/api/collection",route=>route.abort());
  const username=`browser_${run}_cacheB`;
  await page.getByRole("button",{name:"Create an account",exact:true}).click();
  await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Display name",{exact:true}).fill("Validation cacheB");await page.getByLabel("Password",{exact:true}).fill(password);await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.getByRole("alert")).toBeVisible();await expect(page.locator(".owned-quantity").filter({hasText:"Owned 1"})).toHaveCount(0);await expect(page.getByRole("navigation",{name:"Player account sections"})).toHaveCount(0);
  await page.unroute("**/api/collection");await page.reload();await expect(page.getByRole("heading",{name:"Welcome, Validation cacheB.",exact:true})).toBeVisible();expect((await api(page,"/collection")).body.inventory).toEqual([]);
  for(const path of ["/server/.env.local","/.local/v1.3d/browser.env","/server/config.ts"]){const response=await page.request.get(path);expect([403,404]).toContain(response.status());expect((await response.text()).includes(config.password)).toBe(false);}
});
