// Run with: npm run test:unit
//
// Exercises sync + malformed-row handling without a real Xola or Supabase.
// Pagination is covered in tests/unit/xola-paginate.test.ts (guides.ts uses
// the same helper).

import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import { fetchAllGuides, syncGuides, type XolaGuide, type GuideRow } from "../../lib/xola/guides.ts";

const originalEnv = { ...process.env };

function guide(id: string, name: string, extra: Record<string, unknown> = {}): XolaGuide {
  return { id, name, ...extra };
}

beforeEach(() => {
  process.env.XOLA_SELLER_ID = "test-seller";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("fetchAllGuides", () => {
  it("calls the seller-scoped path", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [guide("g1", "G1")] } as unknown as T;
    };

    const out = await fetchAllGuides({ fetcher });
    assert.equal(out.length, 1);
    assert.deepEqual(calls, ["/api/sellers/test-seller/guides?limit=100"]);
  });

  it("uses explicit sellerId option over env", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchAllGuides({ fetcher, sellerId: "explicit-seller" });
    assert.equal(calls[0], "/api/sellers/explicit-seller/guides?limit=100");
  });

  it("throws when XOLA_SELLER_ID is missing", async () => {
    delete process.env.XOLA_SELLER_ID;
    await assert.rejects(
      () => fetchAllGuides({ fetcher: (async () => ({ data: [] })) as never }),
      /XOLA_SELLER_ID is not set/,
    );
  });
});

describe("syncGuides", () => {
  it("writes well-formed rows with seller_id + synced_at + raw payload", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({
        data: [
          guide("g1", "Eric Stoffer", { email: "eric@stoffer.net", role: "captain" }),
          guide("g2", "Mate One"),
        ],
      }) as unknown as T;
    let received: GuideRow[] = [];
    const writer = async (rows: GuideRow[]) => {
      received = rows;
    };

    const res = await syncGuides({ fetcher, writer });
    assert.equal(res.count, 2);
    assert.equal(received.length, 2);
    assert.equal(received[0].id, "g1");
    assert.equal(received[0].email, "eric@stoffer.net");
    assert.equal(received[0].seller_id, "test-seller");
    assert.equal(received[1].email, null);
    // raw passes through fully — downstream readers shouldn't have to re-call Xola.
    assert.equal(
      (received[0].raw as { role?: string }).role,
      "captain",
    );
    assert.ok(received[0].synced_at);
  });

  it("returns count: 0 when no guides", async () => {
    const fetcher = async <T>(): Promise<T> => ({ data: [] }) as unknown as T;
    let writerCalls = 0;
    const writer = async () => {
      writerCalls++;
    };
    const res = await syncGuides({ fetcher, writer });
    assert.equal(res.count, 0);
    assert.equal(writerCalls, 1);
  });

  it("skips malformed rows missing id or name", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({
        data: [
          guide("ok-1", "Eric"),
          { id: "", name: "no id" } as XolaGuide,
          { id: "no-name" } as unknown as XolaGuide,
          guide("ok-2", "Mate"),
        ],
      }) as unknown as T;
    let received: GuideRow[] = [];
    const writer = async (rows: GuideRow[]) => {
      received = rows;
    };

    const res = await syncGuides({ fetcher, writer });
    assert.equal(res.count, 2);
    assert.deepEqual(
      received.map((r) => r.id),
      ["ok-1", "ok-2"],
    );
  });
});
