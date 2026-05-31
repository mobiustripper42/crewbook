// Phase 2.3 — Shift review UI. Read-only view of agent-generated shifts for one
// week, grouped by day, so the admin can scan what the shift agent produced
// before editing (2.4) and posting back to Xola (Phase 6).
//
// Auth: admin-only conceptually; real auth (magic link + profiles.is_admin)
// lands in Phase 5.1. Until then this reads via the service-role client and is
// effectively open — don't link it from public pages. Mirrors the same posture
// as /admin/reservations.

import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { groupShiftsByDay, type ShiftRow } from "@/lib/shifts/display";

import { ShiftDayGroupSection } from "@/components/admin/shift-day-group";

import { DEFAULT_MONDAY, startOfWeek, weekRange } from "../reservations/week";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function AdminShiftsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedWeek = params.week ?? DEFAULT_MONDAY;
  let monday: string;
  try {
    monday = startOfWeek(requestedWeek);
  } catch {
    monday = startOfWeek(DEFAULT_MONDAY);
  }
  const range = weekRange(monday);
  const showingSeededNote = params.week === undefined;

  // Filter by shift_date within the week range rather than week_start: week_start
  // is nullable and shift_date is always present, so range-filtering is robust
  // regardless of how a row was generated.
  const supabase = getSupabaseAdmin();
  const shiftsRes = await supabase
    .from("shifts")
    .select("*")
    .gte("shift_date", range.start)
    .lte("shift_date", range.end);

  const shifts: ShiftRow[] = shiftsRes.data ?? [];
  const groups = groupShiftsByDay(shifts);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-medium">Generated Shifts</h1>
          <p className="text-xs text-muted-foreground" data-testid="week-range">
            Week of {range.start} → {range.end}{" "}
            {showingSeededNote && <span className="italic">(showing seeded sandbox week)</span>}
          </p>
        </div>
        <Link
          href={`/admin/reservations?week=${monday}`}
          className="text-xs text-foreground underline-offset-2 hover:underline"
          data-testid="back-to-reservations"
        >
          ← Reservations
        </Link>
      </header>

      <WeekPicker monday={monday} />

      {shiftsRes.error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <p className="font-medium">Could not load generated shifts:</p>
          <p className="mt-1">{shiftsRes.error.message}</p>
        </div>
      )}

      {shiftsRes.error ? null : groups.length === 0 ? (
        <EmptyState monday={monday} range={range} />
      ) : (
        <div className="flex flex-col gap-5" data-testid="shifts-list">
          {groups.map((group) => (
            <ShiftDayGroupSection key={group.date} group={group} />
          ))}
        </div>
      )}
    </main>
  );
}

function WeekPicker({ monday }: { monday: string }) {
  return (
    <form action="/admin/shifts" method="get" className="flex items-center gap-2">
      <label htmlFor="week" className="text-xs text-muted-foreground">
        Week starting:
      </label>
      <input
        id="week"
        name="week"
        type="date"
        defaultValue={monday}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        data-testid="week-input"
      />
      <button
        type="submit"
        className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
      >
        Go
      </button>
    </form>
  );
}

function EmptyState({
  monday,
  range,
}: {
  monday: string;
  range: { start: string; end: string };
}) {
  return (
    <div
      data-testid="empty-state"
      className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground"
    >
      No generated shifts for week of {range.start} – {range.end}.
      <br />
      Head to{" "}
      <Link
        href={`/admin/reservations?week=${monday}`}
        className="font-medium text-foreground underline-offset-2 hover:underline"
      >
        Reservations
      </Link>{" "}
      and click <span className="font-medium">Generate Shifts</span>.
    </div>
  );
}
