-- Phase 2.2: pins the scheduling_runs columns added for the agent pipeline
-- and the admin-only RLS posture for the audit table.
--
-- Run with: supabase test db

begin;
select plan(9);

-- New columns exist.
select has_column('public', 'scheduling_runs', 'week_start', 'week_start column added');
select has_column('public', 'scheduling_runs', 'model', 'model column added');
select has_column('public', 'scheduling_runs', 'input_tokens', 'input_tokens column added');
select has_column('public', 'scheduling_runs', 'output_tokens', 'output_tokens column added');
select has_column('public', 'scheduling_runs', 'cache_read_input_tokens', 'cache_read_input_tokens column added');
select has_column('public', 'scheduling_runs', 'cache_creation_input_tokens', 'cache_creation_input_tokens column added');

-- RLS still on after the ALTERs.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduling_runs'::regclass),
  'RLS enabled on scheduling_runs'
);

-- Seed one run so the role checks have something to deny.
insert into public.scheduling_runs (
  id, run_type, agent_version, input_payload, week_start, model
) values (
  '00000000-0000-0000-0000-0000000000bb', 'shift_generation', '2.1.0',
  '{}'::jsonb, '2026-06-01', 'claude-sonnet-4-6'
);

-- anon must not see scheduling_runs (admin-only policy, distinct from shifts).
set local role anon;
select is(
  (select count(*)::int from public.scheduling_runs),
  0,
  'anon cannot read scheduling_runs'
);
reset role;

-- authenticated non-admin (real user, just not flagged is_admin) must also
-- not read — admin only. Seed a non-admin profile + auth.users row first so
-- the JWT sub resolves to a real, non-admin user.
insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-000000000077', 'non-admin@brewboat.local')
  on conflict (id) do nothing;
insert into public.profiles (id, auth_user_id, email, is_admin)
  values ('00000000-0000-0000-0000-000000000077', '00000000-0000-0000-0000-000000000077', 'non-admin@brewboat.local', false)
  on conflict (id) do nothing;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000077';
select is(
  (select count(*)::int from public.scheduling_runs),
  0,
  'non-admin authenticated user cannot read scheduling_runs'
);
reset role;
reset request.jwt.claim.sub;

select * from finish();
rollback;
