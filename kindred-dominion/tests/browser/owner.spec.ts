import { expect, test, type Page } from "@playwright/test";
import { signature } from "../../src/replay/record";
import { ownerContent } from "../../src/content/owner";
import type { GameState } from "../../src/engine/types";

const pack = ownerContent();
const readGame = (page: Page): Promise<GameState> => page.evaluate(() => JSON.parse(localStorage.getItem("kindred-dominion:v1:match")!).game);
async function nav(page: Page, name: string) { await page.getByRole("navigation", { name: "Developer Studio sections" }).getByRole("button", { name, exact: true }).click(); }
async function reveal(page: Page) { const button = page.getByRole("button", { name: /reveal my hand/ }); await expect(button).toBeVisible(); await button.click(); }
async function speed(page: Page, value: string) { await page.getByText("Learning and action playback", { exact: true }).click(); await page.getByLabel("Presentation speed", { exact: true }).selectOption(value); await page.getByText("Learning and action playback", { exact: true }).click(); }

test("a clean owner installation exposes all 150 numbered cards, useful filters and preserved development versions", async ({ page, context }) => {
  expect((await context.storageState()).origins).toEqual([]);
  await page.goto("/");
  await expect(page.getByText(/The Founding Kindreds — Owner Design V1/)).toBeVisible();
  await page.getByRole("button", { name: "Card library", exact: true }).click();
  const rows = page.locator(".library-grid article");
  await expect(rows).toHaveCount(150);
  expect(await rows.locator(".collectible-number").allTextContents()).toEqual(pack.cards.map(c => c.collectible!.number));
  for (const [kindred, prefix] of [["Nature", "N"], ["Mythical", "M"], ["Arcane", "A"], ["Undead", "U"], ["Constructs", "C"]]) {
    await page.getByLabel("Kindred", { exact: true }).selectOption(kindred);
    await expect(rows).toHaveCount(30);
    await expect(rows.first().locator(".collectible-number")).toHaveText(`${prefix}001`);
    await expect(rows.last().locator(".collectible-number")).toHaveText(`${prefix}030`);
  }
  await page.getByLabel("Kindred", { exact: true }).selectOption("all");
  await page.getByLabel("Search cards", { exact: true }).fill("N027"); await expect(rows).toHaveCount(1); await expect(rows).toContainText("Grey Wolf"); await expect(rows).toContainText("N002 Wolf Cub");
  await page.getByLabel("Search cards", { exact: true }).fill("");
  await page.getByLabel("Creature classification", { exact: true }).selectOption("Wolf"); await expect(rows).toHaveCount(3);
  await page.getByLabel("Creature classification", { exact: true }).selectOption("all");
  await page.getByLabel("Kindred", { exact: true }).selectOption("Nature");
  await page.getByLabel("Card mechanic", { exact: true }).selectOption("aura");
  await page.getByLabel("Placement type", { exact: true }).selectOption("evolution");
  await page.getByLabel("Minimum base power", { exact: true }).fill("5"); await expect(rows).toHaveCount(1); await expect(rows).toContainText("N028");
  await page.screenshot({ path: ".local/v1.3bc/owner-library-filter.png", fullPage: true });
  await page.getByRole("button", { name: "Close The Founding Kindreds", exact: true }).click();
  await page.getByRole("button", { name: "Developer Studio", exact: true }).click(); await nav(page, "Content Versions and Backups");
  for (const id of ["v1.1-baseline", "founding-kindreds-150-v1", "mechanics-laboratory-v1.3a", "founding-kindreds-owner-v1"]) await expect(page.getByText(id, { exact: true })).toBeVisible();
});

for (const scoring of ["classic", "domination"] as const) test(`owner ${scoring} gameplay previews consequences, steps through actual states and records a completed match`, async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/"); await speed(page, "step");
  for (const deck of pack.decks.slice(0, 5)) { await page.getByLabel("Jade deck", { exact: true }).selectOption(deck.id); await expect(page.getByRole("button", { name: "Begin match" })).toBeEnabled(); }
  await page.getByLabel("Jade deck", { exact: true }).selectOption(scoring === "classic" ? pack.decks[0].id : pack.decks[3].id);
  await page.getByLabel("Amber deck", { exact: true }).selectOption(scoring === "classic" ? pack.decks[1].id : pack.decks[4].id);
  await page.getByRole("button", { name: "Local two-player", exact: true }).click();
  if (scoring === "domination") await page.getByRole("button", { name: /^▦ Domination/ }).click();
  await page.getByText("Play format & battlefield options", { exact: true }).click(); await page.getByLabel("Match seed (optional)", { exact: true }).fill("9461");
  await page.getByRole("button", { name: "Begin match" }).click();
  for (let i = 0; i < 2; i++) { await reveal(page); await page.getByRole("button", { name: "Keep hand", exact: true }).click(); }
  await reveal(page);
  await expect(page.locator(".playability.ready").first()).toBeVisible();
  await page.locator(".hand-card:not(.unplayable)").first().click(); await page.locator(".cell.legal").first().click();
  await expect(page.locator(".preview-score")).toContainText("Immediate points"); await expect(page.locator(".public-consequences li").first()).toBeVisible();
  await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).click();
  const playback = page.getByRole("region", { name: "Action resolution playback" }); await expect(playback).toBeVisible();
  const committed = signature(await readGame(page));
  await page.getByRole("button", { name: "Next resolution step", exact: true }).click();
  expect(signature(await readGame(page))).toBe(committed);
  await page.locator(".cell .creature-name").first().click();
  await expect(page.locator('[role="dialog"] [data-testid="power-breakdown"]')).toBeVisible();
  await page.getByRole("button", { name: "Close Card details", exact: true }).click();
  await expect(page.locator(".hand-card")).toHaveCount(0);
  const viewport = await page.locator(".board-scroll").boundingBox();
  for (const row of await page.locator(".row-score").all()) { const bounds = await row.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1); }
  await page.screenshot({ path: `.local/v1.3bc/owner-${scoring}-recorded-step.png`, fullPage: true });
  await page.getByRole("button", { name: "Skip presentation", exact: true }).click(); expect(signature(await readGame(page))).toBe(committed);
  await expect(page.locator(".row-awarded")).toHaveCount(3);
  if (scoring === "domination") await expect(page.locator(".column-counts > span")).toHaveCount(5);
  for (let i = 0; i < 2; i++) { await reveal(page); await page.getByRole("button", { name: /Confirm forced pass|Pass turn/ }).click(); }
  expect((await readGame(page)).phase).toBe("finished"); expect((await readGame(page)).fault).toBeNull();
  await page.getByRole("button", { name: "New match setup", exact: true }).click(); await page.getByRole("button", { name: "Developer Studio", exact: true }).click(); await nav(page, "Match Replay and Diagnostics");
  await page.getByRole("button", { name: "Final action", exact: true }).click(); await expect(page.getByText(/finished · Winner/)).toBeVisible();
});

test("prepared owner scenarios visibly explain Honeybee aura loss, sacrifice gifts, score bonuses and Phoenix requirements", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/"); await page.getByRole("button", { name: "Developer Studio", exact: true }).click(); await nav(page, "Battlefield Sandbox");
  const scenarios = page.getByLabel("Load saved scenario", { exact: true });
  await scenarios.selectOption("owner-demo-honeybee"); await page.getByRole("button", { name: "Execute scenario", exact: true }).click();
  const hand = page.getByLabel("Sandbox active hand card", { exact: true });
  const play = async (id: string, coordinate: string) => {
    const option = hand.locator("option").filter({ hasText: pack.cards.find(c => c.id === id)!.name }).first();
    await hand.selectOption((await option.getAttribute("value"))!);
    await page.getByRole("button", { name: new RegExp(`^Sandbox ${coordinate}:`) }).click();
    await page.getByRole("button", { name: `Execute placement at ${coordinate}`, exact: true }).click();
  };
  await play("n005", "A1");
  await expect(page.getByRole("button", { name: /^Sandbox B1:/ })).toContainText("3 power");
  await play("a013", "A2"); await expect(page.getByRole("button", { name: /^Sandbox B1:/ })).toContainText("2 power");
  await page.getByRole("button", { name: "Edit construction", exact: true }).click();
  await scenarios.selectOption("owner-demo-bone-gift"); await page.getByRole("button", { name: "Execute scenario", exact: true }).click(); await play("u024", "B1");
  await expect(page.getByRole("button", { name: /^Sandbox B1:/ })).toContainText("6 power"); await expect(page.getByRole("button", { name: /^Sandbox A1:/ })).toContainText("3 power");
  await page.getByRole("button", { name: "Edit construction", exact: true }).click();
  await scenarios.selectOption("owner-demo-score"); await page.getByRole("button", { name: "Execute scenario", exact: true }).click(); await play("m025", "B1");
  await page.locator('[data-testid="score-breakdown"] summary').click(); await expect(page.locator('[data-testid="score-breakdown"]')).toContainText("3 / 0");
  await page.screenshot({ path: ".local/v1.3bc/owner-score-bonuses.png", fullPage: true });
  for (const supported of [false, true]) {
    await page.getByRole("button", { name: "Edit construction", exact: true }).click(); await scenarios.selectOption(`owner-demo-phoenix-${supported ? "supported" : "blocked"}`); await page.getByRole("button", { name: "Execute scenario", exact: true }).click(); await play("m026", "A2");
    await expect(page.getByRole("button", { name: /^Sandbox B1:/ })).toContainText(supported ? "Phoenix" : "Empty");
  }
});

for (const mobile of [false, true]) test(`invited player build ${mobile ? "touch-sized" : "desktop"} starts clean, plays owner cards and excludes Studio and unpublished art`, async ({ browser }) => {
  test.skip(!process.env.KINDRED_PLAYER_URL, "Requires a separately built player-only preview.");
  test.setTimeout(90000);
  const context = await browser.newContext({ baseURL: process.env.KINDRED_PLAYER_URL, ...(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {}) });
  const page = await context.newPage(), errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  expect((await context.storageState()).origins).toEqual([]);
  await page.goto("/"); await expect(page.getByRole("button", { name: "Developer Studio", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Card library", exact: true }).click(); await expect(page.locator(".library-grid article")).toHaveCount(150); await page.getByLabel("Search cards", { exact: true }).fill("C020"); await expect(page.locator(".library-grid article")).toContainText("Iron Golem"); await page.getByRole("button", { name: "Close The Founding Kindreds", exact: true }).click();
  await speed(page, "fast"); await page.getByLabel("Jade deck", { exact: true }).selectOption(mobile ? pack.decks[4].id : pack.decks[2].id);
  await page.getByText("Play format & battlefield options", { exact: true }).click(); await page.getByLabel("Match seed (optional)", { exact: true }).fill("9461"); await page.getByRole("button", { name: "Begin match" }).click(); await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Jade to command.", exact: true })).toBeVisible();
  await page.locator(".hand-card:not(.unplayable)").first().click(); await page.locator(".cell.legal").first().click(); await expect(page.locator(".preview-score")).toBeVisible(); await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).click();
  await expect(page.getByRole("heading", { name: "Jade to command.", exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".cell .power").first()).toContainText("printed");
  expect((await readGame(page)).fault).toBeNull();
  await page.screenshot({ path: `.local/v1.3bc/player-${mobile ? "touch" : "desktop"}.png`, fullPage: true });
  const unpublished = await page.request.get("/assets/cards/nature/art-sprout-ce9b71e2b4447e2c.webp"); expect(unpublished.headers()["content-type"] ?? "").not.toContain("image/");
  await page.goto("/#studio"); await expect(page.getByRole("navigation", { name: "Developer Studio sections" })).toHaveCount(0); expect(errors).toEqual([]); await context.close();
});
