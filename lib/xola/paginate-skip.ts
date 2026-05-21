// Skip-based cursor walker for Xola endpoints that paginate via ?skip=N&limit=M
// instead of {paging: {next}}. The Xola order endpoint (/api/orders) is the
// first known consumer — its docs say "Paginate via skip", with `limit`
// defaulting to 20 and `sort=-id`.
//
// Correctness model is different from lib/xola/paginate.ts (cursor-based):
//   - No stuck-cursor concern: skip is monotonically incremented in code,
//     server can't loop us.
//   - Termination is "got fewer rows than I asked for" — the universal skip-
//     pagination contract. A page returning exactly `limit` rows means
//     "there might be more"; anything less means we hit the end.
//   - MAX_ITEMS safety cap defends against a misconfigured limit (e.g.
//     limit=1 on a 50k-order seller) more than against server pathology.
//
// The caller passes a base path with everything except `?skip=...` already
// applied (seller, filters, limit). We append &skip= (or ?skip= if no other
// params).

import { xolaFetch } from "./client.ts";

export interface XolaSkipResponse<T> {
  data: T[];
  // Xola may also return `total` / `paging.total`; we don't rely on them —
  // termination is purely based on "did I get fewer rows than I asked for."
}

export interface PaginateSkipOptions<T> {
  fetcher?: <R = unknown>(path: string) => Promise<R>;
  limit: number;
  maxItems?: number;
  // Name surfaces in MAX_ITEMS error message — diagnosable from logs.
  label?: string;
  onPage?: (rows: T[], pageIndex: number) => T[];
}

// 10_000 ≈ 100 pages at limit=100. BrewBoat seller is ~hundreds of orders/year
// confirmed; this is two orders of magnitude of headroom. Hit means
// misconfigured filter or runaway loop.
const DEFAULT_MAX_ITEMS = 10_000;

export async function paginateSkip<T>(
  basePath: string,
  options: PaginateSkipOptions<T>,
): Promise<T[]> {
  const fetcher = options.fetcher ?? xolaFetch;
  const limit = options.limit;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const label = options.label ?? "paginateSkip";
  const onPage = options.onPage ?? ((rows) => rows);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`${label}: limit must be a positive integer (got ${limit})`);
  }

  const all: T[] = [];
  const sep = basePath.includes("?") ? "&" : "?";

  for (let skip = 0, page = 0; ; skip += limit, page++) {
    const path = `${basePath}${sep}skip=${skip}`;
    const res: XolaSkipResponse<T> = await fetcher<XolaSkipResponse<T>>(path);
    const rows = Array.isArray(res?.data) ? res.data : [];
    all.push(...onPage(rows, page));

    if (rows.length < limit) return all;

    if (all.length >= maxItems) {
      throw new Error(
        `${label}: exceeded ${maxItems} items at skip=${skip + limit} — pagination loop or runaway filter suspected`,
      );
    }
  }
}
