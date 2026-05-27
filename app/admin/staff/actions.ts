"use server";

// Phase 1.8 — server actions for the staff cross-reference admin page.
// All actions write via the service-role client (no auth yet; magic-link
// lands in Phase 5.1, then this surface gets gated by is_admin()).
//
// Return shape: every action returns {ok, error?} so the Client Component
// can surface inline feedback. Sequential not transactional — for V1's
// volume (≤ a dozen guides + profiles) and admin-driven cadence, a row
// at a time is fine.

import { revalidatePath } from "next/cache";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
  profile_id?: string;
}

function readString(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function readBoolean(formData: FormData, key: string): boolean {
  // <input type=checkbox> sets value=on when checked, omits the key entirely
  // when not. Treat both "on" and "true" as true; everything else false.
  const v = formData.get(key);
  return v === "on" || v === "true";
}

// Set xola_guide_id on a profile to link it to a Xola guide. Idempotent —
// re-linking the same pair is a no-op.
export async function linkGuideToProfile(formData: FormData): Promise<ActionResult> {
  const guideId = readString(formData, "guide_id");
  const profileId = readString(formData, "profile_id");
  if (!guideId || !profileId) {
    return { ok: false, error: "guide_id and profile_id required" };
  }
  const supabase = getSupabaseAdmin();
  // Clear any prior link from this profile or any prior link TO this guide
  // (xola_guide_id is unique) so we don't trip the uniqueness constraint.
  const { error: clearErr } = await supabase
    .from("profiles")
    .update({ xola_guide_id: null })
    .eq("xola_guide_id", guideId);
  if (clearErr) return { ok: false, error: `clear prior link: ${clearErr.message}` };

  const { error } = await supabase
    .from("profiles")
    .update({ xola_guide_id: guideId })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff");
  return { ok: true, profile_id: profileId };
}

export async function unlinkGuide(formData: FormData): Promise<ActionResult> {
  const profileId = readString(formData, "profile_id");
  if (!profileId) return { ok: false, error: "profile_id required" };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({ xola_guide_id: null })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff");
  return { ok: true, profile_id: profileId };
}

// Create a new profile rooted in a Xola guide. Copies name + email from
// the guide; leaves auth_user_id null (Phase 5.1 fills it on first sign-in).
// Email-null guides get a placeholder address so the NOT NULL + UNIQUE
// constraint on profiles.email is satisfied — Drew edits it later.
export async function createProfileFromGuide(formData: FormData): Promise<ActionResult> {
  const guideId = readString(formData, "guide_id");
  if (!guideId) return { ok: false, error: "guide_id required" };
  const supabase = getSupabaseAdmin();
  const { data: guide, error: guideErr } = await supabase
    .from("xola_guides")
    .select("id, name, email")
    .eq("id", guideId)
    .single();
  if (guideErr) return { ok: false, error: `read guide: ${guideErr.message}` };
  if (!guide) return { ok: false, error: "guide not found" };

  // Placeholder email when Xola has none. The xola guide id is opaque + stable,
  // so the synthesized address never collides between profiles.
  const email = guide.email && guide.email.trim().length > 0
    ? guide.email.trim().toLowerCase()
    : `xola-${guide.id}@brewboat.local`;

  // Clear any prior link to this guide first to honor xola_guide_id uniqueness.
  await supabase
    .from("profiles")
    .update({ xola_guide_id: null })
    .eq("xola_guide_id", guideId);

  const { data: created, error: insertErr } = await supabase
    .from("profiles")
    .insert({
      email,
      full_name: guide.name,
      xola_guide_id: guide.id,
      // auth_user_id stays null — DEC-116 entry point.
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };
  revalidatePath("/admin/staff");
  return { ok: true, profile_id: created?.id };
}

// Update role flags + boat quals for a profile. boat_quals comes in as a
// comma-separated string (simplest input widget for V1); split + trim into
// a string[] before persisting.
export async function updateProfileRoles(formData: FormData): Promise<ActionResult> {
  const profileId = readString(formData, "profile_id");
  if (!profileId) return { ok: false, error: "profile_id required" };
  const boatQualsRaw = readString(formData, "boat_quals");
  const boatQuals = boatQualsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("profiles")
    .update({
      is_admin: readBoolean(formData, "is_admin"),
      is_captain: readBoolean(formData, "is_captain"),
      is_mate: readBoolean(formData, "is_mate"),
      is_shore: readBoolean(formData, "is_shore"),
      boat_quals: boatQuals,
    })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/staff");
  return { ok: true, profile_id: profileId };
}
