import { prepareHistoricalContent } from "./historical-setup";
import { expect, test } from "./practice-fixture";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { unzipSync } from "fflate";
import { readFileSync } from "node:fs";
test("temporary artwork travels from Studio approval to a validated portable package and live gameplay", async ({
  page,
}) => {
  test.setTimeout(90000);
  const nav = (name: string) =>
    page
      .getByRole("navigation", { name: "Developer Studio sections" })
      .getByRole("button", { name, exact: true })
      .click();
  await page.goto("/practice.html");
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  await nav("Card Library");
  await page.getByLabel("Search name or identifier").fill("Briar Sprout");
  await page
    .getByRole("button", { name: "Edit Briar Sprout", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Card saved to the working draft.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".studio-card-preview img")).toBeVisible();
  expect(
    await page
      .locator(".studio-card-preview img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await nav("Card Library");
  await page.getByLabel("Search name or identifier").fill("Briar Sprout");
  await expect(page.locator(".studio-library-card .collectible-art img")).toBeVisible();
  await nav("Content Versions and Backups");
  await page
    .getByLabel("Checkpoint name", { exact: true })
    .fill("Artwork acceptance local version");
  await page
    .getByLabel("Checkpoint status", { exact: true })
    .selectOption("testing");
  await page
    .getByRole("button", { name: "Create named checkpoint", exact: true })
    .click();
  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", {
      name: /^Artwork acceptance local version/,
    }),
  });
  await expect(row).toBeVisible();
  await page
    .getByLabel("Publishing content source", { exact: true })
    .selectOption("working");
  await page
    .getByLabel("Published content identifier", { exact: true })
    .fill("founding-artwork-test-v1");
  await page
    .getByLabel("Published content name", { exact: true })
    .fill("Founding Kindreds · temporary artwork validation");
  await page
    .getByRole("checkbox", {
      name: "I explicitly approve these definition revisions for the selected publication level.",
      exact: true,
    })
    .check();
  const exported = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export approved content and artwork package",
      exact: true,
    })
    .click();
  const download = await exported;
  await mkdir(".local/artwork-validation", { recursive: true });
  const file = ".local/artwork-validation/founding-artwork-test-v1.kindred.zip";
  await download.saveAs(file);
  const validation = execFileSync(
    process.execPath,
    ["scripts/import-content.mjs", file, "--validate-only", "--replace"],
    { encoding: "utf8" },
  );
  expect(JSON.parse(validation).assets).toBe(1);
  await row
    .getByRole("button", { name: "Activate for new matches", exact: true })
    .click();
  await expect(row.getByRole("cell").nth(1)).toContainText("ACTIVE");
  await page
    .getByRole("button", { name: "Return to game", exact: true })
    .click();
  await page
    .getByText("Play format & battlefield options", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Play format", exact: true })
    .selectOption("free");
  await page.getByLabel("Match seed").fill("9461");
  await page
    .getByRole("button", { name: "Build deck", exact: true })
    .first()
    .click();
  await page.getByLabel("Search cards").fill("Briar Sprout");
  for (let i = 0; i < 15; i++)
    await page
      .getByRole("button", { name: "Add Briar Sprout", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Use this deck", exact: true })
    .click();
  await page.getByRole("button", { name: "Begin match" }).click();
  await page.getByRole("button", { name: "Keep hand", exact: true }).click();
  await page.getByRole("heading", { name: "Jade to command." }).waitFor();
  await expect(page.locator(".hand-card img").first()).toBeVisible();
  await page.locator(".hand-card").first().click();
  await page.locator(".cell.legal").first().click();
  await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).click();
  await expect(
    page.locator('.cell img[alt="Briar Sprout illustration"]'),
  ).toBeVisible();
  expect(
    await page
      .locator('.cell img[alt="Briar Sprout illustration"]')
      .evaluate((img: HTMLImageElement) => img.naturalWidth > 0),
  ).toBe(true);
  await page.screenshot({
    path: ".local/artwork-validation/local-hand-and-field.png",
    fullPage: true,
  });
});
test("published artwork and a new local illustration can be exported together with original source masters", async ({
  page,
}) => {
  await page.goto("/practice.html");
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  const nav = (name: string) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
  await nav("Content Versions and Backups");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByText("founding-artwork-test-v1", { exact: true }),
    });
  await row
    .getByRole("button", { name: "Restore as new draft", exact: true })
    .click();
  await expect(
    page.getByText("Content operation saved.", { exact: false }),
  ).toBeVisible();
  await nav("Card Library");
  await page
    .getByRole("button", { name: "Edit Leafguard", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Card saved to the working draft.", { exact: false }),
  ).toBeVisible();
  await nav("Content Versions and Backups");
  await page
    .getByLabel("Published content identifier", { exact: true })
    .fill("incremental-artwork-test-v2");
  await page
    .getByRole("checkbox", {
      name: "I explicitly approve these definition revisions for the selected publication level.",
      exact: true,
    })
    .check();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Export approved content and artwork package",
      exact: true,
    })
    .click();
  const download = await downloading;
  await mkdir(".local/artwork-validation", { recursive: true });
  const file = ".local/artwork-validation/incremental.kindred.zip";
  await download.saveAs(file);
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/import-content.mjs", file, "--validate-only"],
      { encoding: "utf8" },
    ),
  );
  expect(result.assets).toBe(1);
  const files = unzipSync(readFileSync(file));
  const content = JSON.parse(new TextDecoder().decode(files["content.json"]));
  expect(content.metadata.sprout.artworkRef).toEqual(
    content.metadata.leafguard.artworkRef,
  );
  expect(Object.keys(files).some((p) => p.startsWith("artwork-source/"))).toBe(
    true,
  );
});

test.beforeEach(async ({ page }) => { await prepareHistoricalContent(page); });
