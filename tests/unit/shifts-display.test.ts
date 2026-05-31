// Run with: npm run test:unit

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  formatDayHeading,
  formatTime,
  groupShiftsByDay,
  shiftRoles,
  type ShiftRow,
} from "../../lib/shifts/display.ts";

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

describe("groupShiftsByDay", () => {
  it("groups by shift_date with days ascending", () => {
    const groups = groupShiftsByDay([
      shift({ id: "b", shift_date: "2026-05-19" }),
      shift({ id: "a", shift_date: "2026-05-18" }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.date),
      ["2026-05-18", "2026-05-19"],
    );
  });

  it("orders shifts within a day by start_time then id", () => {
    const groups = groupShiftsByDay([
      shift({ id: "late", start_time: "13:00:00" }),
      shift({ id: "early", start_time: "09:00:00" }),
      shift({ id: "early-b", start_time: "09:00:00" }),
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(
      groups[0].shifts.map((s) => s.id),
      ["early", "early-b", "late"],
    );
  });

  it("returns an empty array for no shifts", () => {
    assert.deepEqual(groupShiftsByDay([]), []);
  });
});

describe("shiftRoles", () => {
  it("returns the string roles", () => {
    assert.deepEqual(shiftRoles(["captain", "mate"]), ["captain", "mate"]);
  });

  it("normalizes non-array / non-string Json to an empty array", () => {
    assert.deepEqual(shiftRoles(null), []);
    assert.deepEqual(shiftRoles("captain" as unknown as ShiftRow["roles"]), []);
    assert.deepEqual(shiftRoles([1, "mate"] as unknown as ShiftRow["roles"]), ["mate"]);
  });
});

describe("formatTime", () => {
  it("trims seconds", () => {
    assert.equal(formatTime("09:00:00"), "09:00");
  });
  it("passes through non-matching input", () => {
    assert.equal(formatTime("nope"), "nope");
  });
});

describe("formatDayHeading", () => {
  it("renders weekday + month + day", () => {
    assert.equal(formatDayHeading("2026-05-18"), "Mon May 18");
  });
  it("passes through an invalid date", () => {
    assert.equal(formatDayHeading("garbage"), "garbage");
  });
});
