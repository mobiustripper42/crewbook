"use server";

// Phase 1.7 — "Pull Week" server action. Triggers the existing 1.4/1.5 sync
// pipelines for the visible week's date range, then revalidates the page so
// the table reflects the new mirror state.
//
// Phase 2.2 — "Generate Shifts" server action. Pulls the mapped slots for
// the week, calls the shift-generation agent, records a scheduling_runs
// audit row (on success AND failure), inserts shifts on success. Idempotency
// is enforced by the regenerate gate: an admin must pass force=true to
// overwrite an existing week.
//
// Auth posture: this surface is admin-only conceptually but real auth (magic
// link → profiles.is_admin) lands in Phase 5.1. Until then, the page is
// effectively open. The sync functions write via the service-role client.

import { revalidatePath } from "next/cache";

import { generateShifts } from "@/lib/agents/shift-agent";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { buildRunRow, buildShiftRow, shouldRegenerate } from "@/lib/shifts/persist";
import { syncEvents } from "@/lib/xola/events";
import { syncOrders } from "@/lib/xola/orders";
import type { XolaEvent } from "@/lib/xola/events";
import type { XolaOrder } from "@/lib/xola/orders";
import {
  lookupFromEntries,
  mapSlotsForWeek,
  type ProductType,
  type TimeSlot,
} from "@/lib/xola/mapping";

import { filterSlotsInWeek, weekRange } from "./week";

export interface PullWeekResult {
  ok: boolean;
  error?: string;
  events?: number;
  orders?: number;
}

export async function pullWeek(formData: FormData): Promise<PullWeekResult> {
  const mondayRaw = formData.get("monday");
  const monday = typeof mondayRaw === "string" ? mondayRaw : "";
  if (!monday) {
    return { ok: false, error: "monday is required" };
  }

  let range;
  try {
    range = weekRange(monday);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    // Sequential, not parallel — keeps Xola request budget honest and
    // surfaces a first-failure error before doubling the rate-limit hit.
    const eventsResult = await syncEvents({ start: range.start, end: range.end });
    const ordersResult = await syncOrders({ start: range.start, end: range.end });
    revalidatePath("/admin/reservations");
    return { ok: true, events: eventsResult.count, orders: ordersResult.count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface GenerateShiftsResult {
  ok: boolean;
  error?: string;
  generated?: number;
  runId?: string;
}

export async function generateShiftsForWeek(formData: FormData): Promise<GenerateShiftsResult> {
  const mondayRaw = formData.get("monday");
  const monday = typeof mondayRaw === "string" ? mondayRaw : "";
  if (!monday) return { ok: false, error: "monday is required" };

  const force = formData.get("force") === "1";

  let range;
  try {
    range = weekRange(monday);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const supabase = getSupabaseAdmin();

  // Regenerate gate: how many shifts already exist for this week?
  const existingRes = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("week_start", monday);
  if (existingRes.error) return { ok: false, error: `shifts count: ${existingRes.error.message}` };
  const existingCount = existingRes.count ?? 0;
  const gate = shouldRegenerate({ existingCount, force });
  if (!gate.proceed) return { ok: false, error: gate.errorMessage };

  // Load the mirrored slots for the week — same query shape as the page.
  const [eventsRes, ordersRes, lookupRes] = await Promise.all([
    supabase.from("xola_events").select("raw"),
    supabase.from("xola_orders").select("raw"),
    supabase.from("product_type_lookup").select("xola_name, product_type"),
  ]);
  if (eventsRes.error) return { ok: false, error: `xola_events: ${eventsRes.error.message}` };
  if (ordersRes.error) return { ok: false, error: `xola_orders: ${ordersRes.error.message}` };
  if (lookupRes.error) return { ok: false, error: `product_type_lookup: ${lookupRes.error.message}` };

  const events: XolaEvent[] = (eventsRes.data ?? []).map((row) => row.raw as unknown as XolaEvent);
  const orders: XolaOrder[] = (ordersRes.data ?? []).map((row) => row.raw as unknown as XolaOrder);
  const lookup = lookupFromEntries(
    (lookupRes.data ?? []).map((row) => [row.xola_name, row.product_type as ProductType] as const),
  );
  const slots: TimeSlot[] = filterSlotsInWeek(mapSlotsForWeek(events, orders, lookup), range);

  if (slots.length === 0) {
    return { ok: false, error: `No mirrored slots for week of ${monday}. Pull the week first.` };
  }

  // Call the agent. Wrap so a model-side failure still records a
  // scheduling_runs row — every billed call is auditable.
  const inputSnapshot = { week_start: monday, slots };
  try {
    const result = await generateShifts({ slots, weekStart: monday, timezone: "America/New_York" });

    const runInsert = await supabase
      .from("scheduling_runs")
      .insert(buildRunRow({
        weekStart: monday,
        model: result.model,
        promptVersion: result.promptVersion,
        input: inputSnapshot,
        output: { shifts: result.shifts, raw: result.raw },
        usage: result.usage,
      }))
      .select("id")
      .single();
    if (runInsert.error) return { ok: false, error: `scheduling_runs: ${runInsert.error.message}` };
    const runId = runInsert.data.id;

    // If regenerating, wipe the existing week's agent-generated shifts now
    // (after a successful generation, before insert — minimizes the empty-
    // week window if the next step fails).
    if (existingCount > 0 && force) {
      const del = await supabase.from("shifts").delete().eq("week_start", monday);
      if (del.error) return { ok: false, error: `shifts delete: ${del.error.message}`, runId };
    }

    const rows = result.shifts.map((s) => buildShiftRow(s, { weekStart: monday, schedulingRunId: runId }));
    const shiftsInsert = await supabase.from("shifts").insert(rows);
    if (shiftsInsert.error) return { ok: false, error: `shifts insert: ${shiftsInsert.error.message}`, runId };

    revalidatePath("/admin/reservations");
    return { ok: true, generated: rows.length, runId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Record the failed call so it's not invisible — DEC-103 audit intent.
    // We don't have model/version unless generateShifts started; capture
    // what we know and tag with the prompt-version constant.
    const { AGENT_MODEL } = await import("@/lib/agents/client");
    const { SHIFT_AGENT_PROMPT_VERSION } = await import("@/lib/agents/shift-agent-prompt");
    await supabase.from("scheduling_runs").insert(buildRunRow({
      weekStart: monday,
      model: AGENT_MODEL,
      promptVersion: SHIFT_AGENT_PROMPT_VERSION,
      input: inputSnapshot,
      error: errorMessage,
    }));
    return { ok: false, error: errorMessage };
  }
}
