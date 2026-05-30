// Phase 2.2: pure builders that turn agent output into rows for the
// shifts + scheduling_runs tables.
//
// Kept pure (no Supabase client, no I/O) so the action layer composes them
// and the test path covers conversion correctness without a DB.

import type { GeneratedShift } from "../agents/shift-agent-prompt.ts";
import type { ShiftAgentUsage } from "../agents/shift-agent.ts";
import type { Database } from "../supabase/types.ts";

export type ShiftInsert = Database["public"]["Tables"]["shifts"]["Insert"];
export type SchedulingRunInsert = Database["public"]["Tables"]["scheduling_runs"]["Insert"];

// Regenerate gate — admin must opt in to overwriting an existing week's
// agent-generated shifts. 2.4 will add per-shift edit protection; 2.2's gate
// is "did the week run before? if so, require force=true."
export interface RegenerateGateInput {
  existingCount: number;
  force: boolean;
}
export interface RegenerateGateResult {
  proceed: boolean;
  errorMessage?: string;
}
export function shouldRegenerate({ existingCount, force }: RegenerateGateInput): RegenerateGateResult {
  if (existingCount === 0) return { proceed: true };
  if (force) return { proceed: true };
  return {
    proceed: false,
    errorMessage: `${existingCount} shift${existingCount === 1 ? "" : "s"} already exist for this week. Check the force box and try again to regenerate (this will delete the existing shifts).`,
  };
}

// Parse "2026-06-01T11:00:00-04:00" → { date: "2026-06-01", time: "11:00:00" }.
// The ISO must carry an explicit `±HH:MM` offset — we treat the wall-clock
// date and time as-is, and a `Z` suffix or a naive ISO without an offset would
// silently land at the wrong wall-clock time. Reject both loudly instead.
function splitLocalIso(iso: string): { date: string; time: string } {
  const tMatch = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})[-+]\d{2}:\d{2}$/);
  if (!tMatch) {
    throw new Error(
      `shift persist: cannot parse local datetime "${iso}" — expected "YYYY-MM-DDTHH:MM:SS±HH:MM" (UTC "Z" or naive ISO not accepted)`,
    );
  }
  return { date: tMatch[1], time: tMatch[2] };
}

export interface BuildShiftRowOptions {
  weekStart: string;
  schedulingRunId: string;
}

export function buildShiftRow(shift: GeneratedShift, opts: BuildShiftRowOptions): ShiftInsert {
  const start = splitLocalIso(shift.start);
  const end = splitLocalIso(shift.end);
  return {
    week_start: opts.weekStart,
    shift_date: start.date,
    start_time: start.time,
    end_time: end.time,
    product_type: shift.product_type,
    boat_resource_id: shift.boat_resource_id,
    roles: shift.roles,
    covered_event_ids: shift.covered_event_ids,
    scheduling_run_id: opts.schedulingRunId,
    status: "draft",
  };
}

export interface BuildRunRowOptions {
  weekStart: string;
  model: string;
  promptVersion: string;
  input: unknown;
  output?: unknown;
  usage?: ShiftAgentUsage;
  error?: string;
  triggeredBy?: string | null;
}

export function buildRunRow(opts: BuildRunRowOptions): SchedulingRunInsert {
  return {
    run_type: "shift_generation",
    agent_version: opts.promptVersion,
    week_start: opts.weekStart,
    model: opts.model,
    input_payload: opts.input as SchedulingRunInsert["input_payload"],
    output_payload: (opts.output ?? null) as SchedulingRunInsert["output_payload"],
    error: opts.error ?? null,
    input_tokens: opts.usage?.input_tokens ?? null,
    output_tokens: opts.usage?.output_tokens ?? null,
    cache_read_input_tokens: opts.usage?.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: opts.usage?.cache_creation_input_tokens ?? null,
    triggered_by: opts.triggeredBy ?? null,
  };
}
