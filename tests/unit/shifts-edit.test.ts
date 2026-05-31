// Run with: npm run test:unit

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildMergedShift } from "../../lib/shifts/edit.ts";
import type { ShiftRow } from "../../lib/shifts/display.ts";

function shift(overrides: Partial<ShiftRow> = {}): ShiftRow {
  return {
    id: "s1",
    week_start: "2026-05-18",
    shift_date: "2026-05-18",
    start_time: "09:00:00",
    end_time: "11:00:00",
    product_type: "brewboat",
    boat_resource_id: "boat-1",
    boat_label: null,
    roles: ["captain", "mate"],
    covered_event_ids: ["e1"],
    scheduling_run_id: "run-1",
    xola_event_id: null,
    notes: null,
    status: "draft",
    created_at: "2026-05-18T00:00:00Z",
    updated_at: "2026-05-18T00:00:00Z",
    ...overrides,
  };
}

describe("buildMergedShift — validation", () => {
  it("rejects fewer than 2 shifts", () => {
    const r = buildMergedShift([shift()]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /at least 2/);
  });

  it("rejects different days", () => {
    const r = buildMergedShift([shift(), shift({ id: "s2", shift_date: "2026-05-19" })]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /same day/);
  });

  it("rejects different boats", () => {
    const r = buildMergedShift([shift(), shift({ id: "s2", boat_resource_id: "boat-2" })]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /same boat/);
  });

  it("rejects different product types", () => {
    const r = buildMergedShift([shift(), shift({ id: "s2", product_type: "duffy_rental" })]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /product type/);
  });
});

describe("buildMergedShift — happy path", () => {
  it("spans earliest start → latest end and unions events", () => {
    const r = buildMergedShift([
      shift({ id: "a", start_time: "09:00:00", end_time: "11:00:00", covered_event_ids: ["e1", "e2"] }),
      shift({ id: "b", start_time: "13:00:00", end_time: "15:00:00", covered_event_ids: ["e3"] }),
    ]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.row.start_time, "09:00:00");
    assert.equal(r.row.end_time, "15:00:00");
    assert.deepEqual(r.row.covered_event_ids, ["e1", "e2", "e3"]);
    assert.equal(r.row.status, "draft");
    assert.equal(r.row.scheduling_run_id, "run-1"); // first source's run, as anchor
  });

  it("dedups overlapping covered events", () => {
    const r = buildMergedShift([
      shift({ id: "a", covered_event_ids: ["e1", "e2"] }),
      shift({ id: "b", start_time: "13:00:00", end_time: "15:00:00", covered_event_ids: ["e2", "e3"] }),
    ]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.row.covered_event_ids, ["e1", "e2", "e3"]);
  });

  it("unions roles in canonical order", () => {
    const r = buildMergedShift([
      shift({ id: "a", roles: ["mate"] }),
      shift({ id: "b", start_time: "13:00:00", end_time: "15:00:00", roles: ["captain"] }),
    ]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.row.roles, ["captain", "mate"]);
  });

  it("keeps the first non-null boat_label", () => {
    const r = buildMergedShift([
      shift({ id: "a", boat_label: null }),
      shift({ id: "b", start_time: "13:00:00", end_time: "15:00:00", boat_label: "Reuben James" }),
    ]);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.row.boat_label, "Reuben James");
  });
});
