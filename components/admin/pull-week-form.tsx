"use client";

import { useActionState } from "react";

import { pullWeek, type PullWeekResult } from "@/app/admin/reservations/actions";
import { Button } from "@/components/ui/button";

interface PullWeekFormProps {
  monday: string;
}

// Tiny client wrapper so we can surface the action's result inline (event +
// order counts on success, error on failure). The form posts to the existing
// server action; the page revalidates inside the action.
export function PullWeekForm({ monday }: PullWeekFormProps) {
  const [state, action, pending] = useActionState<PullWeekResult | null, FormData>(
    async (_prev, formData) => pullWeek(formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="monday" value={monday} />
      <Button type="submit" size="lg" disabled={pending} data-testid="pull-week">
        {pending ? "Pulling…" : "Pull Week"}
      </Button>
      {state?.ok && (
        <span className="text-xs text-muted-foreground" data-testid="pull-week-result">
          Synced {state.events ?? 0} event{state.events === 1 ? "" : "s"} /{" "}
          {state.orders ?? 0} order{state.orders === 1 ? "" : "s"}.
        </span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-destructive" data-testid="pull-week-error">
          {state.error ?? "Sync failed."}
        </span>
      )}
    </form>
  );
}
