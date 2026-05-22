// Phase 1.5: pull Xola events (time slots) for a date range, cache locally.
//
// Endpoint: GET /api/events (flat, NOT seller-scoped in path — but `seller`
// query param is REQUIRED here, unlike /api/orders where it's optional).
// See docs/XOLA_INTEGRATION.md "Events endpoint — gotchas" for the full
// surface: date filter is UNIX epoch seconds + timezone offset (not the
// items.arrival[gte] query operators that work on /api/orders), and the
// `reserved=true` filter is the closest server-side proxy for "trips that
// need a captain" since events don't carry order status.
//
// Pagination is undocumented for this endpoint. V1 ships single-page and
// surfaces the page size in logs so we can spot if Xola starts capping us.
// Probe with the response-wrapper inspection in scripts/xola-ping-events.mjs
// once sandbox data exists; retrofit with paginate-skip if Xola paginates.

import { xolaFetch } from "./client.ts";
import { resolveXolaSellerId } from "./env.ts";
import { localDateToEpochSeconds, getOffsetSeconds } from "./timezone.ts";
import type { Json } from "../supabase/types.ts";

export interface XolaEvent {
  id: string;
  // Passthrough — experience reference, start/end timestamps, seat counts,
  // reservation summary all live here. Phase 1.6 unpacks these.
  [key: string]: unknown;
}

// Sandbox probe (2026-05-22) revealed /api/events returns a bare JSON
// array (XolaEvent[]) — NOT the {data, paging} envelope shape that
// /api/orders and /api/experiences use. Accept both forms defensively so
// a future Xola change to wrap responses doesn't silently break us.
type EventsListResponse = XolaEvent[] | { data: XolaEvent[]; paging?: { total?: number; next?: string } };

// BrewBoat seller TZ. When V2 multi-seller lands, this moves to the
// installations table (DEC-114 forward direction).
export const DEFAULT_TIMEZONE = "America/New_York";

export interface FetchEventsOptions {
  // ISO date strings (YYYY-MM-DD). Treated as local midnight in `timezone`
  // for `start`, and local end-of-day (23:59:59) for `end` — so the window
  // covers the full days in the seller's local time.
  start: string;
  end: string;
  sellerId?: string;
  // Comma-joined experience IDs to filter to specific products.
  experienceIds?: readonly string[];
  // Default true per DEC-105-equivalent reasoning: BrewBoat schedules
  // against bookings, not empty slots.
  reserved?: boolean;
  timezone?: string;
  fetcher?: typeof xolaFetch;
}

export async function fetchEvents(options: FetchEventsOptions): Promise<XolaEvent[]> {
  const sellerId = options.sellerId ?? resolveXolaSellerId();
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const reserved = options.reserved ?? true;
  const fetcher = options.fetcher ?? xolaFetch;

  const startEpoch = localDateToEpochSeconds(options.start, timezone, 0, 0, 0);
  const endEpoch = localDateToEpochSeconds(options.end, timezone, 23, 59, 59);
  // Offset for the midpoint of the window — handles DST transitions that
  // fall inside the window by picking one side; sub-second drift is
  // acceptable for the Xola filter semantics (it's a window not a stamp).
  const midpointMs = ((startEpoch + endEpoch) / 2) * 1000;
  const offsetSec = getOffsetSeconds(new Date(midpointMs), timezone);

  const params = new URLSearchParams();
  params.set("seller", sellerId);
  params.set("start", String(startEpoch));
  params.set("end", String(endEpoch));
  params.set("offset", String(offsetSec));
  if (reserved) params.set("reserved", "true");
  if (options.experienceIds && options.experienceIds.length > 0) {
    params.set("experience", options.experienceIds.join(","));
  }
  const path = `/api/events?${params.toString()}`;

  const res = await fetcher<EventsListResponse>(path);
  if (Array.isArray(res)) return res;
  // Wrapped shape — log so we notice if Xola starts adding pagination metadata.
  if (res && "paging" in res && res.paging) {
    console.warn(
      `fetchEvents: response includes paging wrapper (${JSON.stringify(res.paging)}) — pagination may be available; revisit lib/xola/events.ts`,
    );
  }
  return Array.isArray(res?.data) ? res.data : [];
}

export interface SyncResult {
  count: number;
}

export type EventWriter = (rows: EventRow[]) => Promise<void>;

export interface EventRow {
  id: string;
  seller_id: string;
  raw: Json;
  synced_at: string;
}

export interface SyncEventsOptions extends FetchEventsOptions {
  writer?: EventWriter;
}

export async function syncEvents(options: SyncEventsOptions): Promise<SyncResult> {
  const sellerId = options.sellerId ?? resolveXolaSellerId();
  const rows = await fetchEvents({ ...options, sellerId });

  const valid: EventRow[] = [];
  let skipped = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    if (typeof row?.id === "string" && row.id) {
      valid.push({
        id: row.id,
        seller_id: sellerId,
        raw: row as unknown as Json,
        synced_at: now,
      });
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    console.warn(`syncEvents: skipped ${skipped} malformed row(s) (missing id)`);
  }
  const writer = options.writer ?? defaultWriter;
  await writer(valid);
  return { count: valid.length };
}

async function defaultWriter(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { getSupabaseAdmin } = await import("../supabase/server.ts");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("xola_events")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`xola_events upsert failed: ${error.message}`);
  }
}
