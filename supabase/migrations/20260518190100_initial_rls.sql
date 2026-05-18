-- Initial RLS policies for BrewBoat (Phase 0.3).
--
-- Posture per DEC-113 (Session 4, 2026-05-18):
--   - profiles, shifts, assignments — authenticated users can read all rows;
--     only admins can insert/update/delete.
--   - scheduling_runs — admin only for everything.
--
-- The "loose authenticated read" baseline is deliberate. BrewBoat is low-stakes
-- scheduling data; the schedule board is shared operational information.
-- Phase 5.1 will add a policy letting staff UPDATE their own assignments
-- (claim a shift); that's required regardless of the initial posture.

-- Helper: stable, security-definer check for the current user's admin flag.
-- Used in every admin-gated policy below so the EXISTS subquery isn't repeated.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  );
$$;

-- =========================================================================
-- profiles
-- =========================================================================

alter table public.profiles enable row level security;

create policy profiles_read_authenticated
  on public.profiles for select
  to authenticated
  using (true);

create policy profiles_insert_admin
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_delete_admin
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- =========================================================================
-- shifts
-- =========================================================================

alter table public.shifts enable row level security;

create policy shifts_read_authenticated
  on public.shifts for select
  to authenticated
  using (true);

create policy shifts_insert_admin
  on public.shifts for insert
  to authenticated
  with check (public.is_admin());

create policy shifts_update_admin
  on public.shifts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy shifts_delete_admin
  on public.shifts for delete
  to authenticated
  using (public.is_admin());

-- =========================================================================
-- assignments
-- =========================================================================

alter table public.assignments enable row level security;

create policy assignments_read_authenticated
  on public.assignments for select
  to authenticated
  using (true);

create policy assignments_insert_admin
  on public.assignments for insert
  to authenticated
  with check (public.is_admin());

create policy assignments_update_admin
  on public.assignments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy assignments_delete_admin
  on public.assignments for delete
  to authenticated
  using (public.is_admin());

-- =========================================================================
-- scheduling_runs — admin only for everything (read + write)
-- =========================================================================

alter table public.scheduling_runs enable row level security;

create policy scheduling_runs_all_admin
  on public.scheduling_runs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
