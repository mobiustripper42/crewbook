"use client";

// Phase 2.4 — interactive shift board. Renders the day-grouped shifts (same
// read surface as 2.3) and adds editing: delete a shift (inline confirm) or
// select 2+ shifts on the same day/boat and merge them into one. Selection +
// pending state live here; the mutations are server actions that revalidate the
// route, so a successful edit re-renders this board with fresh props.

import { useState, useTransition } from "react";

import { deleteShift, mergeShifts } from "@/app/admin/shifts/actions";
import { Button } from "@/components/ui/button";
import { ShiftCard } from "@/components/admin/shift-card";
import { formatDayHeading, type ShiftDayGroup } from "@/lib/shifts/display";

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
