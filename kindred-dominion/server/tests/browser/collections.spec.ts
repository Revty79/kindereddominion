import {expect,test} from "@playwright/test";
import crypto from "node:crypto";
import {readConfig} from "../../config";
import {database} from "../../db";
import {publishContent} from "../../catalog";
import {currentOwnerContent} from "../../../src/content/current";
import {register,login,nav,chooseStarter,playerApi,completeNormalMatch} from "./player-helpers";
const config=readConfig();if(config.environment!=="integration"||!config.localTestingAcquisition)throw Error("Collection acceptance requires isolated PostgreSQL with explicitly enabled testing acquisition.");
const pool=database(config),username=`journey_${crypto.randomBytes(6).toString("hex")}`,password=crypto.randomBytes(26).toString("base64url");
test.beforeAll(()=>publishContent(pool,currentOwnerContent(),"official",true));test.afterAll(()=>pool.end());
test("player creates an owned custom deck through a draft, completes a normal battle and opens the one-time testing sampler",async({page})=>{
  test.setTimeout(240000);page.on("pageerror",error=>console.error("Player application error:",error.message));await register(page,username,password);await chooseStarter(page,"Arcane");
  await nav(page,"Deck Builder");await page.getByRole("button",{name:"Create deck",exact:true}).click();await page.getByLabel("Deck name",{exact:true}).fill("Arcane custom formation");
  for(let n=1;n<=3;n++){const number=`A${String(n).padStart(3,"0")}`;await page.getByRole("searchbox",{name:"Search cards",exact:true}).fill(number);await page.getByRole("button",{name:`Add ${number} to deck`,exact:true}).click();}
  await page.getByRole("button",{name:"Save draft",exact:true}).click();let decks=(await playerApi(page,"/decks")).body.decks,draft=decks.find((deck:any)=>deck.name==="Arcane custom formation");expect(draft).toMatchObject({draft:true,legal:false});expect(draft.cards).toHaveLength(3);
  await page.reload();await page.getByRole("button",{name:"Edit Arcane custom formation",exact:true}).click();
  for(let n=4;n<=15;n++){const number=`A${String(n).padStart(3,"0")}`;await page.getByRole("searchbox",{name:"Search cards",exact:true}).fill(number);await page.getByRole("button",{name:`Add ${number} to deck`,exact:true}).click();}
  await expect(page.getByRole("button",{name:"Save deck",exact:true})).toBeEnabled();await page.getByRole("button",{name:"Save deck",exact:true}).click();
  const formation=page.locator(".player-deck-grid>.player-panel").filter({has:page.getByRole("heading",{name:"Arcane custom formation",exact:true})});await formation.getByRole("button",{name:"Select for battle",exact:true}).click();await expect(formation).toContainText("Selected for battle");
  await formation.getByRole("button",{name:"Duplicate",exact:true}).click();const duplicate=page.locator(".player-deck-grid>.player-panel").filter({has:page.getByRole("heading",{name:"Arcane custom formation copy",exact:true})});await expect(duplicate).toBeVisible();page.once("dialog",dialog=>dialog.accept());await duplicate.getByRole("button",{name:"Delete",exact:true}).click();await expect(duplicate).toHaveCount(0);
  decks=(await playerApi(page,"/decks")).body.decks;const selected=decks.find((deck:any)=>deck.name==="Arcane custom formation"),before=(await playerApi(page,"/collection")).body.inventory;expect(selected.legal).toBe(true);expect(selected.draft).toBe(false);
  await page.getByRole("button",{name:"Log out",exact:true}).click();await expect(page.getByRole("button",{name:"Log out",exact:true})).toHaveCount(0);await login(page,username,password);expect((await playerApi(page,"/collection")).body.inventory).toEqual(before);expect((await playerApi(page,"/decks")).body.decks.find((deck:any)=>deck.id===selected.id).cards).toEqual(selected.cards);
  await nav(page,"Play");await page.getByLabel("Battle deck",{exact:true}).selectOption(selected.id);await page.getByRole("button",{name:"Begin match",exact:true}).click();await expect(page.getByRole("button",{name:"Keep hand",exact:true})).toBeVisible();const result=await completeNormalMatch(page,".local/v1.4/C");expect(result.result.reason).not.toBe("surrender");
  await page.getByRole("region",{name:"Match result"}).getByRole("button",{name:"Return to main menu",exact:true}).click();await nav(page,"Card Packs");await page.getByRole("button",{name:"Claim one testing sampler",exact:true}).click();await page.getByRole("button",{name:"Open sampler",exact:true}).click();await expect(page.getByRole("region",{name:"Received pack cards"})).toBeVisible();await expect(page.locator(".player-received-cards .collectible-card")).toHaveCount(3);await page.locator(".player-received-cards img").evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));await page.screenshot({path:".local/v1.4/C-pack.png",fullPage:true});
  const inventory=(await playerApi(page,"/collection")).body.inventory;expect(inventory).toHaveLength(32);expect(inventory.find((row:any)=>row.card_id==="a001").quantity).toBe(2);
  await page.reload();await expect(page.getByRole("button",{name:"Claim one testing sampler",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Review received cards",exact:true}).click();expect((await playerApi(page,"/collection")).body.inventory).toEqual(inventory);
  expect((await playerApi(page,"/progression")).body.stats.matches).toBe(1);await nav(page,"Match history");await expect(page.locator(".player-history>.player-panel")).toHaveCount(1);
});
