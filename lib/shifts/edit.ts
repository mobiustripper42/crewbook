// Phase 2.4 — pure shift-edit logic. Merge is "fix the agent's collapse": the
// admin picks N shifts that should have been one and combines them. Kept pure
// (no DB/IO) so validation + the computed row are unit-testable; the action
// layer re-reads the rows by id and feeds them here. Merge never touches Xola —
// it works entirely from existing shift rows.

import type { ShiftRow } from "./display.ts";
import type { ShiftInsert } from "./persist.ts";
import { shiftRoles } from "./display.ts";

// Canonical role order so a merged shift lists roles deterministically.
const ROLE_ORDER = ["captain", "mate", "shore"];

export type MergeResult =
  | { ok: true; row: ShiftInsert }
  | { ok: false; error: string };

// Combine 2+ shifts into one. All must share day, boat, and product type —
// merging across any of those is a mistake, not a collapse fix, so reject it.
export function buildMergedShift(shifts: ShiftRow[]): MergeResult {
  if (shifts.length < 2) {
    return { ok: false, error: "Select at least 2 shifts to merge." };
  }

  const [first] = shifts;
  if (shifts.some((s) => s.shift_date !== first.shift_date)) {
    return { ok: false, error: "Can only merge shifts on the same day." };
  }
  if (shifts.some((s) => s.boat_resource_id !== first.boat_resource_id)) {
    return { ok: false, error: "Can only merge shifts on the same boat." };
  }
  if (shifts.some((s) => s.product_type !== first.product_type)) {
    return { ok: false, error: "Can only merge shifts of the same product type." };
  }

  // Span = earliest start → latest end. "HH:MM:SS" sorts lexicographically.
  const startTime = shifts.reduce((min, s) => (s.start_time < min ? s.start_time : min), first.start_time);
  const endTime = shifts.reduce((max, s) => (s.end_time > max ? s.end_time : max), first.end_time);

  // Union of covered events (dedup, stable insertion order).
  const covered: string[] = [];
  const seenEvents = new Set<string>();
  for (const s of shifts) {
    for (const id of s.covered_event_ids ?? []) {
      if (!seenEvents.has(id)) {
        seenEvents.add(id);
        covered.push(id);
      }
    }
  }

  // Union of roles in canonical order, with any unknown roles appended.
  const roleSet = new Set<string>();
  for (const s of shifts) for (const r of shiftRoles(s.roles)) roleSet.add(r);
  const roles = [
    ...ROLE_ORDER.filter((r) => roleSet.has(r)),
    ...[...roleSet].filter((r) => !ROLE_ORDER.includes(r)).sort(),
  ];

  return {
    ok: true,
    row: {
      week_start: first.week_start,
      shift_date: first.shift_date,
      start_time: startTime,
      end_time: endTime,
      product_type: first.product_type,
      boat_resource_id: first.boat_resource_id,
      boat_label: shifts.find((s) => s.boat_label)?.boat_label ?? null,
      roles,
      covered_event_ids: covered,
      // Provenance pointer: keep the first source's run so the merged row still
      // traces back to an agent call (merge spans runs; first is the anchor).
      scheduling_run_id: first.scheduling_run_id,
      notes: shifts.find((s) => s.notes)?.notes ?? null,
      status: "draft",
      // xola_event_id is intentionally left default-null: agent-generated shifts
      // track coverage via covered_event_ids (above), not the legacy single-event
      // pointer, so there's nothing to carry across a merge.
    },
  };
}
