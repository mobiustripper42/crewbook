// Phase 1.3: pull Xola guides (crew known to Xola) for the active seller.
//
// Per DEC-114, guides live under the seller-scoped path
// `/api/sellers/{seller_id}/guides`. The plugin key sees every seller it has
// been installed with, but the URL specifies which one we want — there is
// no flat `/api/guides` endpoint.

import { xolaFetch } from "./client.ts";
import { resolveXolaSellerId } from "./env.ts";
import { paginate } from "./paginate.ts";
import type { Json } from "../supabase/types.ts";

export interface XolaGuide {
  id: string;
  name: string;
  email?: string;
  // Passthrough — Xola returns avatar, roles, phone, etc. Preserved in `raw`.
  [key: string]: unknown;
}

const PAGE_LIMIT = 100;

export async function fetchAllGuides(
  options: { fetcher?: typeof xolaFetch; sellerId?: string } = {},
): Promise<XolaGuide[]> {
  const sellerId = options.sellerId ?? resolveXolaSellerId();
  const firstPath = `/api/sellers/${sellerId}/guides?limit=${PAGE_LIMIT}`;
  return paginate<XolaGuide>(firstPath, {
    fetcher: options.fetcher,
    label: "fetchAllGuides",
  });
}

export interface SyncResult {
  count: number;
}

export type GuideWriter = (rows: GuideRow[]) => Promise<void>;

export interface GuideRow {
  id: string;
  name: string;
  email: string | null;
  seller_id: string;
  raw: Json;
  synced_at: string;
}

export async function syncGuides(
  options: { fetcher?: typeof xolaFetch; writer?: GuideWriter; sellerId?: string } = {},
): Promise<SyncResult> {
  const sellerId = options.sellerId ?? resolveXolaSellerId();
  const rows = await fetchAllGuides({ fetcher: options.fetcher, sellerId });
  // Drop malformed rows. id + name + seller_id are NOT NULL in the schema;
  // a missing id would corrupt upsert-by-id. Warn so a sandbox shape
  // regression is visible in logs.
  const valid: GuideRow[] = [];
  let skipped = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    if (typeof row?.id === "string" && row.id && typeof row?.name === "string" && row.name) {
      valid.push({
        id: row.id,
        name: row.name,
        email: typeof row.email === "string" && row.email ? row.email : null,
        seller_id: sellerId,
        raw: row as unknown as Json,
        synced_at: now,
      });
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    console.warn(`syncGuides: skipped ${skipped} malformed row(s) (missing id/name)`);
  }
  const writer = options.writer ?? defaultWriter;
  await writer(valid);
  return { count: valid.length };
}

async function defaultWriter(rows: GuideRow[]): Promise<void> {
  if (rows.length === 0) return;
  // Dynamic import to keep server-only code out of this module's import
  // graph at test time — tests always inject a writer.
  const { getSupabaseAdmin } = await import("../supabase/server.ts");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("xola_guides")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    throw new Error(`xola_guides upsert failed: ${error.message}`);
  }
}
