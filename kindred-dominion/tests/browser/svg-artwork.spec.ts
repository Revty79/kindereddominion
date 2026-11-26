import { expect, test } from "@playwright/test";
test("safe SVG imports as optimized artwork and unsafe SVG is rejected without replacing it", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Developer Studio", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Card Library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Briar Sprout", exact: true })
    .click();
  const file = page.getByLabel(
    "Local artwork (optional, PNG/JPEG/WebP/SVG, up to 10 MB)",
    { exact: true },
  );
  await file.setInputFiles("artwork-source/validation/sprout-study.svg");
  await expect(
    page.getByText("Source artwork preserved locally;", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".studio-card-preview img")
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const good = await page
    .locator(".studio-card-preview img")
    .getAttribute("src");
  await file.setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><script>alert(1)</script></svg>',
    ),
  });
  await expect(
    page.getByText("SVG element script is not permitted.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.locator(".studio-card-preview img").getAttribute("src"),
  ).toBe(good);
});
