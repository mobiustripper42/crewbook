// Phase 2.3 — pure display helpers for the shift review UI. No DB or framework
// imports so the grouping + formatting logic is unit-testable in isolation
// (same discipline as app/admin/reservations/week.ts).

import type { Database } from "../supabase/types.ts";

export type ShiftRow = Database["public"]["Tables"]["shifts"]["Row"];

export interface ShiftDayGroup {
  date: string; // YYYY-MM-DD
  shifts: ShiftRow[];
}

// Group shifts by shift_date — days ascending, shifts within a day ordered by
// start_time then id so positions stay stable across renders.
export function groupShiftsByDay(shifts: ShiftRow[]): ShiftDayGroup[] {
  const byDate = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const list = byDate.get(s.shift_date) ?? [];
    list.push(s);
    byDate.set(s.shift_date, list);
  }
  return [...byDate.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({
      date,
      shifts: (byDate.get(date) ?? []).sort((a, b) => {
        if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
        return a.id.localeCompare(b.id);
      }),
    }));
}

// shifts.roles is Json; the agent writes a string[] like ["captain","mate"].
// Normalize defensively to a string[] for badge rendering.
export function shiftRoles(roles: ShiftRow["roles"]): string[] {
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is string => typeof r === "string");
}

// "HH:MM:SS" → "HH:MM". Returns the input unchanged if it doesn't match.
export function formatTime(t: string): string {
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : t;
}

// Friendly day heading, e.g. "Mon May 18". Pure + UTC-anchored at noon to dodge
// any DST snapping (same construction as week.ts).
export function formatDayHeading(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    dt.getUTCMonth()
  ];
  return `${wd} ${mon} ${Number(d)}`;
}
