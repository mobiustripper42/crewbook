// Unit tests for the generic paginate<T> helper.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { paginate } from "../../lib/xola/paginate.ts";

describe("paginate", () => {
  it("returns a single page when paging.next is absent", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [1, 2, 3] } as unknown as T;
    };

    const out = await paginate<number>("/api/things?limit=100", { fetcher });
    assert.deepEqual(out, [1, 2, 3]);
    assert.deepEqual(calls, ["/api/things?limit=100"]);
  });

  it("follows the cursor chain across pages", async () => {
    const pages: Record<string, { data: number[]; paging?: { next?: string } }> = {
      "/api/things?limit=100": { data: [1], paging: { next: "/api/things?cursor=p2" } },
      "/api/things?cursor=p2": { data: [2], paging: { next: "/api/things?cursor=p3" } },
      "/api/things?cursor=p3": { data: [3] },
    };
    const fetcher = async <T>(path: string): Promise<T> => pages[path] as unknown as T;
    const out = await paginate<number>("/api/things?limit=100", { fetcher });
    assert.deepEqual(out, [1, 2, 3]);
  });

  it("treats a repeated cursor as end-of-list (stuck-cursor guard)", async () => {
    let calls = 0;
    const fetcher = async <T>(): Promise<T> => {
      calls++;
      return {
        data: [calls],
        paging: { next: "/api/things?cursor=stuck" },
      } as unknown as T;
    };
    const out = await paginate<number>("/api/things?limit=100", { fetcher });
    // First call: seed path → next=stuck. Second call: stuck → next=stuck again. Bail.
    assert.equal(calls, 2);
    assert.deepEqual(out, [1, 2]);
  });

  it("throws when exceeding maxPages with a still-advancing cursor", async () => {
    let page = 0;
    const fetcher = async <T>(): Promise<T> => {
      page++;
      return {
        data: [page],
        paging: { next: `/api/things?cursor=p${page + 1}` },
      } as unknown as T;
    };
    await assert.rejects(
      () => paginate<number>("/api/things?limit=100", { fetcher, maxPages: 3, label: "test-pg" }),
      /test-pg: exceeded 3 pages/,
    );
  });

  it("handles empty data array gracefully", async () => {
    const fetcher = async <T>(): Promise<T> => ({ data: [] }) as unknown as T;
    const out = await paginate<number>("/api/things", { fetcher });
    assert.deepEqual(out, []);
  });

  it("applies onPage transform before accumulating", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({ data: [1, 2, 3] }) as unknown as T;
    const out = await paginate<number>("/api/things", {
      fetcher,
      onPage: (rows) => rows.filter((n) => n % 2 === 1),
    });
    assert.deepEqual(out, [1, 3]);
  });
});
