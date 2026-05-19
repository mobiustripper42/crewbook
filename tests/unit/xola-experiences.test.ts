// Run with: npm run test:unit
//
// Exercises pagination + sync without a real Xola or Supabase.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  fetchAllExperiences,
  syncExperiences,
  type XolaExperience,
} from "../../lib/xola/experiences.ts";

function exp(id: string, name: string, extra: Record<string, unknown> = {}): XolaExperience {
  return { id, name, ...extra };
}

describe("fetchAllExperiences", () => {
  it("returns single page when paging.next is absent", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [exp("a", "A"), exp("b", "B")] } as unknown as T;
    };

    const out = await fetchAllExperiences({ fetcher });
    assert.equal(out.length, 2);
    assert.deepEqual(calls, ["/api/experiences?limit=100"]);
  });

  it("stops when paging.next repeats (stuck cursor)", async () => {
    // Xola sandbox has been observed returning the same paging.next as the
    // path just fetched. Treat as end-of-list, don't spin.
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return {
        data: [exp(`p${calls.length}`, "x")],
        paging: { next: "/api/experiences?cursor=stuck" },
      } as unknown as T;
    };

    const out = await fetchAllExperiences({ fetcher });
    // First call to FIRST_PATH yields data + a "next" cursor we've never
    // seen. Second call to that cursor yields data + the SAME cursor again.
    // We bail before issuing a third fetch.
    assert.equal(calls.length, 2);
    assert.equal(out.length, 2);
  });

  it("follows paging.next cursor chain", async () => {
    const pages: Record<string, { data: XolaExperience[]; paging?: { next?: string } }> = {
      "/api/experiences?limit=100": {
        data: [exp("1", "one")],
        paging: { next: "/api/experiences?cursor=p2" },
      },
      "/api/experiences?cursor=p2": {
        data: [exp("2", "two")],
        paging: { next: "/api/experiences?cursor=p3" },
      },
      "/api/experiences?cursor=p3": {
        data: [exp("3", "three")],
      },
    };
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return pages[path] as unknown as T;
    };

    const out = await fetchAllExperiences({ fetcher });
    assert.deepEqual(
      out.map((e) => e.id),
      ["1", "2", "3"],
    );
    assert.equal(calls.length, 3);
    assert.equal(calls[2], "/api/experiences?cursor=p3");
  });

  it("throws if pagination would exceed MAX_PAGES", async () => {
    // Always-next-with-fresh-cursor fetcher would loop forever without the
    // cap. The cursor must rotate each page so the stuck-cursor guard
    // doesn't bail first.
    let page = 0;
    const fetcher = async <T>(): Promise<T> => {
      page++;
      return {
        data: [exp(`x${page}`, "x")],
        paging: { next: `/api/experiences?cursor=p${page + 1}` },
      } as unknown as T;
    };
    await assert.rejects(
      () => fetchAllExperiences({ fetcher }),
      /exceeded 50 pages/,
    );
  });

  it("handles empty data array gracefully", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({ data: [] }) as unknown as T;
    const out = await fetchAllExperiences({ fetcher });
    assert.deepEqual(out, []);
  });
});

describe("syncExperiences", () => {
  it("fetches all pages and writes via injected writer", async () => {
    const fetcher = async <T>(path: string): Promise<T> => {
      if (path === "/api/experiences?limit=100") {
        return {
          data: [exp("a", "A", { desc: "first" })],
          paging: { next: "/api/experiences?cursor=p2" },
        } as unknown as T;
      }
      return { data: [exp("b", "B")] } as unknown as T;
    };
    const written: XolaExperience[][] = [];
    const writer = async (rows: XolaExperience[]) => {
      written.push(rows);
    };

    const res = await syncExperiences({ fetcher, writer });
    assert.equal(res.count, 2);
    assert.equal(written.length, 1);
    assert.equal(written[0].length, 2);
    assert.equal(written[0][0].id, "a");
  });

  it("returns count: 0 when no experiences", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({ data: [] }) as unknown as T;
    let writerCalls = 0;
    const writer = async () => {
      writerCalls++;
    };
    const res = await syncExperiences({ fetcher, writer });
    assert.equal(res.count, 0);
    assert.equal(writerCalls, 1, "writer is still called (even with empty input)");
  });
});
