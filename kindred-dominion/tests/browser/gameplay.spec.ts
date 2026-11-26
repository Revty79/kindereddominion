import { prepareHistoricalContent } from "./historical-setup";
import { expect, test, type Page } from "@playwright/test";
import {
  act,
  assertInvariants,
  cellAt,
  createMatch,
} from "../../src/engine/game";
import { DEFAULT_CONFIG } from "../../src/engine/config";
import { CARDS } from "../../src/data/cards";
import { DECKS } from "../../src/data/decks";
import type { GameState, Player } from "../../src/engine/types";

const key = "kindred-dominion:v1:match";
async function state(page: Page): Promise<GameState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).game,
    key,
  );
}
async function reveal(page: Page) {
  const button = page.getByRole("button", { name: /reveal my hand/ });
  if (await button.count()) await button.click();
}
async function startLocal(page: Page, scoring = "classic") {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Local two-player", exact: true })
    .click();
  if (scoring === "domination")
    await page.getByRole("button", { name: /^▦ Domination/ }).click();
  await page
    .getByText("Play format & battlefield options", { exact: true })
    .click();
  await page.getByLabel("Match seed").fill("9461");
  await page.getByRole("button", { name: "Begin match" }).click();
}
async function mulligans(page: Page) {
  for (let i = 0; i < 2; i++) {
    await reveal(page);
    await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  }
  await reveal(page);
}
async function placeFirst(page: Page) {
  const cards = page.locator(".hand-card:not(.unplayable)");
  if (await cards.count()) {
    await cards.first().click();
    await page.locator(".cell.legal").first().click();
    await expect(page.locator(".resolution-preview")).toBeVisible();
    await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).click();
  } else
    await page
      .getByRole("button", { name: /Confirm forced pass|Pass turn/ })
      .click();
}
test("complete local Domination match, privacy handoffs, rematch and recovery", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startLocal(page, "domination");
  await expect(
    page.getByRole("dialog", { name: "Private player handoff" }),
  ).toBeVisible();
  await expect(page.locator(".hand-card")).toHaveCount(0);
  await reveal(page);
  const rejected = (await state(page)).players[0].hand.slice(0, 2);
  await page.locator(".hand-card").nth(0).click();
  await page.locator(".hand-card").nth(1).click();
  await page
    .getByRole("button", { name: "Exchange 2 cards", exact: true })
    .click();
  expect(
    (await state(page)).players[0].hand.some((id) => rejected.includes(id)),
  ).toBe(false);
  await expect(page.locator(".hand-card")).toHaveCount(0);
  await reveal(page);
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  await reveal(page);
  const originalStarter = (await state(page)).startingPlayer;
  await placeFirst(page);
  await expect(page.locator(".hand-card")).toHaveCount(0);
  const saved = await state(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue saved match", exact: true })
    .click();
  await expect(page.locator(".hand-card")).toHaveCount(0);
  expect(await state(page)).toEqual(saved);
  let turns = 0;
  while ((await state(page)).phase === "playing" && turns++ < 90) {
    await reveal(page);
    await placeFirst(page);
  }
  const result = await state(page);
  expect(result.phase).toBe("finished");
  expect(result.fault).toBeNull();
  assertInvariants(result, CARDS);
  await expect(page.locator(".result-banner")).toBeVisible();
  await expect(page.locator(".column-counts>span")).toHaveCount(5);
  await page.screenshot({
    path: ".local/browser-local-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Rematch", exact: true }).click();
  expect((await state(page)).startingPlayer).toBe(
    originalStarter === 0 ? 1 : 0,
  );
  await expect(page.locator(".hand-card")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("complete human versus computer match using real UI placements", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (req) => {
    if (
      !req.url().startsWith("http://127.0.0.1:5173") &&
      !req.url().startsWith("ws://127.0.0.1:5173")
    )
      external.push(req.url());
  });
  await page.goto("/");
  await page
    .getByText("Play format & battlefield options", { exact: true })
    .click();
  await page.getByLabel("Match seed").fill("9461");
  await page.getByRole("button", { name: "Begin match" }).click();
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  let moves = 0;
  while (moves++ < 70) {
    await expect
      .poll(async () => {
        const s = await state(page);
        return (
          s.phase !== "mulligan" && (s.active === 0 || s.phase !== "playing")
        );
      })
      .toBe(true);
    const s = await state(page);
    if (s.phase !== "playing") break;
    await placeFirst(page);
  }
  const result = await state(page);
  expect(result.phase).toBe("finished");
  expect(result.fault).toBeNull();
  assertInvariants(result, CARDS);
  await expect(page.locator(".result-banner")).toBeVisible();
  expect(external).toEqual([]);
});
test("library search, custom Free Play deck, legal 15 duplicate instances", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Card library", exact: true }).click();
  await expect(page.locator(".library-grid article")).toHaveCount(30);
  await page.getByLabel("Search cards").pressSequentially("resurrect");
  await expect(page.locator(".library-grid article")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await page
    .getByText("Play format & battlefield options", { exact: true })
    .click();
  await page.getByLabel("Play format", { exact: true }).selectOption("free");
  await page
    .getByRole("button", { name: "Build deck", exact: true })
    .first()
    .click();
  await page.getByLabel("Search cards").fill("Briar Sprout");
  for (let i = 0; i < 15; i++)
    await page
      .getByRole("button", { name: "Add Briar Sprout", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Add Briar Sprout", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".builder-validation")).toHaveText(
    "Legal Free Play deck.",
  );
  await page
    .getByRole("button", { name: "Use this deck", exact: true })
    .click();
  await page.getByRole("button", { name: "Begin match" }).click();
  const s = await state(page);
  expect(s.players[0].hand).toHaveLength(5);
  expect(new Set(s.players[0].hand).size).toBe(5);
  expect(
    Object.values(s.cards).filter(
      (c) => c.owner === 0 && c.definitionId === "sprout",
    ),
  ).toHaveLength(15);
});
test("touch-sized layout supports hand, board scroll, preview and surrender", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    baseURL: "http://127.0.0.1:5173",
  });
  const page = await context.newPage();
  await prepareHistoricalContent(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await startLocal(page);
  await mulligans(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".board-scroll")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.locator(".hand-card:not(.unplayable)").first().tap();
  await page.locator(".cell.legal").first().tap();
  await expect(page.locator(".resolution-preview")).toBeVisible();
  await page.screenshot({
    path: ".local/browser-mobile-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).tap();
  await reveal(page);
  await page.getByRole("button", { name: "Surrender", exact: true }).tap();
  await page
    .getByRole("button", { name: "Confirm surrender", exact: true })
    .tap();
  await expect(page.locator(".result-banner")).toBeVisible();
  expect((await state(page)).result?.reason).toBe("surrender");
  await context.close();
});
test("full battlefield permits replacement, evolution, death and graveyard inspection", async ({
  page,
}) => {
  let s = createMatch(
    [DECKS[0].cards, DECKS[1].cards],
    CARDS,
    DEFAULT_CONFIG,
    9461,
    0,
  );
  s = act(s, { type: "mulligan", player: 0, cards: [] }, CARDS);
  s = act(s, { type: "mulligan", player: 1, cards: [] }, CARDS);
  const relocate = (
    definition: string,
    owner: Player,
    row: number,
    col: number,
  ) => {
    const card = Object.values(s.cards).find(
      (c) =>
        c.owner === owner && (c.location === "draw" || c.location === "hand"),
    )!;
    for (const zone of ["draw", "hand"] as const)
      s.players[owner][zone] = s.players[owner][zone].filter(
        (id) => id !== card.id,
      );
    card.definitionId = definition;
    card.location = "battlefield";
    Object.assign(cellAt(s, row, col)!, {
      owner,
      tokens: 3,
      creature: card.id,
    });
    return card.id;
  };
  for (const c of s.board)
    relocate(
      c.col < 3 ? "leafguard" : "bone-thrall",
      c.col < 3 ? 0 : 1,
      c.row,
      c.col,
    );
  const first = cellAt(s, 0, 0)!.creature!;
  s.cards[first].definitionId = "bone-thrall";
  for (const definition of ["crypt-harvester", "elderroot"]) {
    const card = Object.values(s.cards).find(
      (c) => c.owner === 0 && c.location === "draw",
    )!;
    s.players[0].draw = s.players[0].draw.filter((id) => id !== card.id);
    card.definitionId = definition;
    card.location = "hand";
    s.players[0].hand.push(card.id);
  }
  assertInvariants(s, CARDS);
  await page.goto("/");
  await page.evaluate(
    ({ key, s, decks }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          schema: 1,
          game: s,
          decks,
          opponent: "local",
          deckNames: ["Scenario Jade", "Scenario Amber"],
        }),
      ),
    { key, s, decks: [DECKS[0].cards, DECKS[1].cards] },
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Continue saved match", exact: true })
    .click();
  await reveal(page);
  await page
    .getByRole("button", { name: /^Crypt Harvester, replacement/ })
    .click();
  await page.getByTestId("cell-0-0").click();
  await expect(page.locator(".resolution-preview")).toContainText("sacrifice");
  await page.getByRole("button", { name: "Place at A1", exact: true }).click();
  await reveal(page);
  await page
    .getByRole("button", { name: /Pass turn|Confirm forced pass/ })
    .click();
  await reveal(page);
  await page.getByRole("button", { name: /^Elderroot, evolution/ }).click();
  await page.getByTestId("cell-1-0").click();
  await page.getByRole("button", { name: "Place at B1", exact: true }).click();
  const next = await state(page);
  expect(next.board.filter((c) => c.creature)).toHaveLength(15);
  expect(next.cards[cellAt(next, 1, 0)!.creature!].stack).toHaveLength(1);
  expect(next.phase).toBe("playing");
  await reveal(page);
  await page.getByRole("button", { name: "Graveyard 1", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Jade · Graveyard & exile" }),
  ).toContainText("Bone Thrall");
});
test("simultaneous destruction and limited resurrection resolve visibly in the browser", async ({
  page,
}) => {
  const make = () => {
    let s = createMatch(
      [DECKS[0].cards, DECKS[1].cards],
      CARDS,
      DEFAULT_CONFIG,
      9461,
      0,
    );
    s = act(s, { type: "mulligan", player: 0, cards: [] }, CARDS);
    return act(s, { type: "mulligan", player: 1, cards: [] }, CARDS);
  };
  const move = (
    s: GameState,
    definition: string,
    owner: Player,
    row?: number,
    col?: number,
  ) => {
    const card = Object.values(s.cards).find(
      (c) =>
        c.owner === owner && (c.location === "draw" || c.location === "hand"),
    )!;
    for (const z of ["draw", "hand"] as const)
      s.players[owner][z] = s.players[owner][z].filter((id) => id !== card.id);
    card.definitionId = definition;
    card.location = row === undefined ? "hand" : "battlefield";
    if (row === undefined) s.players[owner].hand.push(card.id);
    else
      Object.assign(cellAt(s, row, col!)!, {
        owner,
        tokens: 3,
        creature: card.id,
      });
    return card.id;
  };
  const load = async (s: GameState) => {
    assertInvariants(s, CARDS);
    await page.evaluate(
      ({ key, s }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            schema: 1,
            game: s,
            decks: [[], []],
            opponent: "local",
            deckNames: ["Diagnostic Jade", "Diagnostic Amber"],
          }),
        ),
      { key, s },
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Continue saved match", exact: true })
      .click();
    await reveal(page);
  };
  await page.goto("/");
  let s = make();
  const jade = move(s, "bone-thrall", 0, 0, 0);
  const amber = move(s, "bone-thrall", 1, 0, 4);
  move(s, "convergence", 0);
  cellAt(s, 1, 0)!.tokens = 2;
  await load(s);
  await page.getByRole("button", { name: /^Convergence, standard/ }).click();
  await page.getByTestId("cell-1-0").click();
  await expect(page.locator(".resolution-preview")).toContainText("Convergence enters play");
  await expect(page.locator(".resolution-preview")).toContainText("Convergence: is destroyed");
  await expect(page.locator(".resolution-preview .public-consequences li").filter({ hasText: "is destroyed" })).toHaveCount(3);
  await page.getByRole("button", { name: "Place at B1", exact: true }).click();
  let next = await state(page);
  expect(next.cards[jade].location).toBe("graveyard");
  expect(next.cards[amber].location).toBe("graveyard");
  expect(next.board.filter((c) => c.creature)).toHaveLength(0);
  expect(next.fault).toBeNull();
  s = make();
  const revenant = move(s, "revenant", 1, 0, 2);
  move(s, "sunlance", 0);
  cellAt(s, 0, 0)!.tokens = 2;
  await load(s);
  await page.getByRole("button", { name: /^Sunlance, standard/ }).click();
  await page.getByTestId("cell-0-0").click();
  await expect(page.locator(".resolution-preview")).toContainText(
    "resurrected",
  );
  await page.getByRole("button", { name: "Place at A1", exact: true }).click();
  next = await state(page);
  expect(next.cards[revenant].location).toBe("battlefield");
  expect(next.cards[revenant].resurrections).toBe(1);
  expect(next.fault).toBeNull();
  await expect(page.locator(".event-log")).toContainText(
    "Oathbound Revenant resurrected",
  );
});
test("configurable 4 by 8 field and save storage failure remain playable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const storage = window.localStorage;
    Object.getPrototypeOf(storage).setItem = function () {
      throw new DOMException("Disabled", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await page
    .getByText("Play format & battlefield options", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Battlefield", exact: true })
    .selectOption("4x8");
  await page.getByRole("button", { name: "Begin match" }).click();
  await expect(page.locator(".cell")).toHaveCount(32);
  await expect(page.getByRole("alert")).toContainText("storage is unavailable");
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Pass turn|Confirm forced pass/ }),
  ).toBeVisible();
});

test.beforeEach(async ({ page }) => { await prepareHistoricalContent(page); });
