import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Phase 1.7 smoke. The seeded sandbox week is 2026-05-18 (loaded from the
// Session 8 sync); the default route should land on it and render the table.

test.describe("/admin/reservations", () => {
  test("renders the seeded-sandbox-week table with the Pull Week button", async ({ page }) => {
    await page.goto("/admin/reservations");

    await expect(page.getByRole("heading", { name: "Reservations" })).toBeVisible();
    await expect(page.getByTestId("pull-week")).toBeVisible();
    await expect(page.getByTestId("week-input")).toHaveValue("2026-05-18");

    // Either the table or the empty-state must render — never both, never
    // neither — so the page always has a single primary surface.
    const table = page.getByTestId("slots-table");
    const empty = page.getByTestId("empty-state");
    const tableVisible = await table.isVisible().catch(() => false);
    const emptyVisible = await empty.isVisible().catch(() => false);
    expect(tableVisible || emptyVisible).toBe(true);
    expect(tableVisible && emptyVisible).toBe(false);

    if (tableVisible) {
      // Each row reflects the 1.6 mapper output for the seeded brewboat events.
      await expect(table.locator("tbody tr").first()).toBeVisible();
      await expect(table.getByText("Brewboat Tour - captained").first()).toBeVisible();
    }
  });

  test("week picker navigates to the requested week", async ({ page }) => {
    await page.goto("/admin/reservations");
    await page.getByTestId("week-input").fill("2024-01-01");
    await Promise.all([
      page.waitForURL(/week=2024-01-01/),
      page.getByRole("button", { name: "Go" }).click(),
    ]);
    // 2024-01-01 was a Monday — week range header should reflect it.
    await expect(page.getByTestId("week-range")).toContainText("2024-01-01");
    // No seeded data for that week → empty-state.
    await expect(page.getByTestId("empty-state")).toBeVisible();
  });

  test("Generate Shifts button is visible and surfaces the no-slots error on an empty week", async ({ page }) => {
    // Use a week with no mirrored data so the action short-circuits before
    // calling the live Anthropic API — exercises the wiring without spend.
    await page.goto("/admin/reservations?week=2024-01-01");
    const btn = page.getByTestId("generate-shifts");
    await expect(btn).toBeVisible();
    await expect(page.getByTestId("generate-shifts-force")).toBeVisible();
    await btn.click();
    await expect(page.getByTestId("generate-shifts-error")).toContainText("No mirrored slots");
  });

  test("no Serious or Critical a11y violations on the default view", async ({ page }) => {
    await page.goto("/admin/reservations");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
