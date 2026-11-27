import {test as base,expect} from "@playwright/test";
import type {BrowserContext} from "@playwright/test";
// These preserved browser-local regression cases exercise the old workspace in
// isolation. Authorization is stubbed only here; real role/security acceptance
// is tested separately against PostgreSQL and the release application.
export async function authorizeLocalWorkspace(context:BrowserContext){
  await context.route("**/api/session",route=>route.fulfill({json:{player:{id:"local-ui-regression",role:"developer"},csrf:"local-ui-only",registration:"closed"}}));
}
export const test=base.extend<{localWorkspace:void}>({localWorkspace:[async({context},use)=>{
  await authorizeLocalWorkspace(context);
  await use();
},{auto:true}]});
export {expect};
export type {Page,BrowserContext} from "@playwright/test";
