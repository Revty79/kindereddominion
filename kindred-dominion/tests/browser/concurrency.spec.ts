import { expect, test } from "@playwright/test";
test("bundled content initializes once under StrictMode and stale tabs cannot overwrite newer drafts", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  for (const p of [page, other]) {
    await p
      .getByRole("button", { name: "Developer Studio", exact: true })
      .click();
    await expect(p.getByRole("alert")).toHaveCount(0);
    await p
      .getByRole("navigation")
      .getByRole("button", { name: "Card Library", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Edit Briar Sprout", exact: true })
      .click();
  }
  await page.getByLabel("Base power", { exact: true }).fill("9");
  await page
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Card saved to the working draft.", { exact: false }),
  ).toBeVisible();
  await other.getByLabel("Base power", { exact: true }).fill("8");
  await other
    .getByRole("button", { name: "Save card", exact: true })
    .first()
    .click();
  await expect(
    other.getByText("Another tab has newer Studio changes.", { exact: false }),
  ).toBeVisible();
  await other.reload();
  await other
    .getByRole("navigation")
    .getByRole("button", { name: "Card Library", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Edit Briar Sprout", exact: true })
    .click();
  await expect(other.getByLabel("Base power", { exact: true })).toHaveValue(
    "9",
  );
});
