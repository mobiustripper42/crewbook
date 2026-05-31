// Phase 2.3 — one day's worth of generated shifts: a date heading plus a card
// per shift. Kept presentational; the page does the querying + grouping.

import { shortResourceId } from "@/app/admin/reservations/week";
import {
  formatDayHeading,
  formatTime,
  shiftRoles,
  type ShiftDayGroup,
  type ShiftRow,
} from "@/lib/shifts/display";

export function ShiftDayGroupSection({ group }: { group: ShiftDayGroup }) {
  return (
    <section className="flex flex-col gap-2" data-testid="shift-day-group">
      <h2 className="text-sm font-medium text-foreground" data-testid="shift-day-heading">
        {formatDayHeading(group.date)}{" "}
        <span className="text-xs text-muted-foreground">
          ({group.shifts.length} shift{group.shifts.length === 1 ? "" : "s"})
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {group.shifts.map((shift) => (
          <li key={shift.id}>
            <ShiftCard shift={shift} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShiftCard({ shift }: { shift: ShiftRow }) {
  const boat = shift.boat_label ?? shortResourceId(shift.boat_resource_id);
  const roles = shiftRoles(shift.roles);
  const coveredCount = shift.covered_event_ids?.length ?? 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
      data-testid="shift-card"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono tabular-nums" data-testid="shift-time">
            {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
          </span>
          <span
            className="font-mono text-muted-foreground"
            title={shift.boat_resource_id ?? undefined}
          >
            {boat}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[0.625rem] text-foreground">
            {shift.product_type}
          </span>
          {roles.map((role) => (
            <span
              key={role}
              className="rounded-sm border border-border px-1.5 py-0.5 text-[0.625rem] capitalize text-foreground"
              data-testid="shift-role"
            >
              {role}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
        <span data-testid="shift-coverage">
          {coveredCount} event{coveredCount === 1 ? "" : "s"}
        </span>
        <span className="capitalize">{shift.status}</span>
      </div>
    </div>
  );
}
