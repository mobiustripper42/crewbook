// Generic cursor-walker for Xola list endpoints.
//
// Xola paginates responses as { data: T[], paging: { next?: string } }, where
// `next` is a relative path including any cursor query params. This helper
// walks `paging.next` until exhausted, with two guards that experiences.ts
// surfaced in Phase 1.2:
//
//   1. Stuck-cursor guard. The sandbox has been observed returning the same
//      `paging.next` as the path it was returned with — i.e. an infinite
//      self-loop. Treat a repeated path as end-of-list.
//   2. MAX_PAGES cap. Defense in depth against a runaway cursor on prod.
//
// The caller passes the seed path (with any filters or `?limit=...` already
// applied) and an optional fetcher (swappable in tests).

import { xolaFetch } from "./client.ts";

export interface XolaListResponse<T> {
  data: T[];
  paging?: { next?: string };
}

export interface PaginateOptions<T> {
  fetcher?: <R = unknown>(path: string) => Promise<R>;
  maxPages?: number;
  // Name surfaces in the MAX_PAGES error message so a runaway cursor is
  // diagnosable from logs without a stack trace.
  label?: string;
  // Hook for transforming/validating a single page's data before accumulation.
  // Default: passthrough.
  onPage?: (rows: T[], pageIndex: number) => T[];
}

const DEFAULT_MAX_PAGES = 50;

export async function paginate<T>(
  firstPath: string,
  options: PaginateOptions<T> = {},
): Promise<T[]> {
  const fetcher = options.fetcher ?? xolaFetch;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const label = options.label ?? "paginate";
  const onPage = options.onPage ?? ((rows) => rows);

  const all: T[] = [];
  const seen = new Set<string>();
  let nextPath: string | undefined = firstPath;

  for (let page = 0; page < maxPages; page++) {
    if (!nextPath) return all;
    if (seen.has(nextPath)) return all;
    seen.add(nextPath);

    const res: XolaListResponse<T> = await fetcher<XolaListResponse<T>>(nextPath);
    if (Array.isArray(res?.data)) {
      all.push(...onPage(res.data, page));
    }
    nextPath = res?.paging?.next;
  }

  // Loop exited via maxPages exhaustion AND `next` still pointed somewhere
  // un-visited. Stuck-cursor case (seen.has === true) is silent end-of-list.
  if (nextPath && !seen.has(nextPath)) {
    throw new Error(
      `${label}: exceeded ${maxPages} pages — pagination loop suspected`,
    );
  }
  return all;
}
