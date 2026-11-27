import {expect,type Page} from "@playwright/test";
export const nav=(page:Page,name:string)=>page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name,exact:true}).click();
export async function playerApi(page:Page,path:string,method="GET",body?:unknown){return page.evaluate(async({path,method,body})=>{const session=await fetch("/api/session").then(r=>r.json()),response=await fetch(`/api${path}`,{method,headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrf},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};},{path,method,body});}
export async function register(page:Page,username:string,password:string,displayName="Test Traveler"){
  await page.goto("/#register");await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Email address",{exact:true}).fill(`${username}@example.test`);await page.getByLabel("Display name",{exact:true}).fill(displayName);await page.getByLabel("Password",{exact:true}).fill(password);await page.getByLabel("Confirm password",{exact:true}).fill(password);
  await expect(page.locator(".player-auth button.primary")).toBeEnabled();await page.getByRole("button",{name:"Create account",exact:true}).click();await expect(page.getByRole("heading",{name:"My Collection",exact:true})).toBeVisible();await expect(page.locator(".player-session")).toContainText(displayName);
}
export async function login(page:Page,username:string,password:string){await page.goto("/#login");await expect(page.locator(".player-auth button.primary")).toBeEnabled();await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Password",{exact:true}).fill(password);await expect(page.locator(".player-auth button.primary")).toBeEnabled();await page.locator(".player-auth").getByRole("button",{name:"Log in",exact:true}).click();await expect(page.getByRole("heading",{name:"My Collection",exact:true})).toBeVisible();}
export async function chooseStarter(page:Page,kindred="Nature"){await page.locator(".player-starter-options").getByRole("button",{name:new RegExp(kindred)}).click();await page.getByRole("button",{name:`Confirm ${kindred} starting collection`,exact:true}).click();await expect(page.getByRole("status").filter({hasText:`${kindred} collection received`})).toBeVisible();await expect(page.locator(".player-onboarding")).toHaveCount(0);}
export async function completeNormalMatch(page:Page,capturePrefix?:string){
  const matches=(await playerApi(page,"/matches")).body.matches;const active=matches.find((match:any)=>match.status!=="finished");if(!active)throw Error("No active match to complete through the UI");
  let value=(await playerApi(page,`/matches/${active.id}`)).body;
  if(value.status==="mulligan"){const hand=page.locator(".player-hand-card");await expect(hand).toHaveCount(5);await expect(hand.first()).toBeVisible();const box=(await hand.first().boundingBox())!;expect(box.width).toBeGreaterThan(150);expect(box.height/box.width).toBeCloseTo(4/3,2);}
  if(capturePrefix)await page.screenshot({path:`${capturePrefix}-opening.png`,fullPage:true});
  for(let turn=0;turn<100&&value.status!=="finished";turn++){
    const response=page.waitForResponse(response=>response.url().endsWith(`/api/matches/${value.id}/actions`)&&response.request().method()==="POST");
    if(value.status==="mulligan")await page.getByRole("button",{name:"Keep hand",exact:true}).click();
    else if(value.legalActions.length){const action=value.legalActions[0],creature=value.hand.find((card:any)=>card.id===action.card),count=value.legalActions.filter((play:any)=>play.card===action.card).length;await page.getByRole("button",{name:`Hand ${creature.name}, ${count} legal positions`,exact:true}).first().click();const position=`${String.fromCharCode(65+action.row)}${action.col+1}`;await page.locator(`.player-battle-tile[data-coordinate="${position}"] .player-tile-action`).click();await page.getByRole("button",{name:"Confirm placement",exact:true}).click();}
    else await page.getByRole("button",{name:"Confirm forced pass",exact:true}).click();
    const completed=await response;expect(completed.ok()).toBe(true);value=await completed.json();
    if(value.status!=="finished")await expect(page.locator(".player-match-main>.player-section-heading .player-eyebrow")).toHaveText(`TURN ${value.turn}`);
    if(capturePrefix&&turn===1)await page.screenshot({path:`${capturePrefix}-battlefield.png`,fullPage:true});
  }
  expect(value.status).toBe("finished");await expect(page.getByRole("region",{name:"Match result"})).toBeVisible();if(capturePrefix)await page.screenshot({path:`${capturePrefix}-result.png`,fullPage:true});return value;
}
