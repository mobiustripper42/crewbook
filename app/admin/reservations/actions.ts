"use server";

// Phase 1.7 — "Pull Week" server action. Triggers the existing 1.4/1.5 sync
// pipelines for the visible week's date range, then revalidates the page so
// the table reflects the new mirror state.
//
// Auth posture: this surface is admin-only conceptually but real auth (magic
// link → profiles.is_admin) lands in Phase 5.1. Until then, the page is
// effectively open. The sync functions write via the service-role client.

import { revalidatePath } from "next/cache";

import { syncEvents } from "@/lib/xola/events";
import { syncOrders } from "@/lib/xola/orders";

import { weekRange } from "./week";

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
