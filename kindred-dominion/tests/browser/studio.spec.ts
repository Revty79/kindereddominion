import { prepareHistoricalContent } from "./historical-setup";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Workspace } from "../../src/content/types";
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Developer Studio sections" })
    .getByRole("button", { name, exact: true })
    .click();
async function workspace(page: Page): Promise<Workspace> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("kindred-dominion-studio", 1);
        open.onsuccess = () => {
          const db = open.result,
            read = db
              .transaction("snapshots", "readonly")
              .objectStore("snapshots")
              .get("current");
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
}
async function openStudio(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Developer Studio", exact: true }),
  ).toBeVisible();
}
async function create(
  page: Page,
  id: string,
  name: string,
  options: {
    type?: "evolution" | "replacement";
    predecessor?: string;
    classification?: string;
    ability?: boolean;
    artwork?: boolean;
  } = {},
) {
  await nav(page, "Card Library");
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  await page.getByLabel("Stable card identifier", { exact: true }).fill(id);
  await page.getByLabel("Card name", { exact: true }).fill(name);
  await page
    .getByLabel("Card collection", { exact: true })
    .selectOption("Nature");
  await page
    .getByLabel("Creature classifications (comma separated)", { exact: true })
    .fill("testing, seedling");
  await page.getByLabel("Base power", { exact: true }).fill("2");
  if (options.type) {
    await page
      .getByLabel("Placement type", { exact: true })
      .selectOption(options.type);
    if (options.predecessor)
      await page
        .getByLabel("Acceptable named predecessors", { exact: true })
        .selectOption(options.predecessor);
    if (options.classification)
      await page
        .getByLabel("Predecessor classifications (comma separated)", {
          exact: true,
        })
        .fill(options.classification);
  }
  await page
    .getByLabel("Expansion / token contribution", { exact: true })
    .fill("1");
  if (options.ability) {
    await page
      .getByRole("button", { name: "Add ability", exact: true })
      .click();
    await page.getByLabel("Maximum per event", { exact: true }).fill("1");
    await page.getByLabel("Maximum per match", { exact: true }).fill("1");
  }
  if (options.artwork)
    await page
      .getByLabel("Local artwork (optional, PNG/JPEG/WebP/SVG, up to 10 MB)", {
        exact: true,
      })
      .setInputFiles({
        name: "owner-pixel.png",
        mimeType: "image/png",
        buffer: readFileSync("tests/fixtures/artwork/test-sprout-source.png"),
      });
  await page
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Card saved to the working draft.", { exact: false }),
  ).toBeVisible();
}
async function add(page: Page, id: string, zone = "hand", owner = "0") {
  await page
    .getByLabel("Scenario card definition", { exact: true })
    .selectOption(id);
  await page
    .getByLabel("New instance owner", { exact: true })
    .selectOption(owner);
  await page
    .getByLabel("New instance destination", { exact: true })
    .selectOption(zone);
  await page
    .getByRole("button", { name: "Add card instance", exact: true })
    .click();
}
async function chooseHand(page: Page, name: string) {
  const option = page
    .getByLabel("Sandbox active hand card", { exact: true })
    .locator("option")
    .filter({ hasText: name })
    .first();
  await page
    .getByLabel("Sandbox active hand card", { exact: true })
    .selectOption((await option.getAttribute("value"))!);
}

test("A and B: visually author, persist, build a deck, execute, inspect and repeat a card", async ({
  page,
}) => {
  await openStudio(page);
  await create(page, "owner-sentinel", "Owner Sentinel", {
    ability: true,
    artwork: true,
  });
  let w = await workspace(page);
  expect(
    w.working.cards.find((c) => c.id === "owner-sentinel")?.abilities,
  ).toHaveLength(1);
  expect(w.activeVersion).toBe("v1.1-baseline");
  await page.reload();
  await nav(page, "Card Library");
  await page.getByLabel("Search name or identifier").fill("owner-sentinel");
  await expect(
    page.getByRole("button", { name: "Edit Owner Sentinel", exact: true }),
  ).toBeVisible();
  await nav(page, "Deck Builder and Tester");
  await page
    .getByRole("button", { name: "Create test deck", exact: true })
    .click();
  await page.getByLabel("Deck name", { exact: true }).fill("Owner experiment");
  await page.getByLabel("Find cards for test deck").fill("Owner Sentinel");
  await page
    .getByRole("button", {
      name: "Add Owner Sentinel to test deck",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save test deck", exact: true })
    .click();
  await expect(
    page.getByText("Test deck saved.", { exact: false }),
  ).toBeVisible();
  await nav(page, "Battlefield Sandbox");
  await page
    .getByLabel("Scenario name", { exact: true })
    .fill("Sentinel trace");
  await add(page, "owner-sentinel");
  await page
    .getByRole("button", { name: "Save scenario", exact: true })
    .click();
  await expect(
    page.getByText("Scenario saved.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Execute scenario", exact: true })
    .click();
  await chooseHand(page, "Owner Sentinel");
  await page.getByRole("button", { name: "Sandbox A1:", exact: false }).click();
  await page
    .getByRole("button", { name: "Execute placement at A1", exact: true })
    .click();
  const result = await page.locator(".sandbox-board").innerText();
  await expect(page.locator(".sandbox-board")).toContainText("3 power");
  await expect(
    page.getByRole("heading", { name: "Ability resolution inspector" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^1 · action / }).click();
  await expect(
    page.getByText("READ-ONLY DIAGNOSTIC STEP", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show committed state", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset execution", exact: true })
    .click();
  await chooseHand(page, "Owner Sentinel");
  await page.getByRole("button", { name: "Sandbox A1:", exact: false }).click();
  await page
    .getByRole("button", { name: "Execute placement at A1", exact: true })
    .click();
  expect(await page.locator(".sandbox-board").innerText()).toBe(result);
  await page
    .getByRole("button", { name: "Save sandbox replay", exact: true })
    .click();
  w = await workspace(page);
  expect(w.replays.length).toBe(1);
  expect(
    w.scenarios[0].state.cards[w.scenarios[0].state.players[0].hand[0]]
      .location,
  ).toBe("hand");
});
test("C: exact and classification evolution plus replacement sacrifice use the real engine", async ({
  page,
}) => {
  await openStudio(page);
  await create(page, "studio-exact", "Exact Evolution", {
    type: "evolution",
    predecessor: "sprout",
  });
  await create(page, "studio-criteria", "Criteria Evolution", {
    type: "evolution",
    classification: "seedling",
  });
  for (const [incoming, predecessor, name] of [
    ["studio-exact", "sprout", "Exact Evolution"],
    ["studio-criteria", "leafguard", "Criteria Evolution"],
    ["crypt-harvester", "bone-thrall", "Crypt Harvester"],
  ]) {
    await nav(page, "Battlefield Sandbox");
    const editConstruction = page.getByRole("button", {
      name: "Edit construction",
      exact: true,
    });
    if (await editConstruction.count()) await editConstruction.click();
    await page
      .getByRole("button", { name: "New scenario from ruleset", exact: true })
      .click();
    await add(page, predecessor, "battlefield");
    await add(page, incoming);
    await page
      .getByRole("button", { name: "Execute scenario", exact: true })
      .click();
    await chooseHand(page, name);
    await page
      .getByRole("button", { name: "Sandbox A1:", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Execute placement at A1", exact: true })
      .click();
    await expect(page.locator(".sandbox-board")).toContainText(name);
    if (incoming === "crypt-harvester")
      await expect(page.locator(".sandbox-board")).toContainText("5 power");
    else
      await expect(page.locator(".sandbox-board")).toContainText("2 form(s)");
  }
});
test("D: 100 real matches are reproducible; a 10,000-match worker workload remains responsive and cancellable", async ({
  page,
}) => {
  test.setTimeout(180000);
  await openStudio(page);
  await nav(page, "Match Simulator");
  await page.getByLabel("Match-count preset").selectOption("100");
  await page
    .getByRole("button", { name: "Run headless matches", exact: true })
    .click();
  await expect(page.locator(".simulation-progress")).toContainText("Finished", {
    timeout: 90000,
  });
  const first = (await workspace(page)).reports.at(-1)!;
  expect(first.completed).toBe(100);
  expect(first.faults).toBe(0);
  await page
    .getByRole("button", { name: "Run headless matches", exact: true })
    .click();
  await expect(page.locator(".simulation-progress")).toContainText("Finished", {
    timeout: 90000,
  });
  const second = (await workspace(page)).reports.at(-1)!;
  expect(second.digest).toBe(first.digest);
  expect(second.decks).toEqual(first.decks);
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export simulation JSON", exact: true })
    .click();
  expect((await exported).suggestedFilename()).toContain(".json");
  await page.getByLabel("Match-count preset").selectOption("10000");
  await page
    .getByRole("button", { name: "Run headless matches", exact: true })
    .click();
  await expect(page.locator(".simulation-progress")).toContainText(
    "Running in a Web Worker",
    { timeout: 10000 },
  );
  const responsive = Date.now();
  await page.getByLabel("Reproducible simulation seed").fill("99");
  expect(Date.now() - responsive).toBeLessThan(2000);
  await expect
    .poll(
      async () => {
        const report = (await workspace(page)).reports.at(-1);
        return report?.request.matches === 10000 ? report.attempted : 0;
      },
      { timeout: 10000 },
    )
    .toBeGreaterThan(10);
  await page
    .getByRole("button", {
      name: "Cancel simulation and preserve results",
      exact: true,
    })
    .click();
  await expect(page.locator(".simulation-progress")).toContainText(
    "Cancelled; partial results retained",
    { timeout: 10000 },
  );
  const cancelled = (await workspace(page)).reports.at(-1)!;
  expect(cancelled.attempted).toBeGreaterThan(10);
  expect(cancelled.attempted).toBeLessThan(10000);
  expect(cancelled.cancelled).toBe(true);
});
test("E and G: complete original match is recorded, replayed and unchanged by draft edits", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Local two-player", exact: true })
    .click();
  // This replay fixture requires a legal first play; do not sample an arbitrary
  // opening with only high-rank/replacement/evolution cards.
  await page.getByText("Play format & battlefield options", { exact: true }).click();
  await page.getByLabel("Match seed (optional)", { exact: true }).fill("9461");
  await page.getByRole("button", { name: "Begin match" }).click();
  const reveal = async () => {
    const button = page.getByRole("button", { name: /reveal my hand/ });
    if (await button.count()) await button.click();
  };
  for (let i = 0; i < 2; i++) {
    await reveal();
    await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  }
  await reveal();
  await page.locator(".hand-card:not(.unplayable)").first().click();
  await page.locator(".cell.legal").first().click();
  await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).click();
  await reveal();
  await page.getByRole("button", { name: "Pass turn", exact: true }).click();
  await reveal();
  await page.getByRole("button", { name: "Pass turn", exact: true }).click();
  await expect(page.locator(".result-banner")).toBeVisible();
  await expect
    .poll(async () => (await workspace(page))?.replays.length ?? 0)
    .toBe(1);
  const record = (await workspace(page)).replays[0];
  expect(record.contentVersion).toBe("v1.1-baseline");
  await page
    .getByRole("button", { name: "New match setup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  await nav(page, "Match Replay and Diagnostics");
  await page.getByRole("button", { name: "Final action", exact: true }).click();
  await expect(
    page.getByText("Winner: Player", { exact: false }),
  ).toBeVisible();
  const final = await page.locator(".sandbox-board").innerText();
  await page
    .getByRole("button", { name: "Previous action", exact: true })
    .click();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  expect(await page.locator(".sandbox-board").innerText()).toBe(final);
  await nav(page, "Card Library");
  await page
    .getByRole("button", { name: "Edit Briar Sprout", exact: true })
    .click();
  await page.getByLabel("Base power", { exact: true }).fill("9");
  await page
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Card saved to the working draft.", { exact: false }),
  ).toBeVisible();
  await nav(page, "Match Replay and Diagnostics");
  await page.getByRole("button", { name: "Final action", exact: true }).click();
  expect(await page.locator(".sandbox-board").innerText()).toBe(final);
  expect(
    (await workspace(page)).versions[0].cards.find((c) => c.id === "sprout")
      ?.power,
  ).toBe(1);
});
test("F: checkpoint and complete backup restore authored relationships and artwork atomically", async ({
  page,
  browser,
}) => {
  await openStudio(page);
  await create(page, "backed-card", "Backed Card", {
    ability: true,
    artwork: true,
  });
  await create(page, "backed-evolution", "Backed Evolution", {
    type: "evolution",
    predecessor: "backed-card",
  });
  await nav(page, "Content Versions and Backups");
  await page
    .getByLabel("Checkpoint name", { exact: true })
    .fill("Owner artwork checkpoint");
  await page
    .getByRole("button", { name: "Create named checkpoint", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Owner artwork checkpoint", exact: false }),
  ).toBeVisible();
  const w = await workspace(page);
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete Studio backup", exact: true })
    .click();
  const backup = await exported;
  const path = await backup.path();
  expect(path).not.toBeNull();
  const context = await browser.newContext({
      baseURL: String(test.info().project.use.baseURL),
    }),
    isolated = await context.newPage();
  await openStudio(isolated);
  await nav(isolated, "Content Versions and Backups");
  await isolated
    .getByLabel("Import Studio content file", { exact: true })
    .setInputFiles(path!);
  await expect(
    isolated.getByText("Identifier conflicts:", { exact: false }),
  ).toBeVisible();
  await isolated
    .getByRole("checkbox", { name: /I reviewed conflicts/ })
    .check();
  await isolated
    .getByRole("button", {
      name: "Apply validated import atomically",
      exact: true,
    })
    .click();
  await expect(
    isolated.getByText("Content operation saved.", { exact: false }),
  ).toBeVisible();
  let restored = await workspace(isolated);
  expect(restored.working).toEqual(w.working);
  expect(restored.versions).toEqual(w.versions);
  expect(restored.working.metadata["backed-card"].artwork).toContain(
    "data:image/webp",
  );
  expect(
    restored.working.cards.find((c) => c.id === "backed-evolution")
      ?.prerequisite?.definitions,
  ).toEqual(["backed-card"]);
  await isolated
    .getByLabel("Import Studio content file", { exact: true })
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "kindred-dominion-studio",
          schema: 1,
          engineVersion: "1.1.0",
          type: "backup",
          data: {
            ...restored,
            working: { ...restored.working, cards: [{ id: "broken" }] },
          },
        }),
      ),
    });
  await expect(
    isolated.getByText("Import rejected.", { exact: false }),
  ).toBeVisible();
  expect(await workspace(isolated)).toEqual(restored);
  await context.close();
});

test.beforeEach(async ({ page }) => { await prepareHistoricalContent(page); });
