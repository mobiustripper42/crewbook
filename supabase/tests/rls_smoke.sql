-- Phase 0.7 smoke: confirm RLS is on for every Phase 0.3 table and that the
-- anon role can't read any of them. Wider RLS coverage (per-policy, per-role,
-- per-table) lands as each feature touches a table.
--
-- Run with: supabase test db

begin;
select plan(9);

-- All four Phase 0.3 tables must have RLS enabled.
select has_table('public', 'profiles', 'profiles exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS enabled on profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.shifts'::regclass),
  'RLS enabled on shifts'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.assignments'::regclass),
  'RLS enabled on assignments'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduling_runs'::regclass),
  'RLS enabled on scheduling_runs'
);

-- As anon, every table should return zero rows. The seed inserts an admin into
-- profiles, so a missing anon-deny would surface as count > 0 here.
set local role anon;

select is(
  (select count(*) from public.profiles)::int,
  0,
  'anon cannot read profiles'
);
select is(
  (select count(*) from public.shifts)::int,
  0,
  'anon cannot read shifts'
);
select is(
  (select count(*) from public.assignments)::int,
  0,
  'anon cannot read assignments'
);
select is(
  (select count(*) from public.scheduling_runs)::int,
  0,
  'anon cannot read scheduling_runs'
);

select * from finish();
rollback;
