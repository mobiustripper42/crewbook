// Run with: npm run test:unit
//
// Sanity guard for the shift-agent fixtures (task 2.0 / issue #50, extended in
// 2.5 / issue #49). This does NOT grade an agent — that harness is the live
// eval (scripts/eval-shift-agent.ts). It only checks, OFFLINE and for FREE, that
// every fixture week:
//   1. feeds lib/xola/mapping.ts cleanly (real Xola shape), and
//   2. has an answer key internally consistent with Drew's rules
//      (see tests/fixtures/shift-agent/README.md).
// If either file drifts out of sync, this fails before any billed eval runs.

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { lookupFromEntries, mapSlotsForWeek } from "../../lib/xola/mapping.ts";
import type { XolaEvent } from "../../lib/xola/events.ts";
import type { XolaOrder } from "../../lib/xola/orders.ts";

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "shift-agent");
const SLOT_MS = 2 * 3600 * 1000;

interface WeekFixture {
  week_start: string;
  events: XolaEvent[];
  orders: XolaOrder[];
}
interface ExpectedShift {
  date: string;
  boat_resource_id: string;
  product_type: string;
  start: string;
  end: string;
  roles: string[];
  covered_event_ids: string[];
}
interface ExpectedFixture {
  shifts: ExpectedShift[];
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as T;
}

// Every week with both an input and an answer key.
const slugs = [...new Set(readdirSync(FIXTURE_DIR))]
  .filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json"))
  .map((f) => f.slice(0, -".json".length))
  .filter((slug) => readdirSync(FIXTURE_DIR).includes(`${slug}.expected.json`))
  .sort();

const lookup = lookupFromEntries([["Brewboat Tour - captained", "brewboat"]]);

// Rule-based integrity checks that hold for EVERY week.
for (const slug of slugs) {
  const week = load<WeekFixture>(`${slug}.json`);
  const expected = load<ExpectedFixture>(`${slug}.expected.json`);
  const slots = mapSlotsForWeek(week.events, week.orders, lookup);
  const slotById = new Map(slots.map((s) => [s.event_id, s]));
  const coveredIds = new Set(expected.shifts.flatMap((s) => s.covered_event_ids));

  describe(`${slug} — feeds the mapper cleanly`, () => {
    it("maps one slot per event", () => {
      assert.equal(slots.length, week.events.length);
    });
    it("every event resolves to a brewboat slot with a boat and no warnings", () => {
      for (const slot of slots) {
        assert.equal(slot.product_type, "brewboat", `event ${slot.event_id} should be brewboat`);
        assert.deepEqual(slot.warnings, [], `event ${slot.event_id} produced warnings`);
        assert.ok(slot.boat_resource_id, `event ${slot.event_id} missing boat`);
      }
    });
  });

  describe(`${slug} — answer key matches the rules`, () => {
    it("every covered event id exists in the fixture", () => {
      for (const id of coveredIds) assert.ok(slotById.has(id), `covered event ${id} not in week`);
    });
    it("every booked event appears in exactly one shift", () => {
      for (const slot of slots) {
        if (slot.order_count === 0) continue;
        const hits = expected.shifts.filter((s) => s.covered_event_ids.includes(slot.event_id)).length;
        assert.equal(hits, 1, `booked event ${slot.event_id} should appear in exactly one shift, found ${hits}`);
      }
    });
    it("zero-order events appear in no shift (booked-only rule)", () => {
      for (const slot of slots) {
        if (slot.order_count === 0) {
          assert.equal(coveredIds.has(slot.event_id), false, `empty event ${slot.event_id} should not be scheduled`);
        }
      }
    });
    it("every shift is a captain+mate brewboat shift", () => {
      for (const shift of expected.shifts) {
        assert.equal(shift.product_type, "brewboat");
        assert.deepEqual(shift.roles, ["captain", "mate"]);
      }
    });
    it("shift start = earliest covered event start; end = latest covered start + 2h", () => {
      for (const shift of expected.shifts) {
        const starts = shift.covered_event_ids.map((id) => new Date(week.events.find((e) => e.id === id)!.start as string).getTime());
        assert.equal(new Date(shift.start).getTime(), Math.min(...starts), `${slug} ${shift.date} start mismatch`);
        assert.equal(new Date(shift.end).getTime(), Math.max(...starts) + SLOT_MS, `${slug} ${shift.date} end mismatch`);
      }
    });
    it("within a shift, consecutive covered events are at most one slot apart (bridges one gap, not two)", () => {
      for (const shift of expected.shifts) {
        const starts = shift.covered_event_ids
          .map((id) => new Date(week.events.find((e) => e.id === id)!.start as string).getTime())
          .sort((a, b) => a - b);
        for (let i = 1; i < starts.length; i++) {
          assert.ok(starts[i] - starts[i - 1] <= 2 * SLOT_MS, `${slug} ${shift.date} bridges a >1-slot gap — should split`);
        }
      }
    });
    it("two shifts on the same boat+date are separated by more than one slot (two-slot gap split)", () => {
      const byBoatDate = new Map<string, ExpectedShift[]>();
      for (const shift of expected.shifts) {
        const key = `${shift.date}|${shift.boat_resource_id}`;
        byBoatDate.set(key, [...(byBoatDate.get(key) ?? []), shift]);
      }
      for (const [key, group] of byBoatDate) {
        if (group.length < 2) continue;
        const starts = group.map((s) => new Date(s.start).getTime()).sort((a, b) => a - b);
        for (let i = 1; i < starts.length; i++) {
          assert.ok(starts[i] - starts[i - 1] > 2 * SLOT_MS, `${key} has two shifts within one slot — should be one`);
        }
      }
    });
  });
}

// 2.0-specific anchors that only make sense for week-2026-06-01 (the multi-order
// summing slot + the standalone zero-order event).
describe("week-2026-06-01 — 2.0-specific anchors", () => {
  const week = load<WeekFixture>("week-2026-06-01.json");
  const slots = mapSlotsForWeek(week.events, week.orders, lookup);
  const slotById = new Map(slots.map((s) => [s.event_id, s]));

  it("the multi-order slot sums guests across both orders (6 + 4 = 10)", () => {
    const multi = slotById.get("6a1000000000000000000008")!;
    assert.equal(multi.order_count, 2);
    assert.equal(multi.total_guests, 10);
  });
  it("the standalone empty event has zero orders (no shift expected)", () => {
    assert.equal(slotById.get("6a1000000000000000000009")!.order_count, 0);
  });
});
