"use client";

import { useActionState, useState } from "react";

import { generateShiftsForWeek, type GenerateShiftsResult } from "@/app/admin/reservations/actions";
import { Button } from "@/components/ui/button";

interface GenerateShiftsFormProps {
  monday: string;
}

// Phase 2.2 UI hook. Posts to the generateShiftsForWeek action; surfaces the
// count on success and the error on failure. No shift render (that's 2.3) —
// the admin can re-pull the page (revalidated by the action) and 2.3 will
// show the rows. The Force checkbox is the explicit gate for re-running on
// a week that already has shifts.
export function GenerateShiftsForm({ monday }: GenerateShiftsFormProps) {
  const [force, setForce] = useState(false);
  const [state, action, pending] = useActionState<GenerateShiftsResult | null, FormData>(
    async (_prev, formData) => generateShiftsForWeek(formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="monday" value={monday} />
      {force && <input type="hidden" name="force" value="1" />}
      <Button type="submit" size="lg" variant="secondary" disabled={pending} data-testid="generate-shifts">
        {pending ? "Generating…" : force ? "Regenerate Shifts" : "Generate Shifts"}
      </Button>
      <label className="flex items-center gap-1 text-xs text-foreground">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
          data-testid="generate-shifts-force"
          aria-label="Force regenerate (overwrites existing shifts for this week)"
        />
        force
      </label>
      {state?.ok && (
        <span className="text-xs text-muted-foreground" data-testid="generate-shifts-result">
          Generated {state.generated ?? 0} shift{state.generated === 1 ? "" : "s"}.
        </span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-destructive" data-testid="generate-shifts-error">
          {state.error ?? "Generation failed."}
        </span>
      )}
    </form>
  );
}
