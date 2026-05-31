"use client";

// Phase 2.4 — one shift, as an editable card: selection checkbox (for merge),
// the read details (time, boat, product/role badges, coverage, status), and an
// inline two-step delete confirm. Presentational; the ShiftEditor owns state.

import { shortResourceId } from "@/app/admin/reservations/week";
import { formatTime, shiftRoles, type ShiftRow } from "@/lib/shifts/display";

export interface ShiftCardProps {
  shift: ShiftRow;
  selected: boolean;
  onToggle: () => void;
  confirming: boolean;
  onDeleteClick: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  pending: boolean;
}

export function ShiftCard({
  shift,
  selected,
  onToggle,
  confirming,
  onDeleteClick,
  onConfirmDelete,
  onCancelDelete,
  pending,
}: ShiftCardProps) {
  const boat = shift.boat_label ?? shortResourceId(shift.boat_resource_id);
  const roles = shiftRoles(shift.roles);
  const coveredCount = shift.covered_event_ids?.length ?? 0;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
      data-testid="shift-card"
      data-selected={selected}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-0.5"
          data-testid="shift-select"
          aria-label={`Select ${formatTime(shift.start_time)} ${boat} shift for merge`}
        />
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
      </div>
      <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span data-testid="shift-coverage">
            {coveredCount} event{coveredCount === 1 ? "" : "s"}
          </span>
          <span className="capitalize">{shift.status}</span>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={pending}
              className="text-destructive underline-offset-2 hover:underline"
              data-testid="shift-delete-confirm"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="text-muted-foreground underline-offset-2 hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onDeleteClick}
            className="text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            data-testid="shift-delete"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
