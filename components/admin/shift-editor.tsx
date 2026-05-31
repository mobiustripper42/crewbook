"use client";

// Phase 2.4 — interactive shift board. Renders the day-grouped shifts (same
// read surface as 2.3) and adds editing: delete a shift (inline confirm) or
// select 2+ shifts on the same day/boat and merge them into one. Selection +
// pending state live here; the mutations are server actions that revalidate the
// route, so a successful edit re-renders this board with fresh props.

import { useState, useTransition } from "react";

import { deleteShift, mergeShifts } from "@/app/admin/shifts/actions";
import { shortResourceId } from "@/app/admin/reservations/week";
import { Button } from "@/components/ui/button";
import {
  formatDayHeading,
  formatTime,
  shiftRoles,
  type ShiftDayGroup,
  type ShiftRow,
} from "@/lib/shifts/display";

export function ShiftEditor({ groups }: { groups: ShiftDayGroup[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      setError(null);
      const result = await deleteShift(id);
      if (!result.ok) setError(result.error ?? "Delete failed.");
      else {
        setConfirmingDelete(null);
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }

  function onMerge() {
    const ids = [...selected];
    startTransition(async () => {
      setError(null);
      const result = await mergeShifts(ids);
      if (!result.ok) setError(result.error ?? "Merge failed.");
      else setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-xs"
          data-testid="merge-bar"
        >
          <span className="font-medium">{selected.size} selected</span>
          <Button
            type="button"
            size="sm"
            onClick={onMerge}
            disabled={pending || selected.size < 2}
            data-testid="merge-selected"
          >
            {pending ? "Merging…" : `Merge ${selected.size} shifts`}
          </Button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid="shift-edit-error">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5" data-testid="shifts-list">
        {groups.map((group) => (
          <section key={group.date} className="flex flex-col gap-2" data-testid="shift-day-group">
            <h2 className="text-sm font-medium text-foreground" data-testid="shift-day-heading">
              {formatDayHeading(group.date)}{" "}
              <span className="text-xs text-muted-foreground">
                ({group.shifts.length} shift{group.shifts.length === 1 ? "" : "s"})
              </span>
            </h2>
            <ul className="flex flex-col gap-2">
              {group.shifts.map((shift) => (
                <li key={shift.id}>
                  <ShiftCard
                    shift={shift}
                    selected={selected.has(shift.id)}
                    onToggle={() => toggleSelect(shift.id)}
                    confirming={confirmingDelete === shift.id}
                    onDeleteClick={() => setConfirmingDelete(shift.id)}
                    onConfirmDelete={() => onDelete(shift.id)}
                    onCancelDelete={() => setConfirmingDelete(null)}
                    pending={pending}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

interface ShiftCardProps {
  shift: ShiftRow;
  selected: boolean;
  onToggle: () => void;
  confirming: boolean;
  onDeleteClick: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  pending: boolean;
}

function ShiftCard({
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
