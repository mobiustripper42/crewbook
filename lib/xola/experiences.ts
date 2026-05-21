// Phase 1.2: pull Xola's experiences (tour catalog) and cache locally.
//
// Pagination is delegated to `paginate<T>` (lib/xola/paginate.ts).

import { xolaFetch } from "./client.ts";
import { paginate } from "./paginate.ts";
import type { Json } from "../supabase/types.ts";

export interface XolaExperience {
  id: string;
  name: string;
  desc?: string;
  // Passthrough — Xola returns many more fields (price, schedule, media);
  // we store the full payload as `raw` for downstream consumers.
  [key: string]: unknown;
}

// Cap at 100 (Xola's per-page max — confirmed against sandbox; ?limit=200
// is silently clamped). Drew's prod catalog is ~20, so most syncs are one
// page; this 100/page setting is defense-in-depth for future catalog growth.
const FIRST_PATH = "/api/experiences?limit=100";

export async function fetchAllExperiences(
  options: { fetcher?: typeof xolaFetch } = {},
): Promise<XolaExperience[]> {
  return paginate<XolaExperience>(FIRST_PATH, {
    fetcher: options.fetcher,
    label: "fetchAllExperiences",
  });
}

export interface SyncResult {
  count: number;
}

// Caller-injectable writer keeps the sync function testable without a live
// database. Production callers use the default (getSupabaseAdmin upsert).
export type ExperienceWriter = (rows: XolaExperience[]) => Promise<void>;

export async function syncExperiences(
  options: { fetcher?: typeof xolaFetch; writer?: ExperienceWriter } = {},
): Promise<SyncResult> {
  const rows = await fetchAllExperiences({ fetcher: options.fetcher });
  // Drop malformed rows before handing off — id + name are NOT NULL in the
  // schema, and a missing id would corrupt upsert-by-id. Warn so a sandbox
  // shape regression is visible in logs.
  const valid: XolaExperience[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (typeof row?.id === "string" && row.id && typeof row?.name === "string" && row.name) {
      valid.push(row);
    } else {
      skipped++;
    }
  }
  if (skipped > 0) {
    console.warn(`syncExperiences: skipped ${skipped} malformed row(s) (missing id/name)`);
  }
  const writer = options.writer ?? defaultWriter;
  await writer(valid);
  return { count: valid.length };
}

async function defaultWriter(rows: XolaExperience[]): Promise<void> {
  if (rows.length === 0) return;
  // Dynamic import to keep server-only code out of this module's import
  // graph at test time — tests always inject a writer.
  const { getSupabaseAdmin } = await import("../supabase/server.ts");
  const supabase = getSupabaseAdmin();
  const payload = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.desc ?? null,
    raw: row as unknown as Json,
    synced_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("xola_experiences")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(`xola_experiences upsert failed: ${error.message}`);
  }
}
