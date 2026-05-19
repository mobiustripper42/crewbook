// Phase 1.2: pull Xola's experiences (tour catalog) and cache locally.
//
// Xola paginates via {data, paging:{next?}} where `next` is a relative path
// (e.g. "/api/experiences?cursor=..."). Walk the cursor chain until `next`
// is absent. Cap at MAX_PAGES to prevent runaway in pathological cases.

import { xolaFetch } from "./client.ts";
import type { Json } from "../supabase/types.ts";

export interface XolaExperience {
  id: string;
  name: string;
  desc?: string;
  // Passthrough — Xola returns many more fields (price, schedule, media);
  // we store the full payload as `raw` for downstream consumers.
  [key: string]: unknown;
}

interface ListResponse {
  data: XolaExperience[];
  paging?: { next?: string };
}

// Cap at 100 (Xola's per-page max — confirmed against sandbox; ?limit=200
// is silently clamped). Drew's prod catalog is ~20, so most syncs are one
// page; this is defense-in-depth for any future catalog growth.
const FIRST_PATH = "/api/experiences?limit=100";
const MAX_PAGES = 50;

export async function fetchAllExperiences(
  options: { fetcher?: typeof xolaFetch } = {},
): Promise<XolaExperience[]> {
  const fetcher = options.fetcher ?? xolaFetch;
  const all: XolaExperience[] = [];
  const seen = new Set<string>();
  let nextPath: string | undefined = FIRST_PATH;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (!nextPath) break;
    if (seen.has(nextPath)) {
      // Xola sandbox has been observed returning the same paging.next as
      // the path we just fetched (effectively a stuck cursor). Treat a
      // repeated cursor as end-of-list rather than spinning the loop.
      break;
    }
    seen.add(nextPath);
    const res: ListResponse = await fetcher<ListResponse>(nextPath);
    if (Array.isArray(res?.data)) all.push(...res.data);
    nextPath = res?.paging?.next;
  }

  if (nextPath && !seen.has(nextPath)) {
    throw new Error(
      `fetchAllExperiences exceeded ${MAX_PAGES} pages — pagination loop suspected`,
    );
  }

  return all;
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
  const writer = options.writer ?? defaultWriter;
  await writer(rows);
  return { count: rows.length };
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
