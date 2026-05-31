-- Phase 2.2: extend the Phase 0.3 shifts + scheduling_runs tables for the
-- shift-generation agent pipeline.
--
-- The base tables (initial_schema, 2026-05-18) cover admin-entered shifts
-- and a generic audit log. The agent's shifts collapse consecutive booked
-- slots on a boat into one shift (Phase 2.0 rules 1-3), so we extend with:
--
--   shifts.week_start          — the Monday the shift belongs to; anchor for
--                                regenerate-policy (action layer enforces
--                                error-unless-force when a week already has
--                                agent-generated shifts).
--   shifts.boat_resource_id    — the stable Xola resource id (boat_label is
--                                the human label; this is the join key).
--   shifts.roles               — explicit role list for this shift
--                                (["captain", "mate"] for brewboat per
--                                rule 5). Stored even though it's implied
--                                by product_type today, so V2 products with
--                                non-standard role shapes don't need a
--                                code change.
--   shifts.covered_event_ids   — the booked Xola events this shift covers
--                                (one shift can span 1-N events).
--   shifts.scheduling_run_id   — back-ref to the run that produced it, for
--                                audit and bulk-delete-by-run on retry.
--
--   scheduling_runs.week_start                  — per-week audit query.
--   scheduling_runs.model                       — model id used (per DEC-103
--                                                 today: claude-sonnet-4-6).
--   scheduling_runs.input/output_tokens         — cost telemetry deferred
--   scheduling_runs.cache_read/creation_tokens    from 2.1 review.
--
-- Existing agent_version doubles as the prompt version (the 2.1 review
-- flagged "no prompt version constant" — using agent_version covers it).
--
-- Idempotency anchor: unique (week_start, boat_resource_id, start_time)
-- partial index. Lets pre-Phase-2 admin-entered rows (no week_start) coexist
-- without conflicting; the server action enforces the regenerate gate above.
--
-- `if not exists` everywhere so a partial earlier apply (or accidental
-- replay) is harmless. No data backfill — Phase 0 left these tables empty.

alter table public.shifts
  add column if not exists week_start          date,
  add column if not exists boat_resource_id    text,
  add column if not exists roles               jsonb,
  add column if not exists covered_event_ids   text[],
  add column if not exists scheduling_run_id   uuid references public.scheduling_runs(id) on delete restrict;

create unique index if not exists shifts_week_boat_start_uidx
  on public.shifts(week_start, boat_resource_id, start_time)
  where week_start is not null and boat_resource_id is not null;

create index if not exists shifts_week_start_idx
  on public.shifts(week_start) where week_start is not null;

create index if not exists shifts_scheduling_run_id_idx
  on public.shifts(scheduling_run_id) where scheduling_run_id is not null;

alter table public.scheduling_runs
  add column if not exists week_start                  date,
  add column if not exists model                       text,
  add column if not exists input_tokens                integer,
  add column if not exists output_tokens               integer,
  add column if not exists cache_read_input_tokens     integer,
  add column if not exists cache_creation_input_tokens integer;

create index if not exists scheduling_runs_week_start_idx
  on public.scheduling_runs(week_start) where week_start is not null;
