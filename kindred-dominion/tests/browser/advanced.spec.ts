import { prepareHistoricalContent } from "./historical-setup";
import { expect, test, authorizeLocalWorkspace, type Page } from "./practice-fixture";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Workspace } from "../../src/content/types";
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Developer Studio sections" })
    .getByRole("button", { name, exact: true })
    .click();
async function open(page: Page) {
  await page.goto("/practice.html");
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Developer Studio", exact: true }),
  ).toBeVisible();
}
async function workspace(page: Page): Promise<Workspace> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const q = indexedDB.open("kindred-dominion-studio", 1);
        q.onsuccess = () => {
          const db = q.result,
            r = db
              .transaction("snapshots", "readonly")
              .objectStore("snapshots")
              .get("current");
          r.onsuccess = () => {
            resolve(r.result);
            db.close();
          };
          r.onerror = () => reject(r.error);
        };
        q.onerror = () => reject(q.error);
      }),
  );
}
async function create(
  page: Page,
  id: string,
  name: string,
  configure: () => Promise<void>,
) {
  await nav(page, "Card Library");
  await page.getByRole("button", { name: "Create card", exact: true }).click();
  await page.getByLabel("Stable card identifier", { exact: true }).fill(id);
  await page.getByLabel("Card name", { exact: true }).fill(name);
  await page.getByLabel("Base power", { exact: true }).fill("3");
  await page
    .getByLabel("Creature classifications (comma separated)", { exact: true })
    .fill("Owner Test, Wolf");
  await configure();
  await page
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Card saved to the working draft.", { exact: false }),
  ).toBeVisible();
}
async function add(page: Page, id: string, zone = "hand") {
  await page
    .getByLabel("Scenario card definition", { exact: true })
    .selectOption(id);
  await page
    .getByLabel("New instance destination", { exact: true })
    .selectOption(zone);
  await page
    .getByRole("button", { name: "Add card instance", exact: true })
    .click();
}
async function hand(page: Page, name: string) {
  const option = page
    .getByLabel("Sandbox active hand card", { exact: true })
    .locator("option")
    .filter({ hasText: name })
    .first();
  await page
    .getByLabel("Sandbox active hand card", { exact: true })
    .selectOption((await option.getAttribute("value"))!);
}
test("owner authors all eight advanced card families, tests real power changes, publishes, replays and restores", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await open(page);
  await create(page, "owner-aura", "Owner Aura", async () => {
    await page
      .getByRole("button", { name: "Add continuous effect", exact: true })
      .click();
    await page.getByLabel("Continuous power amount", { exact: true }).fill("2");
    await page
      .getByLabel("Local artwork (optional, PNG/JPEG/WebP/SVG, up to 10 MB)", {
        exact: true,
      })
      .setInputFiles("tests/fixtures/artwork/test-sprout-source.png");
    await expect(
      page.getByText("Source artwork preserved locally;", { exact: false }),
    ).toBeVisible();
    await page
      .getByLabel("Artwork approval", { exact: true })
      .selectOption("testing");
  });
  await create(page, "owner-weak", "Owner Weakening", async () => {
    await page
      .getByRole("button", { name: "Add continuous effect", exact: true })
      .click();
    await page
      .getByLabel("Continuous power amount", { exact: true })
      .fill("-1");
    await page
      .getByLabel("Target relationship", { exact: true })
      .selectOption("enemy");
  });
  await create(page, "owner-scale", "Owner Scaling", async () => {
    await page
      .getByRole("button", { name: "Add dynamic scaling", exact: true })
      .click();
  });
  await create(page, "owner-react", "Owner Reactive", async () => {
    await page
      .getByRole("button", { name: "Add ability", exact: true })
      .click();
    await page
      .getByLabel("Trigger", { exact: true })
      .selectOption("otherWeakened");
    await page.getByLabel("Maximum per turn", { exact: true }).fill("1");
  });
  await create(page, "owner-threshold", "Owner Threshold", async () => {
    await page
      .getByRole("button", { name: "Add ability", exact: true })
      .click();
    await page.getByLabel("Trigger", { exact: true }).selectOption("condition");
    await expect(
      page.getByLabel("Activation condition", { exact: true }),
    ).toHaveValue("sourcePower");
    await page.getByLabel("Condition threshold", { exact: true }).fill("5");
  });
  await create(page, "owner-replacement", "Owner Replacement", async () => {
    await page
      .getByLabel("Placement type", { exact: true })
      .selectOption("replacement");
    await page
      .getByRole("button", { name: "Add ability", exact: true })
      .click();
    await page
      .getByLabel("Trigger", { exact: true })
      .selectOption("replacement");
    await page
      .getByLabel("Power change (negative weakens) expression", { exact: true })
      .selectOption("divide");
    await page
      .getByLabel("Input amount expression", { exact: true })
      .selectOption("value");
    await page
      .getByLabel("Numerical value", { exact: true })
      .selectOption("sacrificedPower");
    await page.getByLabel("Configured constant", { exact: true }).fill("2");
    await page
      .getByLabel("Division rounding", { exact: true })
      .selectOption("floor");
  });
  await create(page, "owner-protect", "Owner Protection", async () => {
    await page
      .getByRole("button", { name: "Add continuous effect", exact: true })
      .click();
    await page
      .getByLabel("Continuous effect kind", { exact: true })
      .selectOption("protection");
    await page
      .getByLabel("Continuous activation condition", { exact: true })
      .selectOption("compare");
    const left = page.getByRole("group", {
      name: "Condition left value",
      exact: true,
    });
    await left
      .getByLabel("Aggregate quantity", { exact: true })
      .selectOption("fortification");
    await left
      .getByLabel("Target selection", { exact: true })
      .selectOption("self");
  });
  await create(page, "owner-score", "Owner Scoring", async () => {
    await page
      .getByRole("button", { name: "Add scoring bonus", exact: true })
      .click();
    await page
      .getByLabel("Scoring requirement", { exact: true })
      .selectOption("rowWon");
  });
  await page.reload();
  await nav(page, "Card Library");
  await page.getByLabel("Search name or identifier").fill("owner-");
  let w = await workspace(page);
  expect(w.working.schema).toBe(2);
  expect(w.working.engineVersion).toBe("1.3.0");
  expect(w.working.cards.filter((c) => c.id.startsWith("owner-"))).toHaveLength(
    8,
  );
  expect(
    w.working.cards.find((c) => c.id === "owner-protect")!.continuous![0]
      .condition,
  ).toMatchObject({ kind: "compare" });
  await nav(page, "Deck Builder and Tester");
  await page
    .getByRole("button", { name: "Create test deck", exact: true })
    .click();
  await page
    .getByLabel("Deck name", { exact: true })
    .fill("Owner advanced deck");
  const ids = [
    "owner-aura",
    "owner-weak",
    "owner-scale",
    "owner-react",
    "owner-threshold",
    "owner-replacement",
    "owner-protect",
    "owner-score",
    "sprout",
    "leafguard",
    "embercub",
    "rune-initiate",
    "bone-thrall",
    "brass-scout",
    "watchwork",
  ];
  for (const id of ids) {
    w = await workspace(page);
    const name = w.working.cards.find((c) => c.id === id)!.name;
    await page.getByLabel("Find cards for test deck").fill(id);
    await page
      .getByRole("button", { name: `Add ${name} to test deck`, exact: true })
      .click();
  }
  await expect(
    page.getByText("Legal for the selected rules and format.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save test deck", exact: true })
    .click();
  await expect(
    page.getByText("Test deck saved.", { exact: false }),
  ).toBeVisible();
  await nav(page, "Battlefield Sandbox");
  await page
    .getByLabel("Scenario name", { exact: true })
    .fill("Owner advanced replacement trace");
  await page.getByRole("button", { name: "Sandbox A1:", exact: false }).click();
  await add(page, "owner-aura", "battlefield");
  await page.getByRole("button", { name: "Sandbox B1:", exact: false }).click();
  await add(page, "sprout", "battlefield");
  await add(page, "owner-replacement");
  await page
    .getByLabel("Inspect effective-power instance", { exact: true })
    .selectOption("c2");
  await expect(page.getByTestId("power-breakdown")).toContainText(
    "effective power 3",
  );
  await expect(page.getByTestId("power-breakdown")).toContainText("Owner Aura");
  await page
    .getByRole("button", { name: "Save scenario", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Execute scenario", exact: true })
    .click();
  await hand(page, "Owner Replacement");
  await page.getByRole("button", { name: "Sandbox A1:", exact: false }).click();
  await page
    .getByRole("button", { name: "Execute placement at A1", exact: true })
    .click();
  await page
    .getByLabel("Inspect effective-power instance", { exact: true })
    .selectOption("c2");
  await expect(page.getByTestId("power-breakdown")).toContainText(
    "effective power 1",
  );
  await page
    .getByLabel("Inspect effective-power instance", { exact: true })
    .selectOption("c3");
  await expect(page.getByTestId("power-breakdown")).toContainText(
    "effective power 4",
  );
  await expect(
    page.getByRole("heading", { name: "Ability resolution inspector" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /power-change/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pass / advance turn", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pass / advance turn", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save sandbox replay", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await workspace(page)).replays.filter((r) => r.finalResult !== null)
          .length,
    )
    .toBe(1);
  await nav(page, "Match Replay and Diagnostics");
  await page.getByRole("button", { name: "Final action", exact: true }).click();
  await expect(page.locator(".sandbox-board")).toContainText(
    "Owner Replacement",
  );
  await page.getByRole("button", { name: "Sandbox A1:", exact: false }).click();
  await expect(page.getByTestId("power-breakdown")).toContainText(
    "effective power 4",
  );
  const result = await page.locator(".sandbox-board").innerText();
  await page
    .getByRole("button", { name: "Previous action", exact: true })
    .click();
  await page.getByRole("button", { name: "Next action", exact: true }).click();
  expect(await page.locator(".sandbox-board").innerText()).toBe(result);
  await page.screenshot({
    path: ".local/v1.3a/browser-owner-power-and-replay.png",
    fullPage: true,
  });
  await nav(page, "Match Simulator");
  await page
    .getByLabel("Match-count preset", { exact: true })
    .selectOption("10");
  for (const box of await page.locator(".studio-deck-selection input").all())
    await box.uncheck();
  await page.locator(".studio-deck-selection input").first().check();
  await page.getByRole("checkbox", { name: /Owner advanced deck/ }).check();
  await page
    .getByRole("button", { name: "Run headless matches", exact: true })
    .click();
  await expect(page.locator(".simulation-progress")).toContainText("Finished", {
    timeout: 120000,
  });
  w = await workspace(page);
  expect(w.reports.at(-1)!.completed).toBe(10);
  expect(w.reports.at(-1)!.faults).toBe(0);
  await nav(page, "Content Versions and Backups");
  await page
    .getByLabel("Checkpoint name", { exact: true })
    .fill("Owner advanced checkpoint");
  await page
    .getByRole("button", { name: "Create named checkpoint", exact: true })
    .click();
  await page
    .getByLabel("Published content identifier", { exact: true })
    .fill("advanced-browser-artwork-test");
  await page
    .getByLabel("Published content name", { exact: true })
    .fill("Advanced browser temporary artwork");
  await page
    .getByRole("checkbox", {
      name: "I explicitly approve these definition revisions for the selected publication level.",
      exact: true,
    })
    .check();
  const publication = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export approved content and artwork package",
      exact: true,
    })
    .click();
  await mkdir(".local/v1.3a", { recursive: true });
  const zip = path.resolve(
    ".local/v1.3a/advanced-browser-artwork-test.kindred.zip",
  );
  await (await publication).saveAs(zip);
  const root = path.resolve(`.local/v1.3a/browser-import-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const imported = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {importPackage} from './scripts/import-content.mjs'; console.log(JSON.stringify(await importPackage(process.argv[1],{root:process.argv[2]})));",
      zip,
      root,
    ],
    { encoding: "utf8" },
  );
  expect(JSON.parse(imported).assets).toBe(1);
  const exporting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete Studio backup", exact: true })
    .click();
  const backup = await exporting,
    before = await workspace(page);
  const context = await browser.newContext({
      baseURL: String(test.info().project.use.baseURL),
    }),
    restored = await context.newPage();
  await authorizeLocalWorkspace(context);
  await open(restored);
  await nav(restored, "Content Versions and Backups");
  await restored
    .getByLabel("Import Studio content file", { exact: true })
    .setInputFiles((await backup.path())!);
  await restored
    .getByRole("checkbox", { name: /I reviewed conflicts/ })
    .check();
  await restored
    .getByRole("button", {
      name: "Apply validated import atomically",
      exact: true,
    })
    .click();
  await expect(
    restored.getByText("Content operation saved.", { exact: false }),
  ).toBeVisible();
  const after = await workspace(restored);
  expect(after.working).toEqual(before.working);
  expect(after.replays).toEqual(before.replays);
  expect(after.scenarios).toEqual(before.scenarios);
  expect(after.versions).toEqual(before.versions);
  await context.close();
});

test("laboratory scenarios expose aura loss, conditional protection, thresholds, captured power and separate scoring through real controls", async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page);
  await nav(page, "Battlefield Sandbox");
  for (const id of [
    "aura",
    "weakening",
    "protection",
    "threshold",
    "sacrifice",
    "destroyed-context",
    "capture",
  ]) {
    if (
      await page
        .getByRole("button", { name: "Edit construction", exact: true })
        .count()
    )
      await page
        .getByRole("button", { name: "Edit construction", exact: true })
        .click();
    await page
      .getByLabel("Load saved scenario", { exact: true })
      .selectOption(`lab-v1.3a-${id}`);
    await page
      .getByRole("button", { name: "Execute scenario", exact: true })
      .click();
    const option = page
      .getByLabel("Sandbox active hand card", { exact: true })
      .locator("option")
      .nth(1);
    await page
      .getByLabel("Sandbox active hand card", { exact: true })
      .selectOption((await option.getAttribute("value"))!);
    const destination =
      id === "sacrifice"
        ? "Sandbox B1:"
        : id === "capture"
          ? "Sandbox A5:"
          : ["aura", "protection"].includes(id)
            ? "Sandbox C1:"
            : "Sandbox A1:";
    await page.getByRole("button", { name: destination, exact: false }).click();
    await page.getByRole("button", { name: /^Execute placement at / }).click();
    await expect(
      page.getByRole("heading", { name: "Ability resolution inspector" }),
    ).toBeVisible();
    expect(await page.locator(".sandbox-board").innerText()).not.toContain(
      "fault",
    );
    if (id === "aura") {
      await page
        .getByLabel("Inspect effective-power instance", { exact: true })
        .selectOption("c2");
      await expect(page.getByTestId("power-breakdown")).toContainText(
        "effective power 3",
      );
    }
    if (id === "protection") {
      await page
        .getByLabel("Inspect effective-power instance", { exact: true })
        .selectOption("c2");
      const protection = page
        .getByTestId("power-breakdown")
        .getByText("Continuous protection", { exact: true })
        .locator("xpath=following-sibling::dd[1]");
      await expect(protection).toHaveText("None");
    }
  }
  await page
    .getByRole("button", { name: "Edit construction", exact: true })
    .click();
  await page
    .getByLabel("Load saved scenario", { exact: true })
    .selectOption("lab-v1.3a-row-score");
  await expect(page.getByTestId("score-breakdown")).toContainText(
    "Jade 6 / Amber 0",
  );
  await page.getByTestId("score-breakdown").locator("summary").click();
  await expect(
    page.getByText("Card-specific bonus points", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/v1.3a/browser-laboratory-score.png",
    fullPage: true,
  });
});

test("the laboratory plays through the ordinary interface, records an advanced match and leaves both old libraries available", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  await nav(page, "Content Versions and Backups");
  const row = page.getByRole("row").filter({
    has: page.getByText("mechanics-laboratory-v1.3a", { exact: true }),
  });
  await row
    .getByRole("button", { name: "Activate for new matches", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Return to game", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Local two-player", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Inspect card & instance", exact: true })
    .click();
  await expect(page.getByTestId("power-breakdown")).toBeVisible();
  await expect(
    page.getByText("Executable card mechanics", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close Card details", exact: true })
    .click();
  await page.locator(".cell.legal").first().click();
  await reveal();
  await page
    .getByRole("button", { name: /^(Pass turn|Confirm forced pass)$/ })
    .click();
  await reveal();
  await page
    .getByRole("button", { name: /^(Pass turn|Confirm forced pass)$/ })
    .click();
  await expect(page.locator(".result-banner")).toBeVisible();
  await expect.poll(async () => (await workspace(page)).replays.length).toBe(1);
  const w = await workspace(page);
  expect(w.replays[0].engineVersion).toBe("1.3.0");
  expect(w.replays[0].finalResult).not.toBeNull();
  expect(w.versions.find((v) => v.id === "v1.1-baseline")!.cards).toHaveLength(
    30,
  );
  expect(
    w.versions.find((v) => v.id === "founding-kindreds-150-v1")!.cards,
  ).toHaveLength(150);
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
});

test("recursive form controls persist combined conditions, history arithmetic, stage targeting and bounded random effect targets", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  await create(page, "owner-complex", "Owner Complex", async () => {
    await page
      .getByRole("button", { name: "Add ability", exact: true })
      .click();
    await page.getByLabel("Trigger", { exact: true }).selectOption("condition");
    await page
      .getByLabel("Activation condition", { exact: true })
      .selectOption("and");
    const condition = page.getByRole("group", {
      name: "Activation condition",
      exact: true,
    });
    await condition
      .getByLabel("Combined condition 1", { exact: true })
      .selectOption("or");
    await condition
      .getByRole("button", { name: "Add combined condition", exact: true })
      .last()
      .click();
    const second = condition.getByRole("group", {
      name: "Combined condition 2",
      exact: true,
    });
    await second
      .getByLabel("Combined condition 2", { exact: true })
      .selectOption("not");
    await second
      .getByLabel("Negated condition", { exact: true })
      .selectOption("evolutionStage");
    await second
      .getByLabel("Target selection", { exact: true })
      .selectOption("all");
    await second
      .getByLabel("Target relationship", { exact: true })
      .selectOption("friendly");
    await second
      .getByLabel("Evolution stage definitions", { exact: true })
      .fill("sprout");
    await page
      .getByLabel("Power change (negative weakens) expression", { exact: true })
      .selectOption("clamp");
    await page
      .getByLabel("Uncapped amount expression", { exact: true })
      .selectOption("add");
    const uncapped = page.getByRole("group", {
      name: "Uncapped amount",
      exact: true,
    });
    const left = uncapped
      .getByRole("group", { name: "Left operand", exact: true })
      .first();
    await left
      .getByLabel("Left operand expression", { exact: true })
      .selectOption("history");
    await left
      .getByLabel("Historical event", { exact: true })
      .selectOption("destroyed");
    await left
      .getByLabel("Event relationship", { exact: true })
      .selectOption("enemy");
    const right = uncapped
      .getByRole("group", { name: "Right operand", exact: true })
      .first();
    await right
      .getByLabel("Right operand expression", { exact: true })
      .selectOption("subtract");
    await right
      .getByLabel("Left operand expression", { exact: true })
      .selectOption("value");
    await right
      .getByLabel("Numerical value", { exact: true })
      .selectOption("sourceBase");
    await right.getByLabel("Right operand", { exact: true }).fill("1");
    await page.getByLabel("Maximum result", { exact: true }).fill("6");
    const effect = page.locator(".effect-editor");
    await effect
      .getByLabel("Target selection", { exact: true })
      .selectOption("row");
    await effect
      .getByLabel("Target relationship", { exact: true })
      .selectOption("friendly");
    await effect
      .getByLabel("Absolute row (zero based)", { exact: true })
      .fill("1");
    await effect.getByLabel("Minimum target power", { exact: true }).fill("2");
    await effect.getByLabel("Maximum target power", { exact: true }).fill("9");
    await effect
      .getByLabel("Target Kindred identifiers (comma separated)", {
        exact: true,
      })
      .fill("Nature");
    await effect
      .getByLabel("Target ordering", { exact: true })
      .selectOption("random");
    await effect.getByLabel("Maximum target count", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Add dynamic scaling", exact: true })
      .click();
    await page
      .getByLabel("Dynamic power amount expression", { exact: true })
      .selectOption("multiply");
    const dynamic = page.getByRole("group", {
      name: "Dynamic power amount",
      exact: true,
    });
    await dynamic
      .getByLabel("Configured constant", { exact: true })
      .fill("0.5");
    await dynamic
      .getByLabel("Input amount expression", { exact: true })
      .selectOption("count");
    await dynamic
      .getByLabel("Aggregate quantity", { exact: true })
      .selectOption("power");
    await dynamic
      .getByLabel("Target selection", { exact: true })
      .selectOption("column");
  });
  await page.reload();
  const c = (await workspace(page)).working.cards.find(
    (c) => c.id === "owner-complex",
  )!;
  expect(c.abilities[0].condition).toMatchObject({
    kind: "and",
    conditions: [
      { kind: "or" },
      {
        kind: "not",
        condition: {
          kind: "evolutionStage",
          target: { kind: "all", relation: "friendly" },
          definitions: ["sprout"],
        },
      },
    ],
  });
  expect(c.abilities[0].effects[0]).toMatchObject({
    amount: {
      kind: "clamp",
      max: 6,
      value: {
        kind: "add",
        left: { kind: "history", event: "destroyed" },
        right: { kind: "subtract" },
      },
    },
    target: {
      kind: "row",
      row: 1,
      minPower: 2,
      maxPower: 9,
      order: "random",
      maxTargets: 2,
      kindreds: ["Nature"],
    },
  });
  expect(c.scaling![0].amount).toMatchObject({
    kind: "multiply",
    constant: 0.5,
    value: { kind: "count", what: "power", target: { kind: "column" } },
  });
  await nav(page, "Card Library");
  await page
    .getByLabel("Advanced mechanic filter", { exact: true })
    .selectOption("variable");
  await expect(
    page.getByRole("button", { name: "Edit Owner Complex", exact: true }),
  ).toBeVisible();
});

test("a failed laboratory installation keeps the loaded owner draft and active library available", async ({
  page,
}) => {
  await open(page);
  await create(
    page,
    "owner-recovery-safe",
    "Owner Recovery Safe",
    async () => {},
  );
  const old = await workspace(page);
  old.versions = old.versions.filter((v) => v.engineVersion === "1.1.0");
  old.scenarios = [];
  old.replays = [];
  old.reports = [];
  old.activeVersion = "founding-kindreds-150-v1";
  await nav(page, "Content Versions and Backups");
  await page
    .getByLabel("Import Studio content file", { exact: true })
    .setInputFiles({
      name: "old-owner-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "kindred-dominion-studio",
          schema: 1,
          engineVersion: "1.1.0",
          type: "backup",
          data: old,
        }),
      ),
    });
  await page.getByRole("checkbox", { name: /I reviewed conflicts/ }).check();
  await page
    .getByRole("button", {
      name: "Apply validated import atomically",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Content operation saved.", { exact: false }),
  ).toBeVisible();
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const result = put.apply(this, args);
      queueMicrotask(() => {
        try {
          this.transaction.abort();
        } catch {}
      });
      return result;
    };
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Your saved workspace is available",
  );
  await nav(page, "Card Library");
  await page
    .getByLabel("Search name or identifier", { exact: true })
    .fill("owner-recovery-safe");
  await expect(
    page.getByRole("button", { name: "Edit Owner Recovery Safe", exact: true }),
  ).toBeVisible();
  const kept = await workspace(page);
  expect(kept.working.cards.some((c) => c.id === "owner-recovery-safe")).toBe(
    true,
  );
  expect(kept.activeVersion).toBe("founding-kindreds-150-v1");
  expect(kept.versions.some((v) => v.engineVersion === "1.3.0")).toBe(false);
});

test.beforeEach(async ({ page }) => { await prepareHistoricalContent(page); });
