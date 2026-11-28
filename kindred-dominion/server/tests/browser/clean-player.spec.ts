import {test,expect} from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {readConfig} from "../../config";
import {database,target} from "../../db";
import {releaseServices} from "./release-services";
import {register,nav,chooseStarter,playerApi} from "./player-helpers";
const enabled=process.env.KINDRED_CLEAN_PLAYER_ACCEPT==="yes",config=readConfig(),pool=database(config),services=releaseServices(config.apiPort,Number(new URL(config.origin).port));
if(enabled&&(config.environment!=="integration"||config.apiPort!==3126||config.origin!=="http://127.0.0.1:5297"||config.localTestingAcquisition||config.commerceMode!=="disabled"))throw Error("Clean acceptance requires its dedicated registered disposable target");
test.use({baseURL:config.origin,viewport:{width:1440,height:1000}});
test.beforeAll(async()=>{if(!enabled)return;if(execFileSync("git",["status","--porcelain"],{encoding:"utf8"}).trim())throw Error("A clean committed checkout is required");await target(pool,config);await services.start();});
test.afterAll(async()=>{await services.stop();await pool.end();});
test("clean production player checkout supplies all founding artwork, readable cards and ordinary account onboarding",async({page,context})=>{
 test.skip(!enabled);test.setTimeout(120000);expect((await context.storageState()).origins).toEqual([]);
 await register(page,"clean_player_"+crypto.randomBytes(6).toString("hex"),crypto.randomBytes(26).toString("base64url"));
 const profile=(await playerApi(page,"/profile")).body.player;expect(profile.role).toBe("player");expect((await playerApi(page,"/collection")).body.inventory).toHaveLength(0);
 await nav(page,"Card Catalog");await expect(page.locator(".player-catalog-card")).toHaveCount(150);
 const catalog=(await playerApi(page,"/catalog")).body.content,manifest=await page.request.get("/assets/manifest.json").then(r=>r.json());expect(manifest.format).toBe("kindred-dominion-player-assets");expect(manifest.assets).toHaveLength(152);
 const refs=Object.fromEntries(catalog.cards.map((c:any)=>{const a=catalog.assets.find((a:any)=>a.id===c.collectible.artworkId);if(!a)throw Error("Missing published artwork for "+c.id);return[c.id,a];}));
 const images=await page.locator(".player-catalog-card").evaluateAll(async(elements)=>Promise.all(elements.map(async element=>{const image=element.querySelector("img")!,face=element.querySelector(".collectible-card")!.getBoundingClientRect();if(image.loading!=="lazy")throw Error("Runtime artwork must remain lazy by default");image.loading="eager";await image.decode();return {id:element.getAttribute("data-card-id")!,path:new URL(image.currentSrc).pathname,ownOrigin:new URL(image.currentSrc).origin===location.origin,width:image.naturalWidth,height:image.naturalHeight,faceRatio:face.height/face.width};})));
 for(const image of images){expect(image.path).toBe("/"+refs[image.id].path);expect(image.ownOrigin).toBe(true);expect(image.width).toBeGreaterThan(0);expect(image.width).toBe(refs[image.id].width);expect(image.height).toBe(refs[image.id].height);expect(image.faceRatio).toBeCloseTo(4/3,1);}
 expect((await playerApi(page,"/collection")).body.inventory).toHaveLength(0);
 await page.getByRole("button",{name:/^Inspect N001 /}).click();await expect(page.getByRole("region",{name:"Readable card information"})).toBeVisible();await page.getByRole("button",{name:"Close card inspection",exact:true}).click();
 await nav(page,"My Collection");await chooseStarter(page,"Nature");const collection=(await playerApi(page,"/collection")).body;expect(new Set(collection.inventory.map((i:any)=>i.card_id)).size).toBe(30);expect((await playerApi(page,"/decks")).body.decks[0].cards).toHaveLength(15);await nav(page,"Learn to play");await expect(page.getByRole("region",{name:"Reward-free practice"})).toBeVisible();
 expect((await playerApi(page,"/admin/configuration/economy")).status).toBe(403);await expect(page.getByRole("button",{name:"Developer Studio",exact:true})).toHaveCount(0);
 const master=catalog.assets.find((a:any)=>a.source)?.source;if(!master)throw Error("Expected the founding source reference for this proof");const response=await page.request.get("/"+master.path);expect(response.headers()["content-type"]??"").not.toContain("image/");expect(crypto.createHash("sha256").update(await response.body()).digest("hex")).not.toBe(master.sha256);
 await fs.mkdir(".local/v1.6i45",{recursive:true});await fs.writeFile(".local/v1.6i45/clean-player-receipt.json",JSON.stringify({sourceCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),cleanCheckout:true,emptyBrowserStorage:true,ordinaryPlayer:true,foundingCards:150,decodedRepositoryImages:images.length,playerAssets:manifest.assets.length,sourceMastersServed:false,browserArtworkImportRequired:false,starterUnique:30,recommendedBattleDeck:15,ownerDevTouched:false,hostedTouched:false},null,2));
});
