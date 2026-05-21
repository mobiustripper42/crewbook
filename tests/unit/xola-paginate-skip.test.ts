// Unit tests for the skip-based paginate helper.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { paginateSkip } from "../../lib/xola/paginate-skip.ts";

describe("paginateSkip", () => {
  it("returns a single page when data.length < limit (termination)", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [1, 2, 3] } as unknown as T;
    };
    const out = await paginateSkip<number>("/api/orders?seller=x", { fetcher, limit: 100 });
    assert.deepEqual(out, [1, 2, 3]);
    assert.deepEqual(calls, ["/api/orders?seller=x&skip=0"]);
  });

  it("walks multiple pages until a short page terminates", async () => {
    const pages: Record<number, number[]> = {
      0: [1, 2, 3],
      3: [4, 5, 6],
      6: [7, 8], // short — last page
    };
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      const m = path.match(/skip=(\d+)/);
      const skip = m ? Number(m[1]) : -1;
      return { data: pages[skip] ?? [] } as unknown as T;
    };
    const out = await paginateSkip<number>("/api/orders?seller=x", { fetcher, limit: 3 });
    assert.deepEqual(out, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(calls.length, 3);
    assert.equal(calls[0], "/api/orders?seller=x&skip=0");
    assert.equal(calls[1], "/api/orders?seller=x&skip=3");
    assert.equal(calls[2], "/api/orders?seller=x&skip=6");
  });

  it("terminates correctly on a perfectly-divisible final page (one empty fetch)", async () => {
    // limit=3, total=6 — second page returns exactly limit, third page is empty.
    const pages: Record<number, number[]> = {
      0: [1, 2, 3],
      3: [4, 5, 6],
      6: [],
    };
    const fetcher = async <T>(path: string): Promise<T> => {
      const m = path.match(/skip=(\d+)/);
      const skip = m ? Number(m[1]) : -1;
      return { data: pages[skip] ?? [] } as unknown as T;
    };
    const out = await paginateSkip<number>("/api/orders", { fetcher, limit: 3 });
    assert.deepEqual(out, [1, 2, 3, 4, 5, 6]);
  });

  it("appends ?skip when basePath has no query, &skip when it does", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await paginateSkip<number>("/api/x", { fetcher, limit: 10 });
    await paginateSkip<number>("/api/x?a=1", { fetcher, limit: 10 });
    assert.equal(calls[0], "/api/x?skip=0");
    assert.equal(calls[1], "/api/x?a=1&skip=0");
  });

  it("throws when total items would exceed maxItems", async () => {
    // Always returns a full page — would never terminate without the cap.
    let page = 0;
    const fetcher = async <T>(): Promise<T> => {
      page++;
      return { data: Array.from({ length: 5 }, (_, i) => (page - 1) * 5 + i + 1) } as unknown as T;
    };
    await assert.rejects(
      () =>
        paginateSkip<number>("/api/x", {
          fetcher,
          limit: 5,
          maxItems: 12,
          label: "test-skip",
        }),
      /test-skip: exceeded 12 items/,
    );
  });

  it("rejects non-positive limit", async () => {
    await assert.rejects(
      () => paginateSkip<number>("/api/x", { limit: 0 }),
      /limit must be a positive integer/,
    );
    await assert.rejects(
      () => paginateSkip<number>("/api/x", { limit: -5 }),
      /limit must be a positive integer/,
    );
  });

  it("applies onPage transform before accumulation", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({ data: [1, 2, 3, 4] }) as unknown as T;
    const out = await paginateSkip<number>("/api/x", {
      fetcher,
      limit: 100,
      onPage: (rows) => rows.filter((n) => n % 2 === 0),
    });
    assert.deepEqual(out, [2, 4]);
  });

  it("handles empty first page gracefully", async () => {
    const fetcher = async <T>(): Promise<T> => ({ data: [] }) as unknown as T;
    const out = await paginateSkip<number>("/api/x", { fetcher, limit: 100 });
    assert.deepEqual(out, []);
  });
});
