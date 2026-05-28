// Run with: npm run test:unit
//
// Sanity guard for the Phase 2.0 shift-agent fixtures (task 2.0 / issue #50).
// This does NOT grade an agent — that harness lands in 2.1. It only checks that:
//   1. the input week feeds lib/xola/mapping.ts cleanly (real Xola shape), and
//   2. the hand-authored answer key is internally consistent with Drew's rules
//      (see tests/fixtures/shift-agent/README.md).
// If either file drifts out of sync, this fails before 2.1 ever runs.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { lookupFromEntries, mapSlotsForWeek } from "../../lib/xola/mapping.ts";
import type { XolaEvent } from "../../lib/xola/events.ts";
import type { XolaOrder } from "../../lib/xola/orders.ts";

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures", "shift-agent");

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

const lookup = lookupFromEntries([["Brewboat Tour - captained", "brewboat"]]);
const week = load<WeekFixture>("week-2026-06-01.json");
const expected = load<ExpectedFixture>("week-2026-06-01.expected.json");

const slots = mapSlotsForWeek(week.events, week.orders, lookup);
const slotById = new Map(slots.map((s) => [s.event_id, s]));
const bookedIds = new Set(slots.filter((s) => s.order_count > 0).map((s) => s.event_id));
const coveredIds = new Set(expected.shifts.flatMap((s) => s.covered_event_ids));

describe("week-2026-06-01 fixture — feeds the mapper cleanly", () => {
  it("maps one slot per event", () => {
    assert.equal(slots.length, week.events.length);
  });

  it("every event resolves to a brewboat slot with no warnings", () => {
    for (const slot of slots) {
      assert.equal(slot.product_type, "brewboat", `event ${slot.event_id} should be brewboat`);
      assert.deepEqual(slot.warnings, [], `event ${slot.event_id} produced warnings`);
      assert.ok(slot.boat_resource_id, `event ${slot.event_id} missing boat`);
    }
  });

  it("the multi-order slot sums guests across both orders (6 + 4 = 10)", () => {
    const multi = slotById.get("6a1000000000000000000008")!;
    assert.equal(multi.order_count, 2);
    assert.equal(multi.total_guests, 10);
  });

  it("the standalone empty event has zero orders (no shift expected)", () => {
    const empty = slotById.get("6a1000000000000000000009")!;
    assert.equal(empty.order_count, 0);
  });
});

describe("week-2026-06-01 expected — answer key matches the rules", () => {
  it("every covered event id exists in the fixture", () => {
    for (const id of coveredIds) {
      assert.ok(slotById.has(id), `covered event ${id} not in week fixture`);
    }
  });

  it("every booked event appears in exactly one shift", () => {
    for (const id of bookedIds) {
      const hits = expected.shifts.filter((s) => s.covered_event_ids.includes(id)).length;
      assert.equal(hits, 1, `booked event ${id} should appear in exactly one shift, found ${hits}`);
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
      const earliest = Math.min(...starts);
      const latest = Math.max(...starts);
      assert.equal(new Date(shift.start).getTime(), earliest, `shift on ${shift.date} start mismatch`);
      assert.equal(new Date(shift.end).getTime(), latest + 2 * 3600 * 1000, `shift on ${shift.date} end mismatch`);
    }
  });

  // Rule 3 — the marquee scenario. A slot is 2h, so one bridged empty slot
  // means consecutive covered starts are 4h (2 slots) apart; a two-slot gap
  // (6h+) must split into separate shifts. These two checks are what catches a
  // regression that merges Boat C's split into one shift or breaks Boat B's
  // bridge — the start/end math alone would not.
  const SLOT_MS = 2 * 3600 * 1000;

  it("within a shift, no two consecutive covered events are more than one slot apart (bridges one gap, not two)", () => {
    for (const shift of expected.shifts) {
      const starts = shift.covered_event_ids
        .map((id) => new Date(week.events.find((e) => e.id === id)!.start as string).getTime())
        .sort((a, b) => a - b);
      for (let i = 1; i < starts.length; i++) {
        assert.ok(
          starts[i] - starts[i - 1] <= 2 * SLOT_MS,
          `shift on ${shift.date} bridges a >1-slot gap — should have split`,
        );
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
      const ends = group.map((s) => new Date(s.start).getTime()).sort((a, b) => a - b);
      for (let i = 1; i < ends.length; i++) {
        assert.ok(
          ends[i] - ends[i - 1] > 2 * SLOT_MS,
          `${key} has two shifts within one slot of each other — they should be one shift`,
        );
      }
    }
  });
});
