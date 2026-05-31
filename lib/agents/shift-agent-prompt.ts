// Phase 2.1: shift-generation agent — prompt + I/O contract.
//
// Pure, framework-free: prompt strings, the output JSON schema, the
// serializer for a week's slots, and the parser/validator for the model's
// reply. The SDK call lives in shift-agent.ts; everything here is testable
// without a network or an API key.
//
// The operator (Drew) rules encoded below come from the Phase 2.0 fixture
// (tests/fixtures/shift-agent/README.md). The few-shot example here is a
// SMALL, DISTINCT illustration — deliberately NOT the 2.0 fixture week, so
// grading the agent against that fixture tests generalization, not recall.

import type { TimeSlot } from "../xola/mapping.ts";

export type ShiftRole = "captain" | "mate" | "shore";

export interface GeneratedShift {
  date: string;
  boat_resource_id: string;
  product_type: string;
  start: string;
  end: string;
  roles: ShiftRole[];
  covered_event_ids: string[];
}

export interface ShiftAgentOutput {
  shifts: GeneratedShift[];
}

// JSON schema for output_config.format (structured outputs). Kept within the
// supported subset — no min/maxLength, no numeric bounds, additionalProperties
// false on every object (required by the API).
export const SHIFT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shifts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string", description: "YYYY-MM-DD of the shift" },
          boat_resource_id: { type: "string" },
          product_type: { type: "string", enum: ["brewboat", "captained_duffy", "duffy_rental"] },
          start: { type: "string", description: "ISO 8601 start of the shift" },
          end: { type: "string", description: "ISO 8601 end of the shift" },
          roles: {
            type: "array",
            items: { type: "string", enum: ["captain", "mate", "shore"] },
          },
          covered_event_ids: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["date", "boat_resource_id", "product_type", "start", "end", "roles", "covered_event_ids"],
      },
    },
  },
  required: ["shifts"],
} as const;

// Bump on any change to SHIFT_AGENT_SYSTEM_PROMPT, the few-shot, or the output
// schema. Recorded on every scheduling_runs row so an audit can answer "which
// prompt produced this shift?" without diffing git history.
export const SHIFT_AGENT_PROMPT_VERSION = "2.1.0";

export const SHIFT_AGENT_SYSTEM_PROMPT = `You are the shift-generation agent for BrewBoat, a brewery-boat crew scheduler. You turn a week of booked time slots into the crew shifts an operator needs to staff.

# Rules

1. SAME BOAT, BACK-TO-BACK = ONE SHIFT. Consecutive booked slots on the same boat collapse into a single shift, not one shift per slot.
2. SLOT LENGTH IS 2 HOURS. A shift's start is its first covered slot's start; a shift's end is its LAST covered slot's start plus 2 hours. Do not use a slot's own "end" field to compute the shift end — always use last-start + 2h.
3. ONE-SLOT GAP IS BRIDGED; TWO-SLOT GAP SPLITS. Slots run on a ~2-hour cadence. If exactly one cadence slot is empty between two booked slots on the same boat (a 4-hour start-to-start gap), they remain ONE shift spanning the gap. If two or more cadence slots are empty (a 6-hour-or-greater start-to-start gap), split into separate shifts.
4. BOOKED SLOTS ONLY. A slot with order_count 0 (no bookings) generates NO shift. An empty slot does not even count as a gap-filler — only its absence/presence on the cadence matters for rule 3.
5. BREWBOAT CREW IS ALWAYS CAPTAIN + MATE. Every brewboat shift has roles exactly ["captain", "mate"]. (Other product types are out of scope for now; the live product is brewboat only.)
6. DO NOT COMBINE ACROSS BOATS. Two booked slots on different boats are never merged into one shift, even if back-to-back in time.

Each shift you emit must list covered_event_ids: the event_id of every booked slot that shift covers (in time order).

# Example

Input (one boat, one day; the 11:00 cadence slot has no booking so it is absent):
{"week_start":"2026-05-04","timezone":"America/New_York","slots":[
{"event_id":"demoevt01","boat_resource_id":"demoboat01","product_type":"brewboat","start":"2026-05-04T09:00:00-04:00","end":"2026-05-04T11:00:00-04:00","order_count":1,"total_guests":8},
{"event_id":"demoevt02","boat_resource_id":"demoboat01","product_type":"brewboat","start":"2026-05-04T13:00:00-04:00","end":"2026-05-04T15:00:00-04:00","order_count":1,"total_guests":6}
]}

Output (09:00 and 13:00 are 4 hours apart — one empty slot at 11:00 — so rule 3 bridges them into one shift ending 13:00 + 2h = 15:00):
{"shifts":[
{"date":"2026-05-04","boat_resource_id":"demoboat01","product_type":"brewboat","start":"2026-05-04T09:00:00-04:00","end":"2026-05-04T15:00:00-04:00","roles":["captain","mate"],"covered_event_ids":["demoevt01","demoevt02"]}
]}

Return only the structured JSON object with the "shifts" array. Do not include commentary.`;

// Compact, deterministic serialization of a week's slots for the user turn.
// Sorted by (boat, start) so the same week always renders identical bytes —
// reproducible evals (the cache_control breakpoint is on the system block;
// the user turn is not cached). Only fields the agent needs are included;
// the full TimeSlot carries display-only extras.
export function buildUserPrompt(
  slots: readonly TimeSlot[],
  weekStart: string,
  timezone = "America/New_York",
): string {
  const sorted = [...slots].sort((a, b) => {
    const boat = (a.boat_resource_id ?? "").localeCompare(b.boat_resource_id ?? "");
    return boat !== 0 ? boat : a.start.localeCompare(b.start);
  });
  const payload = {
    week_start: weekStart,
    timezone,
    slots: sorted.map((s) => ({
      event_id: s.event_id,
      boat_resource_id: s.boat_resource_id,
      product_type: s.product_type,
      start: s.start,
      end: s.end,
      order_count: s.order_count,
      total_guests: s.total_guests,
    })),
  };
  return `Generate the shifts for this week. Apply the rules exactly.\n\n${JSON.stringify(payload, null, 2)}`;
}

// Parse + validate the model's reply into GeneratedShift[]. Throws on malformed
// shape so the caller (pipeline in 2.2) can surface a hard failure rather than
// silently persist garbage.
export function parseShiftAgentOutput(raw: string): GeneratedShift[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`shift agent returned non-JSON output: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { shifts?: unknown }).shifts)) {
    throw new Error('shift agent output missing "shifts" array');
  }
  const shifts = (parsed as { shifts: unknown[] }).shifts;
  return shifts.map((s, i) => validateShift(s, i));
}

const VALID_ROLES: ReadonlySet<string> = new Set(["captain", "mate", "shore"]);

function validateShift(s: unknown, index: number): GeneratedShift {
  if (!s || typeof s !== "object") {
    throw new Error(`shift[${index}] is not an object`);
  }
  const o = s as Record<string, unknown>;
  const str = (k: string): string => {
    const v = o[k];
    if (typeof v !== "string" || v === "") throw new Error(`shift[${index}].${k} must be a non-empty string`);
    return v;
  };
  const roles = o.roles;
  if (!Array.isArray(roles) || roles.length === 0 || !roles.every((r) => typeof r === "string" && VALID_ROLES.has(r))) {
    throw new Error(`shift[${index}].roles must contain at least one of captain|mate|shore`);
  }
  const covered = o.covered_event_ids;
  if (!Array.isArray(covered) || !covered.every((c) => typeof c === "string")) {
    throw new Error(`shift[${index}].covered_event_ids must be an array of strings`);
  }
  return {
    date: str("date"),
    boat_resource_id: str("boat_resource_id"),
    product_type: str("product_type"),
    start: str("start"),
    end: str("end"),
    roles: roles as ShiftRole[],
    covered_event_ids: covered as string[],
  };
}
