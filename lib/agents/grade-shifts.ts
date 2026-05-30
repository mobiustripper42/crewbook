// Phase 2.1: grade generated shifts against a known-good answer key.
//
// Pure comparison — no model, no I/O. Used by the eval script (2.1) against
// the 2.0 fixture, and reused by 2.5 to grade against real historical weeks.
//
// Shifts are matched by (date, boat_resource_id, start) — the natural identity
// of a shift. A matched pair is then checked field-by-field; differences are
// reported rather than counted as a match, so a shift that lands on the right
// boat/time but with the wrong span or coverage shows up as a mismatch, not a
// pass.

import type { GeneratedShift } from "./shift-agent-prompt.ts";

export interface ShiftMismatch {
  key: string;
  diffs: string[];
}

export interface GradeReport {
  total: number;
  matched: number;
  mismatched: ShiftMismatch[];
  missing: string[]; // expected shifts with no generated counterpart
  extra: string[]; // generated shifts with no expected counterpart
  score: number; // matched / total expected (0..1); 1 when total is 0
}

function shiftKey(s: GeneratedShift): string {
  return `${s.date}|${s.boat_resource_id}|${s.start}`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

function diffShift(expected: GeneratedShift, actual: GeneratedShift): string[] {
  const diffs: string[] = [];
  if (expected.end !== actual.end) diffs.push(`end: expected ${expected.end}, got ${actual.end}`);
  if (expected.product_type !== actual.product_type) {
    diffs.push(`product_type: expected ${expected.product_type}, got ${actual.product_type}`);
  }
  if (!sameSet(expected.roles, actual.roles)) {
    diffs.push(`roles: expected [${[...expected.roles].sort()}], got [${[...actual.roles].sort()}]`);
  }
  if (!sameSet(expected.covered_event_ids, actual.covered_event_ids)) {
    diffs.push(
      `covered_event_ids: expected [${[...expected.covered_event_ids].sort()}], got [${[...actual.covered_event_ids].sort()}]`,
    );
  }
  return diffs;
}

export function gradeShifts(
  generated: readonly GeneratedShift[],
  expected: readonly GeneratedShift[],
): GradeReport {
  const genByKey = new Map(generated.map((s) => [shiftKey(s), s]));
  const expectedKeys = new Set(expected.map(shiftKey));

  let matched = 0;
  const mismatched: ShiftMismatch[] = [];
  const missing: string[] = [];

  for (const exp of expected) {
    const key = shiftKey(exp);
    const act = genByKey.get(key);
    if (!act) {
      missing.push(key);
      continue;
    }
    const diffs = diffShift(exp, act);
    if (diffs.length === 0) matched++;
    else mismatched.push({ key, diffs });
  }

  const extra = generated.filter((s) => !expectedKeys.has(shiftKey(s))).map(shiftKey);

  return {
    total: expected.length,
    matched,
    mismatched,
    missing,
    extra,
    score: expected.length === 0 ? 1 : matched / expected.length,
  };
}
