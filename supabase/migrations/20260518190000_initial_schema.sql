-- Initial schema for BrewBoat (Phase 0.3).
--
-- Tables: profiles, shifts, assignments, scheduling_runs.
-- Other tables in the core data model (xola_orders, xola_events,
-- product_type_lookup, availability) land in later phases when their
-- consumers are built (xola_* in Phase 1, availability in Phase 3.1).
--
-- DEC-003: single profiles table for all roles, boolean flags.
-- DEC-107: three roles — captain / mate / shore.
-- DEC-108: product type lookup deferred to Phase 1.

-- profiles — extends auth.users with crew-specific fields
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  email        text        not null unique,
  full_name    text,
  is_admin     boolean     not null default false,
  is_captain   boolean     not null default false,
  is_mate      boolean     not null default false,
  is_shore     boolean     not null default false,
  boat_quals   jsonb       not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_is_admin_idx on public.profiles(is_admin) where is_admin = true;

-- shifts — generated per-week by the shift agent; admin reviews/edits before posting.
-- shift_date + start_time + end_time is a deliberate split (not timestamptz) because
-- shifts are scheduled in local time and the date is the operational unit. The
-- `end_time > start_time` check is a hard assumption — BrewBoat shifts don't cross
-- midnight; if a sunset cruise ever ends past 00:00, the schema needs to change to
-- timestamptz columns or a tstzrange before that shift can be saved.
create table public.shifts (
  id             uuid        primary key default gen_random_uuid(),
  shift_date     date        not null,
  start_time     time        not null,
  end_time       time        not null,
  product_type   text        not null check (product_type in ('brewboat', 'captained_duffy', 'duffy_rental')),
  boat_label     text,
  status         text        not null default 'draft' check (status in ('draft', 'approved', 'pushed')),
  xola_event_id  text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time > start_time)
);

create index shifts_shift_date_idx on public.shifts(shift_date);
create index shifts_status_idx     on public.shifts(status);

-- assignments — staff × shift. role distinguishes captain / mate / shore (DEC-107).
--
-- Invariants enforced:
--   1. No double-booking the same person on the same shift: unique(shift_id, profile_id).
--   2. Exactly one captain per shift (brewboat + captained_duffy): partial unique.
--   3. Exactly one mate per brewboat shift: partial unique.
--   4. Shore staff can be multiple per shift (a Saturday with 4 duffy rentals can
--      need 2–3 shore staff) — intentionally no unique constraint on (shift_id, 'shore').
--
-- profile_id ON DELETE RESTRICT: deleting a profile fails if they have any
-- assignment row. Soft-delete via an `archived_at` column on profiles is the
-- planned cleanup path (Phase 1.8 / Phase 5 territory).
create table public.assignments (
  id          uuid        primary key default gen_random_uuid(),
  shift_id    uuid        not null references public.shifts(id)   on delete cascade,
  profile_id  uuid        not null references public.profiles(id) on delete restrict,
  role        text        not null check (role in ('captain', 'mate', 'shore')),
  status      text        not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shift_id, profile_id)
);

create index assignments_profile_id_idx on public.assignments(profile_id);
create index assignments_shift_id_idx   on public.assignments(shift_id);

create unique index assignments_one_captain_per_shift on public.assignments(shift_id) where role = 'captain';
create unique index assignments_one_mate_per_shift    on public.assignments(shift_id) where role = 'mate';

-- scheduling_runs — audit log for every agent call.
-- Records input + output + version so any run can be replayed for debugging.
-- triggered_by records the admin who kicked the run off (null for system-scheduled
-- runs like the Phase 5.6 claiming-cutoff gap-fill).
create table public.scheduling_runs (
  id              uuid        primary key default gen_random_uuid(),
  run_type        text        not null check (run_type in ('shift_generation', 'assignment')),
  agent_version   text        not null,
  triggered_by    uuid        references auth.users(id) on delete set null,
  input_payload   jsonb       not null,
  output_payload  jsonb,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);

create index scheduling_runs_run_type_idx   on public.scheduling_runs(run_type);
create index scheduling_runs_started_at_idx on public.scheduling_runs(started_at desc);

-- updated_at trigger function — single function reused by all tables that need it
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at    before update on public.profiles    for each row execute function public.set_updated_at();
create trigger shifts_updated_at      before update on public.shifts      for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();
