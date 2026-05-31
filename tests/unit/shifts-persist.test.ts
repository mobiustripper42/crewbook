// Run with: npm run test:unit
// Pins the pure persist mappers so the action layer can trust them.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { buildRunRow, buildShiftRow, shouldRegenerate } from "../../lib/shifts/persist.ts";
import type { GeneratedShift } from "../../lib/agents/shift-agent-prompt.ts";

const baseShift: GeneratedShift = {
  date: "2026-06-01",
  boat_resource_id: "boatA",
  product_type: "brewboat",
  start: "2026-06-01T11:00:00-04:00",
  end: "2026-06-01T17:00:00-04:00",
  roles: ["captain", "mate"],
  covered_event_ids: ["e1", "e2", "e3"],
};

describe("buildShiftRow", () => {
  it("extracts wall-clock date + time from EDT-offset ISO strings", () => {
    const row = buildShiftRow(baseShift, { weekStart: "2026-06-01", schedulingRunId: "run-1" });
    assert.equal(row.week_start, "2026-06-01");
    assert.equal(row.shift_date, "2026-06-01");
    assert.equal(row.start_time, "11:00:00");
    assert.equal(row.end_time, "17:00:00");
    assert.equal(row.boat_resource_id, "boatA");
    assert.equal(row.product_type, "brewboat");
    assert.equal(row.scheduling_run_id, "run-1");
    assert.equal(row.status, "draft");
    assert.deepEqual(row.roles, ["captain", "mate"]);
    assert.deepEqual(row.covered_event_ids, ["e1", "e2", "e3"]);
  });

  it("preserves wall-clock time across DST offsets (-05:00 EST)", () => {
    const winterShift = { ...baseShift, start: "2026-12-07T11:00:00-05:00", end: "2026-12-07T13:00:00-05:00" };
    const row = buildShiftRow(winterShift, { weekStart: "2026-12-07", schedulingRunId: "run-2" });
    assert.equal(row.shift_date, "2026-12-07");
    assert.equal(row.start_time, "11:00:00");
    assert.equal(row.end_time, "13:00:00");
  });

  it("throws on a non-parseable ISO string", () => {
    assert.throws(
      () => buildShiftRow({ ...baseShift, start: "not-an-iso" }, { weekStart: "2026-06-01", schedulingRunId: "r" }),
      /cannot parse local datetime/,
    );
  });

  it("rejects a UTC Z suffix — wall-clock semantics require an explicit offset", () => {
    assert.throws(
      () => buildShiftRow({ ...baseShift, start: "2026-06-01T11:00:00Z" }, { weekStart: "2026-06-01", schedulingRunId: "r" }),
      /expected "YYYY-MM-DDTHH:MM:SS±HH:MM"/,
    );
  });

  it("rejects a naive ISO without an offset", () => {
    assert.throws(
      () => buildShiftRow({ ...baseShift, start: "2026-06-01T11:00:00" }, { weekStart: "2026-06-01", schedulingRunId: "r" }),
      /expected "YYYY-MM-DDTHH:MM:SS±HH:MM"/,
    );
  });
});

describe("shouldRegenerate", () => {
  it("proceeds when no shifts exist for the week", () => {
    assert.deepEqual(shouldRegenerate({ existingCount: 0, force: false }), { proceed: true });
  });
  it("blocks when shifts exist and force is false (with a helpful message)", () => {
    const r = shouldRegenerate({ existingCount: 5, force: false });
    assert.equal(r.proceed, false);
    assert.match(r.errorMessage!, /5 shifts already exist/);
    assert.match(r.errorMessage!, /force box/);
  });
  it("pluralizes correctly for 1 existing shift", () => {
    const r = shouldRegenerate({ existingCount: 1, force: false });
    assert.match(r.errorMessage!, /1 shift already exist[^s]/);
  });
  it("proceeds when force is true even with existing shifts", () => {
    assert.deepEqual(shouldRegenerate({ existingCount: 5, force: true }), { proceed: true });
  });
});

describe("buildRunRow", () => {
  it("populates the success path with usage + parsed output", () => {
    const row = buildRunRow({
      weekStart: "2026-06-01",
      model: "claude-sonnet-4-6",
      promptVersion: "2.1.0",
      input: { slots: ["a"] },
      output: { shifts: [{ date: "2026-06-01" }] },
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80, cache_creation_input_tokens: null },
      triggeredBy: "00000000-0000-0000-0000-000000000001",
    });
    assert.equal(row.run_type, "shift_generation");
    assert.equal(row.agent_version, "2.1.0");
    assert.equal(row.week_start, "2026-06-01");
    assert.equal(row.model, "claude-sonnet-4-6");
    assert.equal(row.input_tokens, 100);
    assert.equal(row.output_tokens, 50);
    assert.equal(row.cache_read_input_tokens, 80);
    assert.equal(row.cache_creation_input_tokens, null);
    assert.equal(row.error, null);
    assert.equal(row.triggered_by, "00000000-0000-0000-0000-000000000001");
  });

  it("populates the failure path: error string + null output + null usage", () => {
    const row = buildRunRow({
      weekStart: "2026-06-01",
      model: "claude-sonnet-4-6",
      promptVersion: "2.1.0",
      input: { slots: [] },
      error: "shift agent: stop_reason=max_tokens",
    });
    assert.equal(row.error, "shift agent: stop_reason=max_tokens");
    assert.equal(row.output_payload, null);
    assert.equal(row.input_tokens, null);
    assert.equal(row.triggered_by, null);
  });
});
