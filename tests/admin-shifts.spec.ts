import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";

// Phase 2.3 — Shift review UI. Shifts aren't in seed.sql (they're agent output),
// so these tests inject known shift rows directly via the service-role client for
// a far-future test-only week — no live Anthropic spend — then clean up.

// 2030-01-07 is a Monday; week runs through Sunday 2030-01-13.
const TEST_MONDAY = "2030-01-07";
const TEST_TUESDAY = "2030-01-08";
const WEEK_END = "2030-01-13";
const EMPTY_WEEK = "2031-01-06"; // a Monday with no seeded or injected shifts
const TEST_BOAT_LABEL = "Test Boat Alpha";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Phase 2.3 spec needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local — see docs/TEST.md",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function clearTestWeek() {
  const supabase = admin();
  await supabase.from("shifts").delete().gte("shift_date", TEST_MONDAY).lte("shift_date", WEEK_END);
}

test.describe("/admin/shifts", () => {
  test.beforeEach(async () => {
    await clearTestWeek();
    const supabase = admin();
    const { error } = await supabase.from("shifts").insert([
      {
        week_start: TEST_MONDAY,
        shift_date: TEST_MONDAY,
        start_time: "09:00:00",
        end_time: "11:00:00",
        product_type: "brewboat",
        boat_label: TEST_BOAT_LABEL,
        roles: ["captain", "mate"],
        covered_event_ids: ["test-evt-1", "test-evt-2"],
        status: "draft",
      },
      {
        week_start: TEST_MONDAY,
        shift_date: TEST_MONDAY,
        start_time: "13:00:00",
        end_time: "15:00:00",
        product_type: "brewboat",
        boat_resource_id: "test-resource-aaaa11112222",
        roles: ["captain", "mate"],
        covered_event_ids: ["test-evt-3"],
        status: "draft",
      },
      {
        week_start: TEST_MONDAY,
        shift_date: TEST_TUESDAY,
        start_time: "10:00:00",
        end_time: "12:00:00",
        product_type: "brewboat",
        boat_label: "Test Boat Bravo",
        roles: ["captain", "mate"],
        covered_event_ids: ["test-evt-4"],
        status: "draft",
      },
    ]);
    if (error) throw error;
  });

  test.afterEach(async () => {
    await clearTestWeek();
  });

  test("groups generated shifts by day with role + coverage details", async ({ page }) => {
    await page.goto(`/admin/shifts?week=${TEST_MONDAY}`);

    await expect(page.getByRole("heading", { name: "Generated Shifts" })).toBeVisible();
    await expect(page.getByTestId("week-range")).toContainText(TEST_MONDAY);

    // Two days → two day groups; Monday holds 2 cards, Tuesday holds 1.
    const groups = page.getByTestId("shift-day-group");
    await expect(groups).toHaveCount(2);
    await expect(page.getByTestId("shift-card")).toHaveCount(3);

    // boat_label is preferred when present.
    await expect(page.getByText(TEST_BOAT_LABEL)).toBeVisible();
    // No-label shift falls back to the shortened resource id.
    await expect(page.getByText("…11112222")).toBeVisible();

    // Brewboat crew is always captain + mate — both badges render per card.
    await expect(page.getByTestId("shift-role").filter({ hasText: "captain" }).first()).toBeVisible();
    await expect(page.getByTestId("shift-role").filter({ hasText: "mate" }).first()).toBeVisible();

    // Coverage count reflects covered_event_ids length.
    await expect(page.getByTestId("shift-coverage").first()).toContainText("2 events");
  });

  test("shows the empty state on a week with no generated shifts", async ({ page }) => {
    await page.goto(`/admin/shifts?week=${EMPTY_WEEK}`);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("empty-state")).toContainText("Generate Shifts");
    await expect(page.getByTestId("shifts-list")).toHaveCount(0);
  });

  test("links back to reservations for the same week", async ({ page }) => {
    await page.goto(`/admin/shifts?week=${TEST_MONDAY}`);
    await expect(page.getByTestId("back-to-reservations")).toHaveAttribute(
      "href",
      `/admin/reservations?week=${TEST_MONDAY}`,
    );
  });

  test("no Serious or Critical a11y violations", async ({ page }) => {
    await page.goto(`/admin/shifts?week=${TEST_MONDAY}`);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking).toEqual([]);
  });
});
