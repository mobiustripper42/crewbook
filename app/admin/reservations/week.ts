// Phase 1.7 helpers — pure, no DB or framework imports so unit tests stay light.

import type { TimeSlot } from "@/lib/xola/mapping";

// Default week both admin views (reservations + shifts) land on — the seeded
// sandbox week. Swap to "current week" once prod data flows.
export const DEFAULT_MONDAY = "2026-05-18";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Snap an ISO date (YYYY-MM-DD) to the Monday of its ISO week. We treat
// Monday–Sunday as the working week per user direction (matches operator
// intuition for crew scheduling — the week ends after Sunday brunch service).
export function startOfWeek(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new Error(`startOfWeek: invalid date '${isoDate}'`);
  const [, y, mo, d] = match;
  // Construct at noon UTC to dodge any DST snapping when we add/subtract days.
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  // getUTCDay: Sun=0, Mon=1, ..., Sat=6. We want Mon as start, so map Sun→6.
  const dow = dt.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday);
  return dt.toISOString().slice(0, 10);
}

export interface WeekRange {
  // ISO date strings (YYYY-MM-DD) — Monday and Sunday inclusive.
  start: string;
  end: string;
}

export function weekRange(monday: string): WeekRange {
  const match = ISO_DATE.exec(monday);
  if (!match) throw new Error(`weekRange: invalid date '${monday}'`);
  const [, y, mo, d] = match;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  dt.setUTCDate(dt.getUTCDate() + 6);
  return { start: monday, end: dt.toISOString().slice(0, 10) };
}

// DEC-115 status mapping. Confirmed family + cancelled is the V1 surface.
const STATUS_LABELS: Record<string, string> = {
  "200": "confirmed",
  "201": "confirmed",
  "202": "confirmed",
  "203": "confirmed",
  "700": "cancelled",
};

// Collapse a status_breakdown into a human display string.
// {200: 2} → "2 confirmed". {200: 1, 700: 1} → "1 confirmed, 1 cancelled".
// {404: 3} (unknown code) → "3 status 404" so we don't silently swallow it.
export function summarizeStatuses(breakdown: Record<string, number>): string {
  // Aggregate by label so 200 + 202 both feed "confirmed."
  const byLabel = new Map<string, number>();
  for (const [code, count] of Object.entries(breakdown)) {
    if (count <= 0) continue;
    const label = STATUS_LABELS[code] ?? `status ${code}`;
    byLabel.set(label, (byLabel.get(label) ?? 0) + count);
  }
  if (byLabel.size === 0) return "—";
  // Stable order: confirmed first, cancelled second, then alphabetical.
  const order = (label: string) => (label === "confirmed" ? 0 : label === "cancelled" ? 1 : 2);
  const parts = [...byLabel.entries()].sort((a, b) => {
    const oa = order(a[0]);
    const ob = order(b[0]);
    if (oa !== ob) return oa - ob;
    return a[0].localeCompare(b[0]);
  });
  return parts.map(([label, n]) => `${n} ${label}`).join(", ");
}

// Display a Xola resource id compactly. Last 8 chars with an ellipsis,
// e.g. "6a0fa498081e494f74080020" → "…74080020". Caller renders the full
// id as a `title` attribute for hover-to-reveal.
export function shortResourceId(id: string | null): string {
  if (!id) return "—";
  if (id.length <= 8) return id;
  return `…${id.slice(-8)}`;
}

// Stable ordering for the table: by start time, then by event_id (so two
// events at the same instant don't flip positions across renders).
export function sortSlotsForDisplay(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.event_id.localeCompare(b.event_id);
  });
}

// Filter slots to those whose start date falls within [start, end] inclusive.
// Slots whose start isn't a valid ISO are kept (with no date filter applied)
// so the table still surfaces them — the warning column will flag missing
// start fields.
export function filterSlotsInWeek(slots: TimeSlot[], range: WeekRange): TimeSlot[] {
  return slots.filter((s) => {
    if (!s.start) return true;
    const day = s.start.slice(0, 10);
    return day >= range.start && day <= range.end;
  });
}
