import { expect, test } from "@playwright/test";
test("clean production checkout provides all 150 packaged cards and repository artwork with empty browser storage", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.KINDRED_CLEAN_URL,
    "Run against a separately built clean checkout with KINDRED_CLEAN_URL.",
  );
  test.setTimeout(90000);
  expect((await context.storageState()).origins).toEqual([]);
  await page.goto(process.env.KINDRED_CLEAN_URL!);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  const nav = (name: string) =>
    page
      .getByRole("navigation", { name: "Developer Studio sections" })
      .getByRole("button", { name, exact: true })
      .click();
  await nav("Content Versions and Backups");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByText("founding-artwork-test-v1", { exact: true }),
    });
  await expect(row).toContainText("150");
  await row
    .getByRole("button", { name: "Restore as new draft", exact: true })
    .click();
  await expect(
    page.getByText("Content operation saved.", { exact: false }),
  ).toBeVisible();
  await row
    .getByRole("button", { name: "Activate for new matches", exact: true })
    .click();
  await nav("Card Library");
  await page.getByLabel("Search name or identifier").fill("Briar Sprout");
  await expect(page.locator(".studio-art-thumbnail")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".studio-art-thumbnail")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  expect(
    await page.locator(".studio-art-thumbnail").getAttribute("src"),
  ).toContain("assets/cards/nature/");
  expect(
    await page.locator(".studio-art-thumbnail").getAttribute("src"),
  ).not.toContain("data:");
  await page.getByRole("button", { name: "Briar Sprout", exact: true }).click();
  await expect(page.locator(".studio-card-preview img")).toBeVisible();
  await page
    .getByRole("button", { name: "Return to game", exact: true })
    .click();
  await page.getByRole("button", { name: "Card library", exact: true }).click();
  await expect(page.locator(".library-grid article")).toHaveCount(150);
  await page
    .getByRole("button", { name: "Close The Founding Kindreds", exact: true })
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
  expect(
    await page.locator(".hand-card img").first().getAttribute("src"),
  ).not.toContain("data:");
  await page.locator(".hand-card").first().click();
  await page.locator(".cell.legal").first().click();
  await page.getByRole("button", { name: /^Place at [A-Z][0-9]+$/ }).click();
  await expect(
    page.locator('.cell img[alt="Briar Sprout artwork"]'),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.cell img[alt="Briar Sprout artwork"]')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: ".local/artwork-validation/clean-production-hand-and-field.png",
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
  await page.route("**/assets/cards/nature/*.webp", (route) => route.abort());
  await page.reload();
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  await nav("Card Library");
  await page.getByLabel("Search name or identifier").fill("Briar Sprout");
  await expect
    .poll(() => page.locator(".studio-art-thumbnail").getAttribute("src"))
    .toContain("fallback.svg");
  await expect
    .poll(() =>
      page
        .locator(".studio-art-thumbnail")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
});
