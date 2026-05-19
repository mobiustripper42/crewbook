import { expect, test } from "@playwright/test";

test("home page renders with version tag", async ({ page }) => {
  await page.goto("/");
  const tag = page.getByTestId("version-tag");
  await expect(tag).toBeVisible();
  await expect(tag).toHaveText(/^v\d+\.\d+\.\d+/);
});
