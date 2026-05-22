// Run with: npm run test:unit
//
// Covers URL construction (epoch conversion + offset + filters) and sync
// behavior. Pagination is deliberately single-page in V1; if Xola starts
// paginating, the test in xola-paginate-skip covers the helper.

import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  fetchEvents,
  syncEvents,
  DEFAULT_TIMEZONE,
  type XolaEvent,
  type EventRow,
} from "../../lib/xola/events.ts";

const originalEnv = { ...process.env };

function event(id: string, extra: Record<string, unknown> = {}): XolaEvent {
  return { id, ...extra };
}

beforeEach(() => {
  process.env.XOLA_SELLER_ID = "test-seller";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("fetchEvents URL construction", () => {
  it("builds /api/events with seller + epoch start/end + offset + reserved", async () => {
    const calls: string[] = [];
    // /api/events returns a bare array, not a {data, paging} envelope —
    // confirmed via sandbox probe. Tests exercise both shapes.
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return [event("e1")] as unknown as T;
    };
    await fetchEvents({ start: "2026-06-01", end: "2026-06-07", fetcher });
    assert.equal(calls.length, 1);
    const path = calls[0];
    assert.ok(path.startsWith("/api/events?"));
    assert.match(path, /seller=test-seller/);
    // 2026-06-01 00:00 EDT = 2026-06-01 04:00 UTC = 1780286400
    assert.match(path, /start=1780286400/);
    // 2026-06-07 23:59:59 EDT = 2026-06-08 03:59:59 UTC = 1780891199
    assert.match(path, /end=1780891199/);
    // EDT offset
    assert.match(path, /offset=-14400/);
    assert.match(path, /reserved=true/);
  });

  it("omits reserved param when reserved=false", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchEvents({ start: "2026-06-01", end: "2026-06-07", reserved: false, fetcher });
    assert.doesNotMatch(calls[0], /reserved=/);
  });

  it("includes experience filter when experienceIds provided", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchEvents({
      start: "2026-06-01",
      end: "2026-06-07",
      experienceIds: ["exp1", "exp2"],
      fetcher,
    });
    assert.match(calls[0], /experience=exp1%2Cexp2/);
  });

  it("uses EST offset for January (DST-aware)", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return [] as unknown as T;
    };
    await fetchEvents({ start: "2026-01-01", end: "2026-01-07", fetcher });
    assert.match(calls[0], /offset=-18000/);
  });

  it("DST-spanning window uses a single consistent offset for start/end/?offset=", async () => {
    // US spring-forward 2026 is Mar 8. Querying Mar 1 → Mar 15 spans the
    // transition. A naive per-date offset lookup would build `start` as
    // EST and `end` as EDT, but the URL ?offset= can only carry one value.
    // The fix: single offset (from noon UTC on the start day = EST) used
    // consistently for both bounds AND the URL param. Off-by-one-hour bug
    // is invisible at BrewBoat (no midnight tours), pinned here so it
    // can't regress.
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return [] as unknown as T;
    };
    await fetchEvents({ start: "2026-03-01", end: "2026-03-15", fetcher });
    const path = calls[0];
    // Noon UTC on Mar 1 in NY is 07:00 EST, so offset=-18000.
    assert.match(path, /offset=-18000/);
    // 2026-03-01 00:00 EST = 2026-03-01 05:00 UTC.
    const expectedStart = Math.floor(Date.UTC(2026, 2, 1, 5, 0, 0) / 1000);
    assert.match(path, new RegExp(`start=${expectedStart}`));
    // 2026-03-15 23:59:59 EST = 2026-03-16 04:59:59 UTC.
    const expectedEnd = Math.floor(Date.UTC(2026, 2, 16, 4, 59, 59) / 1000);
    assert.match(path, new RegExp(`end=${expectedEnd}`));
  });

  it("honors explicit timezone override", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchEvents({
      start: "2026-06-01",
      end: "2026-06-07",
      timezone: "UTC",
      fetcher,
    });
    assert.match(calls[0], /offset=0/);
    // 2026-06-01 00:00 UTC = 1780272000
    assert.match(calls[0], /start=1780272000/);
  });

  it("default timezone is America/New_York", () => {
    assert.equal(DEFAULT_TIMEZONE, "America/New_York");
  });

  it("honors explicit sellerId over env", async () => {
    const calls: string[] = [];
    const fetcher = async <T>(path: string): Promise<T> => {
      calls.push(path);
      return { data: [] } as unknown as T;
    };
    await fetchEvents({
      start: "2026-06-01",
      end: "2026-06-07",
      sellerId: "explicit-seller",
      fetcher,
    });
    assert.match(calls[0], /seller=explicit-seller/);
  });

  it("throws when XOLA_SELLER_ID is missing and not provided", async () => {
    delete process.env.XOLA_SELLER_ID;
    await assert.rejects(
      () =>
        fetchEvents({
          start: "2026-06-01",
          end: "2026-06-07",
          fetcher: (async () => ({ data: [] })) as never,
        }),
      /XOLA_SELLER_ID is not set/,
    );
  });
});

describe("response-shape tolerance", () => {
  it("accepts bare-array response (the real Xola shape)", async () => {
    const fetcher = async <T>(): Promise<T> =>
      [event("a"), event("b")] as unknown as T;
    const out = await fetchEvents({ start: "2026-06-01", end: "2026-06-07", fetcher });
    assert.deepEqual(out.map((e) => e.id), ["a", "b"]);
  });

  it("accepts {data: [...]} envelope (defensive)", async () => {
    const fetcher = async <T>(): Promise<T> =>
      ({ data: [event("a"), event("b")] }) as unknown as T;
    const out = await fetchEvents({ start: "2026-06-01", end: "2026-06-07", fetcher });
    assert.deepEqual(out.map((e) => e.id), ["a", "b"]);
  });
});

describe("syncEvents", () => {
  it("writes rows with seller_id + synced_at + raw payload", async () => {
    const fetcher = async <T>(): Promise<T> =>
      [
        event("e1", { experience: { id: "exp1" }, startAt: "2026-06-03T18:00:00Z" }),
        event("e2", { experience: { id: "exp1" }, startAt: "2026-06-04T18:00:00Z" }),
      ] as unknown as T;
    let received: EventRow[] = [];
    const writer = async (rows: EventRow[]) => {
      received = rows;
    };

    const res = await syncEvents({
      start: "2026-06-01",
      end: "2026-06-07",
      fetcher,
      writer,
    });
    assert.equal(res.count, 2);
    assert.equal(received[0].id, "e1");
    assert.equal(received[0].seller_id, "test-seller");
    assert.ok(received[0].synced_at);
    const raw = received[0].raw as { experience?: { id?: string } };
    assert.equal(raw.experience?.id, "exp1");
  });

  it("returns count: 0 when no events", async () => {
    const fetcher = async <T>(): Promise<T> => [] as unknown as T;
    let writerCalls = 0;
    const writer = async () => {
      writerCalls++;
    };
    const res = await syncEvents({
      start: "2026-06-01",
      end: "2026-06-07",
      fetcher,
      writer,
    });
    assert.equal(res.count, 0);
    assert.equal(writerCalls, 1);
  });

  it("skips malformed rows missing id", async () => {
    const fetcher = async <T>(): Promise<T> =>
      [
        event("ok-1"),
        { id: "" } as XolaEvent,
        { foo: "bar" } as unknown as XolaEvent,
        event("ok-2"),
      ] as unknown as T;
    let received: EventRow[] = [];
    const writer = async (rows: EventRow[]) => {
      received = rows;
    };

    const res = await syncEvents({
      start: "2026-06-01",
      end: "2026-06-07",
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
