import { expect, type Page } from "@playwright/test";

// Inherited cases still exercise their original historical libraries. New owner
// and playback acceptance cases deliberately do not use this fixture.
export async function prepareHistoricalContent(page: Page) {
  // Explicit UI-only developer fixture for cases that create a fresh touch context.
  await page.route("**/api/session",route=>route.fulfill({json:{player:{role:"developer"},csrf:"historical-ui-only",registration:"closed"}}));
  await page.goto("/practice.html");
  await page.getByRole("button", { name: "Developer Studio", exact: true }).click();
  await page.getByRole("navigation", { name: "Developer Studio sections" }).getByRole("button", { name: "Content Versions and Backups", exact: true }).click();
  const founding = page.getByRole("row").filter({ has: page.getByText("founding-kindreds-150-v1", { exact: true }) });
  await founding.getByRole("button", { name: "Restore as new draft", exact: true }).click();
  await expect(page.getByText("Content operation saved.", { exact: false })).toBeVisible();
  const original = page.getByRole("row").filter({ has: page.getByText("v1.1-baseline", { exact: true }) });
  await original.getByRole("button", { name: "Activate for new matches", exact: true }).click();
  await expect(page.getByText(/Active version: Original V1.1/)).toContainText("Original V1.1");
  await page.getByRole("button", { name: "Return to game", exact: true }).click();
  await page.getByText("Learning and action playback", { exact: true }).click();
  await page.getByLabel("Presentation speed", { exact: true }).selectOption("skip");
  await page.getByText("Learning and action playback", { exact: true }).click();
}
