// Run with: npm run test:unit
//
// Pagination is tested in tests/unit/xola-paginate-skip.test.ts. These tests
// cover URL construction and sync behavior.

import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  fetchOrders,
  syncOrders,
  DEFAULT_STATUS_CODES,
  type XolaOrder,
  type OrderRow,
} from "../../lib/xola/orders.ts";

const originalEnv = { ...process.env };

function order(id: string, extra: Record<string, unknown> = {}): XolaOrder {
  return { id, ...extra };
}

beforeEach(() => {
  process.env.XOLA_SELLER_ID = "test-seller";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("fetchOrders URL construction", () => {
  it("composes seller + date range + status + limit on the flat /api/orders path", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [order("a")] } as unknown as T;
    };
    await fetchOrders({ start: "2025-06-01", end: "2025-06-07", fetcher });
    assert.equal(calls.length, 1);
    const path = calls[0];
    assert.ok(path.startsWith("/api/orders?"), `got ${path}`);
    // URLSearchParams encodes brackets — accept either raw or encoded forms.
    assert.match(path, /seller=test-seller/);
    assert.match(path, /items\.arrival(\[|%5B)gte(\]|%5D)=2025-06-01/);
    assert.match(path, /items\.arrival(\[|%5B)lte(\]|%5D)=2025-06-07/);
    assert.match(path, /items\.status(\[|%5B)in(\]|%5D)=200%2C201%2C202%2C203%2C700/);
    assert.match(path, /limit=100/);
    assert.match(path, /skip=0/);
  });

  it("honors explicit sellerId over env", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchOrders({
      start: "2025-06-01",
      end: "2025-06-07",
      sellerId: "explicit-seller",
      fetcher,
    });
    assert.match(calls[0], /seller=explicit-seller/);
  });

  it("honors custom statusCodes override", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchOrders({
      start: "2025-06-01",
      end: "2025-06-07",
      statusCodes: [200, 202],
      fetcher,
    });
    assert.match(calls[0], /items\.status(\[|%5B)in(\]|%5D)=200%2C202/);
  });

  it("default status set is confirmed family + cancellation per DEC-115", () => {
    assert.deepEqual([...DEFAULT_STATUS_CODES], [200, 201, 202, 203, 700]);
  });

  it("throws when XOLA_SELLER_ID is missing and not provided", async () => {
    delete process.env.XOLA_SELLER_ID;
    await assert.rejects(
      () =>
        fetchOrders({
          start: "2025-06-01",
          end: "2025-06-07",
          fetcher: (async () => ({ data: [] })) as never,
        }),
      /XOLA_SELLER_ID is not set/,
    );
  });
});

describe("syncOrders", () => {
  it("writes rows with seller_id + synced_at + raw payload", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({
        data: [
          order("o1", { items: [{ status: 200, arrival: "2025-06-03T15:00:00Z" }] }),
          order("o2", { items: [{ status: 700, arrival: "2025-06-05T18:00:00Z" }] }),
        ],
      }) as unknown as T;
    let received: OrderRow[] = [];
    const writer = async (rows: OrderRow[]) => {
      received = rows;
    };

    const res = await syncOrders({
      start: "2025-06-01",
      end: "2025-06-07",
      fetcher,
      writer,
    });
    assert.equal(res.count, 2);
    assert.equal(received[0].id, "o1");
    assert.equal(received[0].seller_id, "test-seller");
    assert.ok(received[0].synced_at);
    // raw includes the cancelled order too — DEC-115 option B preserves status in raw.
    const o2items = (received[1].raw as { items?: Array<{ status: number }> }).items;
    assert.equal(o2items?.[0].status, 700);
  });

  it("returns count: 0 when no orders", async () => {
    const fetcher = async <T>(): Promise<T> => ({ data: [] }) as unknown as T;
    let writerCalls = 0;
    const writer = async () => {
      writerCalls++;
    };
    const res = await syncOrders({
      start: "2025-06-01",
      end: "2025-06-07",
      fetcher,
      writer,
    });
    assert.equal(res.count, 0);
    assert.equal(writerCalls, 1);
  });

  it("skips malformed rows missing id", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({
        data: [
          order("ok-1"),
          { id: "" } as XolaOrder,
          { foo: "bar" } as unknown as XolaOrder,
          order("ok-2"),
        ],
      }) as unknown as T;
    let received: OrderRow[] = [];
    const writer = async (rows: OrderRow[]) => {
      received = rows;
    };

    const res = await syncOrders({
      start: "2025-06-01",
      end: "2025-06-07",
      fetcher,
      writer,
    });
    assert.equal(res.count, 2);
    assert.deepEqual(
      received.map((r) => r.id),
      ["ok-1", "ok-2"],
    );
  });
});
