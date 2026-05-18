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

-- shifts — generated per-week by the shift agent; admin reviews/edits before posting
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
  updated_at     timestamptz not null default now()
);

create index shifts_shift_date_idx on public.shifts(shift_date);
create index shifts_status_idx     on public.shifts(status);

-- assignments — staff × shift. role distinguishes captain / mate / shore (DEC-107).
-- Unique (shift_id, role) means one captain per brewboat, one mate per brewboat.
-- May need to relax for multi-shore-staff days in Phase 3.
create table public.assignments (
  id          uuid        primary key default gen_random_uuid(),
  shift_id    uuid        not null references public.shifts(id)   on delete cascade,
  profile_id  uuid        not null references public.profiles(id) on delete restrict,
  role        text        not null check (role in ('captain', 'mate', 'shore')),
  status      text        not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shift_id, role)
);

create index assignments_profile_id_idx on public.assignments(profile_id);
create index assignments_shift_id_idx   on public.assignments(shift_id);

-- scheduling_runs — audit log for every agent call.
-- Records input + output + version so any run can be replayed for debugging.
create table public.scheduling_runs (
  id              uuid        primary key default gen_random_uuid(),
  run_type        text        not null check (run_type in ('shift_generation', 'assignment')),
  agent_version   text        not null,
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
