// Phase 1.4: pull Xola orders (reservations) for a date range, cache locally.
//
// Endpoint: GET /api/orders (flat — NOT seller-scoped in path; seller is a
// query param). See docs/XOLA_INTEGRATION.md for the full operator surface.
//
// Date range: items.arrival is the trip date the customer booked (vs
// createdAt which is the booking timestamp). We always filter by arrival.
//
// Status filter: per DEC-115, we mirror confirmed (200, 201, 202, 203) +
// cancelled (700). Excludes pending/hold (100s). Status filter is on
// items.status (per-item), not a top-level order field.
//
// Pagination: skip-based, NOT cursor-based. Uses lib/xola/paginate-skip.ts.

import { xolaFetch } from "./client.ts";
import { resolveXolaSellerId } from "./env.ts";
import { paginateSkip } from "./paginate-skip.ts";
import type { Json } from "../supabase/types.ts";

export interface XolaOrder {
  id: string;
  // Passthrough — items, customer, payment, etc. all live here. Phase 1.6
  // unpacks items into events at the right granularity.
  [key: string]: unknown;
}

// DEC-115 default status set: confirmed family + explicit cancellation.
// 200 confirmed, 201 deposit (deprecated but still real), 202 confirmed-uncharged,
// 203 pay-later, 700 canceled.
export const DEFAULT_STATUS_CODES = [200, 201, 202, 203, 700] as const;

const PAGE_LIMIT = 100;

export interface FetchOrdersOptions {
  // ISO date strings — items.arrival[gte] / items.arrival[lte].
  start: string;
  end: string;
  sellerId?: string;
  statusCodes?: readonly number[];
  fetcher?: typeof xolaFetch;
  limit?: number;
}

export async function fetchOrders(options: FetchOrdersOptions): Promise<XolaOrder[]> {
  const sellerId = options.sellerId ?? resolveXolaSellerId();
  const statusCodes = options.statusCodes ?? DEFAULT_STATUS_CODES;
  const limit = options.limit ?? PAGE_LIMIT;

  // Composed query string. Order doesn't matter to Xola; we order
  // for grep-ability in logs.
  const params = new URLSearchParams();
  params.set("seller", sellerId);
  params.set("items.arrival[gte]", options.start);
  params.set("items.arrival[lte]", options.end);
  params.set("items.status[in]", statusCodes.join(","));
  params.set("limit", String(limit));
  const basePath = `/api/orders?${params.toString()}`;

  return paginateSkip<XolaOrder>(basePath, {
    fetcher: options.fetcher,
    limit,
    label: "fetchOrders",
  });
}

export interface SyncResult {
  count: number;
}

export type OrderWriter = (rows: OrderRow[]) => Promise<void>;

export interface OrderRow {
  id: string;
  seller_id: string;
  raw: Json;
  synced_at: string;
}

export interface SyncOrdersOptions extends FetchOrdersOptions {
  writer?: OrderWriter;
}

export async function syncOrders(options: SyncOrdersOptions): Promise<SyncResult> {
  const sellerId = options.sellerId ?? resolveXolaSellerId();
  const rows = await fetchOrders({ ...options, sellerId });

  const valid: OrderRow[] = [];
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
    console.warn(`syncOrders: skipped ${skipped} malformed row(s) (missing id)`);
  }
  const writer = options.writer ?? defaultWriter;
  await writer(valid);
  return { count: valid.length };
}

async function defaultWriter(rows: OrderRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Dynamic import keeps server-only code out of test module graph;
  // tests always inject a writer.
  const { getSupabaseAdmin } = await import("../supabase/server.ts");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("xola_orders")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`xola_orders upsert failed: ${error.message}`);
  }
}
