import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";

// Phase 1.8 smoke. The local DB starts with just the seeded admin and no
// Xola guides (sandbox sync isn't deterministic). These tests inject a
// known guide row directly into xola_guides for the duration of the test,
// then clean up. Uses the local service-role key from .env.local.

const TEST_GUIDE_ID = "test-pw-guide-1.8";
const TEST_GUIDE_NAME = "Playwright Test Guide";
const TEST_GUIDE_EMAIL = "pw-test-guide@brewboat.local";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Phase 1.8 spec needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local — see docs/TEST.md",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

test.describe("/admin/staff", () => {
  test.beforeEach(async () => {
    const supabase = admin();
    // Clean any prior link to the test guide + any profile created from it.
    await supabase.from("profiles").update({ xola_guide_id: null }).eq("xola_guide_id", TEST_GUIDE_ID);
    await supabase.from("profiles").delete().eq("email", TEST_GUIDE_EMAIL);
    await supabase
      .from("profiles")
      .delete()
      .eq("email", `xola-${TEST_GUIDE_ID}@brewboat.local`);
    await supabase.from("xola_guides").delete().eq("id", TEST_GUIDE_ID);
    // Insert the test guide.
    const { error } = await supabase.from("xola_guides").upsert({
      id: TEST_GUIDE_ID,
      name: TEST_GUIDE_NAME,
      email: TEST_GUIDE_EMAIL,
      seller_id: "test-seller",
      raw: { id: TEST_GUIDE_ID, name: TEST_GUIDE_NAME, email: TEST_GUIDE_EMAIL },
    });
    if (error) throw error;
  });

  test.afterEach(async () => {
    const supabase = admin();
    await supabase.from("profiles").update({ xola_guide_id: null }).eq("xola_guide_id", TEST_GUIDE_ID);
    await supabase.from("profiles").delete().eq("email", TEST_GUIDE_EMAIL);
    await supabase
      .from("profiles")
      .delete()
      .eq("email", `xola-${TEST_GUIDE_ID}@brewboat.local`);
    await supabase.from("xola_guides").delete().eq("id", TEST_GUIDE_ID);
  });

  test("renders the seeded test guide and the admin in the orphans section", async ({ page }) => {
    await page.goto("/admin/staff");
    await expect(page.getByRole("heading", { name: "Staff Cross-Reference" })).toBeVisible();
    await expect(page.getByTestId(`guide-${TEST_GUIDE_ID}`)).toBeVisible();
    // Local Admin profile has no xola_guide_id → orphans section.
    const orphans = page.getByTestId("orphans-section");
    await expect(orphans).toBeVisible();
    await expect(orphans.getByText("Local Admin")).toBeVisible();
  });

  test("create-profile-from-guide flow links the new profile to the guide", async ({ page }) => {
    await page.goto("/admin/staff");
    const guideCard = page.getByTestId(`guide-${TEST_GUIDE_ID}`);
    // Card should start unlinked.
    await expect(guideCard).toHaveAttribute("data-linked", "false");
    await guideCard.getByTestId(`create-${TEST_GUIDE_ID}`).click();
    // After the action revalidates, the card should now read linked + show the guide name.
    await expect(guideCard).toHaveAttribute("data-linked", "true");
    await expect(guideCard.getByText(/Linked to/)).toBeVisible();
    // The new profile should carry the guide's name.
    await expect(guideCard.getByText(TEST_GUIDE_NAME)).toHaveCount(2); // header + linked-to line
  });

  test("no Serious or Critical a11y violations", async ({ page }) => {
    await page.goto("/admin/staff");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
