// Run with: npm run test:unit

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  filterSlotsInWeek,
  shortResourceId,
  sortSlotsForDisplay,
  startOfWeek,
  summarizeStatuses,
  weekRange,
} from "../../app/admin/reservations/week.ts";
import type { TimeSlot } from "../../lib/xola/mapping.ts";

function slot(overrides: Partial<TimeSlot> = {}): TimeSlot {
  return {
    event_id: "e1",
    seller_id: "s1",
    experience_id: "exp",
    product_name: "Brewboat Tour - captained",
    product_type: "brewboat",
    start: "2026-05-20T12:00:00+00:00",
    end: "2026-05-20T14:00:00+00:00",
    boat_resource_id: "boat-1",
    total_guests: 1,
    order_count: 1,
    status_breakdown: { "200": 1 },
    warnings: [],
    ...overrides,
  };
}

describe("startOfWeek", () => {
  it("snaps a Wednesday to its Monday", () => {
    assert.equal(startOfWeek("2026-05-20"), "2026-05-18"); // Wed → Mon
  });
  it("returns the same date if already Monday", () => {
    assert.equal(startOfWeek("2026-05-18"), "2026-05-18");
  });
  it("snaps a Sunday back to the previous Monday (Mon–Sun week)", () => {
    assert.equal(startOfWeek("2026-05-24"), "2026-05-18"); // Sun → Mon
  });
  it("crosses a month boundary cleanly", () => {
    assert.equal(startOfWeek("2026-06-02"), "2026-06-01"); // Tue → Mon
  });
  it("crosses a DST spring-forward week without slipping by a day", () => {
    // US spring forward in 2026 is Sunday 2026-03-08; the week containing it
    // starts Monday 2026-03-02. Either side of the transition must resolve
    // to the same Monday.
    assert.equal(startOfWeek("2026-03-07"), "2026-03-02"); // Sat
    assert.equal(startOfWeek("2026-03-08"), "2026-03-02"); // Sun (transition day)
    assert.equal(startOfWeek("2026-03-09"), "2026-03-09"); // Mon (new week)
  });
  it("throws on malformed input", () => {
    assert.throws(() => startOfWeek("not-a-date"));
  });
});

describe("weekRange", () => {
  it("returns Monday → Sunday (six days later)", () => {
    assert.deepEqual(weekRange("2026-05-18"), { start: "2026-05-18", end: "2026-05-24" });
  });
  it("crosses a month boundary", () => {
    assert.deepEqual(weekRange("2026-05-25"), { start: "2026-05-25", end: "2026-05-31" });
  });
  it("crosses a year boundary", () => {
    assert.deepEqual(weekRange("2026-12-28"), { start: "2026-12-28", end: "2027-01-03" });
  });
  it("throws on malformed input", () => {
    assert.throws(() => weekRange("2026/05/18"));
  });
});

describe("summarizeStatuses", () => {
  it("returns '—' for empty breakdown", () => {
    assert.equal(summarizeStatuses({}), "—");
  });
  it("ignores zero-count entries", () => {
    assert.equal(summarizeStatuses({ "200": 0 }), "—");
  });
  it("formats a single confirmed entry", () => {
    assert.equal(summarizeStatuses({ "200": 2 }), "2 confirmed");
  });
  it("aggregates 200 + 202 into a single confirmed count", () => {
    assert.equal(summarizeStatuses({ "200": 1, "202": 1 }), "2 confirmed");
  });
  it("orders confirmed before cancelled", () => {
    assert.equal(summarizeStatuses({ "700": 1, "200": 1 }), "1 confirmed, 1 cancelled");
  });
  it("surfaces unknown status codes instead of silently swallowing them", () => {
    const result = summarizeStatuses({ "999": 3 });
    assert.ok(result.includes("999"), `unknown status code should appear in output, got '${result}'`);
  });
});

describe("shortResourceId", () => {
  it("returns '—' for null", () => {
    assert.equal(shortResourceId(null), "—");
  });
  it("returns the id as-is when 8 chars or shorter", () => {
    assert.equal(shortResourceId("abc"), "abc");
    assert.equal(shortResourceId("12345678"), "12345678");
  });
  it("ellipsises long ids to the last 8 chars", () => {
    assert.equal(shortResourceId("6a0fa498081e494f74080020"), "…74080020");
  });
});

describe("sortSlotsForDisplay", () => {
  it("sorts by start ascending then by event_id", () => {
    const slots = [
      slot({ event_id: "b", start: "2026-05-20T14:00:00+00:00" }),
      slot({ event_id: "a", start: "2026-05-20T12:00:00+00:00" }),
      slot({ event_id: "a", start: "2026-05-20T14:00:00+00:00" }),
    ];
    const sorted = sortSlotsForDisplay(slots);
    assert.deepEqual(
      sorted.map((s) => [s.start, s.event_id]),
      [
        ["2026-05-20T12:00:00+00:00", "a"],
        ["2026-05-20T14:00:00+00:00", "a"],
        ["2026-05-20T14:00:00+00:00", "b"],
      ],
    );
  });
  it("does not mutate the input array", () => {
    const slots = [slot({ event_id: "b" }), slot({ event_id: "a" })];
    const before = slots.map((s) => s.event_id);
    sortSlotsForDisplay(slots);
    assert.deepEqual(
      slots.map((s) => s.event_id),
      before,
    );
  });
});

describe("filterSlotsInWeek", () => {
  const range = { start: "2026-05-18", end: "2026-05-24" };
  it("keeps slots whose start date is inside the inclusive range", () => {
    const slots = [
      slot({ event_id: "a", start: "2026-05-18T10:00:00+00:00" }), // Mon
      slot({ event_id: "b", start: "2026-05-24T23:00:00+00:00" }), // Sun
    ];
    assert.equal(filterSlotsInWeek(slots, range).length, 2);
  });
  it("drops slots before or after the range", () => {
    const slots = [
      slot({ event_id: "before", start: "2026-05-17T23:00:00+00:00" }),
      slot({ event_id: "in", start: "2026-05-20T12:00:00+00:00" }),
      slot({ event_id: "after", start: "2026-05-25T00:00:00+00:00" }),
    ];
    const out = filterSlotsInWeek(slots, range).map((s) => s.event_id);
    assert.deepEqual(out, ["in"]);
  });
  it("keeps slots with no start (so warnings can surface)", () => {
    const slots = [slot({ event_id: "broken", start: "" })];
    assert.equal(filterSlotsInWeek(slots, range).length, 1);
  });
});
