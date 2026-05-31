"use server";

// Phase 2.4 — shift-edit server actions: delete a shift, or merge several into
// one. Both mutate via the service-role client (auth posture is the same as the
// rest of /admin/* — real auth lands in Phase 5.1) and revalidate the shifts
// page so the board reflects the new state.
//
// Merge re-reads the selected rows by id from the DB rather than trusting
// client-supplied times — no Xola re-pull, just a keyed read of the shifts
// table. Split is deferred to a follow-up task.
//
// No transactions in supabase-js. A unique index on
// (week_start, boat_resource_id, start_time) — the 2.2 idempotency anchor —
// means the merged row can collide with a source that shares its start_time, so
// the sources must be deleted BEFORE the merged row is inserted. To avoid data
// loss if that insert then fails, we snapshot the originals and re-insert them
// (best-effort rollback).

import { revalidatePath } from "next/cache";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { buildMergedShift } from "@/lib/shifts/edit";

export interface ShiftEditResult {
  ok: boolean;
  error?: string;
}

export async function deleteShift(id: string): Promise<ShiftEditResult> {
  if (!id) return { ok: false, error: "shift id is required" };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, error: `shift delete: ${error.message}` };

  revalidatePath("/admin/shifts");
  return { ok: true };
}

export async function mergeShifts(ids: string[]): Promise<ShiftEditResult> {
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (unique.length < 2) {
    return { ok: false, error: "Select at least 2 shifts to merge." };
  }

  const supabase = getSupabaseAdmin();

  // Re-read the rows by id — authoritative source for the merge computation.
  const { data: rows, error: readErr } = await supabase
    .from("shifts")
    .select("*")
    .in("id", unique);
  if (readErr) return { ok: false, error: `shifts read: ${readErr.message}` };
  if (!rows || rows.length !== unique.length) {
    return { ok: false, error: "Some selected shifts no longer exist — refresh and try again." };
  }

  const merged = buildMergedShift(rows);
  if (!merged.ok) return { ok: false, error: merged.error };

  // Delete the sources first (the unique index forbids insert-first when the
  // merged row shares a source's start_time).
  const delRes = await supabase.from("shifts").delete().in("id", unique);
  if (delRes.error) return { ok: false, error: `shifts delete: ${delRes.error.message}` };

  const insertRes = await supabase.from("shifts").insert(merged.row);
  if (insertRes.error) {
    // Roll back so the merge is all-or-nothing: restore the originals we just
    // removed. ShiftRow carries every column, so re-inserting is exact.
    const restore = await supabase.from("shifts").insert(rows);
    const restoreNote = restore.error
      ? ` Restoring the originals also failed: ${restore.error.message} — data may be lost.`
      : " Originals restored.";
    return { ok: false, error: `merged insert: ${insertRes.error.message}.${restoreNote}` };
  }

  revalidatePath("/admin/shifts");
  return { ok: true };
}
