// Run with: npm run test:unit
//
// Covers the Phase 2.1 shift agent's PURE surface — prompt assembly, output
// parsing/validation, the inject-a-responder orchestration path, and the
// grader. No network and no API key: the live model call is exercised only by
// scripts/eval-shift-agent.mjs (key-gated, not in CI).

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildUserPrompt,
  parseShiftAgentOutput,
  SHIFT_AGENT_SYSTEM_PROMPT,
  type GeneratedShift,
} from "../../lib/agents/shift-agent-prompt.ts";
import { generateShifts, type ShiftResponderRequest } from "../../lib/agents/shift-agent.ts";
import { gradeShifts } from "../../lib/agents/grade-shifts.ts";
import type { TimeSlot } from "../../lib/xola/mapping.ts";

function slot(overrides: Partial<TimeSlot> & Pick<TimeSlot, "event_id" | "start">): TimeSlot {
  return {
    event_id: overrides.event_id,
    seller_id: "seller-1",
    experience_id: "exp-1",
    product_name: "Brewboat Tour - captained",
    product_type: "brewboat",
    start: overrides.start,
    end: overrides.end ?? overrides.start,
    boat_resource_id: overrides.boat_resource_id ?? "boatA",
    total_guests: overrides.total_guests ?? 4,
    order_count: overrides.order_count ?? 1,
    status_breakdown: overrides.status_breakdown ?? { "200": 1 },
    warnings: [],
  };
}

function shift(overrides: Partial<GeneratedShift> = {}): GeneratedShift {
  return {
    date: "2026-06-01",
    boat_resource_id: "boatA",
    product_type: "brewboat",
    start: "2026-06-01T11:00:00-04:00",
    end: "2026-06-01T17:00:00-04:00",
    roles: ["captain", "mate"],
    covered_event_ids: ["e1", "e2", "e3"],
    ...overrides,
  };
}

describe("buildUserPrompt", () => {
  it("sorts slots by boat then start and includes the agent-relevant fields", () => {
    const slots = [
      slot({ event_id: "b-late", boat_resource_id: "boatB", start: "2026-06-01T15:00:00-04:00" }),
      slot({ event_id: "a-early", boat_resource_id: "boatA", start: "2026-06-01T11:00:00-04:00" }),
      slot({ event_id: "b-early", boat_resource_id: "boatB", start: "2026-06-01T11:00:00-04:00" }),
    ];
    const prompt = buildUserPrompt(slots, "2026-06-01");
    const payload = JSON.parse(prompt.slice(prompt.indexOf("{")));
    assert.deepEqual(
      payload.slots.map((s: { event_id: string }) => s.event_id),
      ["a-early", "b-early", "b-late"],
    );
    assert.equal(payload.week_start, "2026-06-01");
    assert.deepEqual(Object.keys(payload.slots[0]).sort(), [
      "boat_resource_id",
      "end",
      "event_id",
      "order_count",
      "product_type",
      "start",
      "total_guests",
    ]);
  });

  it("is deterministic — same slots render identical bytes (cache-safe)", () => {
    const slots = [
      slot({ event_id: "e2", start: "2026-06-01T13:00:00-04:00" }),
      slot({ event_id: "e1", start: "2026-06-01T11:00:00-04:00" }),
    ];
    assert.equal(buildUserPrompt(slots, "2026-06-01"), buildUserPrompt(slots, "2026-06-01"));
  });
});

describe("parseShiftAgentOutput", () => {
  it("parses a well-formed shifts array", () => {
    const raw = JSON.stringify({ shifts: [shift()] });
    const out = parseShiftAgentOutput(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0].boat_resource_id, "boatA");
    assert.deepEqual(out[0].roles, ["captain", "mate"]);
  });

  it("throws on non-JSON", () => {
    assert.throws(() => parseShiftAgentOutput("not json"), /non-JSON/);
  });

  it('throws when "shifts" is missing', () => {
    assert.throws(() => parseShiftAgentOutput(JSON.stringify({ foo: 1 })), /missing "shifts"/);
  });

  it("throws on an invalid role", () => {
    const raw = JSON.stringify({ shifts: [{ ...shift(), roles: ["skipper"] }] });
    assert.throws(() => parseShiftAgentOutput(raw), /roles/);
  });

  it("throws on a missing required field", () => {
    const bad = shift() as Partial<GeneratedShift>;
    delete bad.end;
    assert.throws(() => parseShiftAgentOutput(JSON.stringify({ shifts: [bad] })), /end/);
  });
});

describe("generateShifts — injected responder", () => {
  it("builds the prompt, calls the responder, parses, and surfaces usage + prompt version", async () => {
    let captured: ShiftResponderRequest | null = null;
    const slots = [slot({ event_id: "e1", start: "2026-06-01T11:00:00-04:00" })];
    const usage = {
      input_tokens: 1234,
      output_tokens: 200,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: null,
    };
    const result = await generateShifts({
      slots,
      weekStart: "2026-06-01",
      responder: async (req) => {
        captured = req;
        return { raw: JSON.stringify({ shifts: [shift({ covered_event_ids: ["e1"] })] }), usage };
      },
    });

    assert.equal(result.shifts.length, 1);
    assert.deepEqual(result.shifts[0].covered_event_ids, ["e1"]);
    assert.equal(result.model, "claude-sonnet-4-6");
    assert.equal(result.promptVersion, "2.1.0");
    assert.deepEqual(result.usage, usage);
    const req = captured as ShiftResponderRequest | null;
    if (!req) throw new Error("responder was not called");
    assert.equal(req.system, SHIFT_AGENT_SYSTEM_PROMPT);
    assert.equal(req.model, "claude-sonnet-4-6");
    assert.match(req.userPrompt, /"event_id": "e1"/);
  });

  it("usage is optional — responders without usage data still produce shifts", async () => {
    const result = await generateShifts({
      slots: [slot({ event_id: "e1", start: "2026-06-01T11:00:00-04:00" })],
      weekStart: "2026-06-01",
      responder: async () => ({ raw: JSON.stringify({ shifts: [shift({ covered_event_ids: ["e1"] })] }) }),
    });
    assert.equal(result.shifts.length, 1);
    assert.equal(result.usage, undefined);
  });

  it("propagates a parse failure from a malformed reply", async () => {
    await assert.rejects(
      generateShifts({
        slots: [slot({ event_id: "e1", start: "2026-06-01T11:00:00-04:00" })],
        weekStart: "2026-06-01",
        responder: async () => ({ raw: "{ broken" }),
      }),
      /non-JSON/,
    );
  });
});

describe("gradeShifts", () => {
  const answer = [
    shift({ boat_resource_id: "boatA", start: "2026-06-01T11:00:00-04:00", covered_event_ids: ["e1", "e2"] }),
    shift({ boat_resource_id: "boatC", start: "2026-06-03T11:00:00-04:00", end: "2026-06-03T13:00:00-04:00", covered_event_ids: ["e6"] }),
  ];

  it("scores a perfect match as 1.0 with no diffs", () => {
    const report = gradeShifts(answer, answer);
    assert.equal(report.score, 1);
    assert.equal(report.matched, 2);
    assert.equal(report.mismatched.length, 0);
    assert.equal(report.missing.length, 0);
    assert.equal(report.extra.length, 0);
  });

  it("flags a missing expected shift", () => {
    const report = gradeShifts([answer[0]], answer);
    assert.equal(report.matched, 1);
    assert.equal(report.missing.length, 1);
    assert.match(report.missing[0], /boatC/);
    assert.equal(report.score, 0.5);
  });

  it("flags an extra generated shift", () => {
    const extra = shift({ boat_resource_id: "boatZ", start: "2026-06-04T11:00:00-04:00" });
    const report = gradeShifts([...answer, extra], answer);
    assert.equal(report.matched, 2);
    assert.equal(report.extra.length, 1);
    assert.match(report.extra[0], /boatZ/);
  });

  it("flags a same-key shift with the wrong end as a mismatch, not a match", () => {
    const wrong = [{ ...answer[0], end: "2026-06-01T19:00:00-04:00" }, answer[1]];
    const report = gradeShifts(wrong, answer);
    assert.equal(report.matched, 1);
    assert.equal(report.mismatched.length, 1);
    assert.match(report.mismatched[0].diffs.join(), /end:/);
  });
});
