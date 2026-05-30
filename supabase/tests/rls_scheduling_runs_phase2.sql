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

-- authenticated non-admin (no JWT sub set) must also not read — admin only.
set local role authenticated;
select is(
  (select count(*)::int from public.scheduling_runs),
  0,
  'non-admin authenticated cannot read scheduling_runs'
);
reset role;

select * from finish();
rollback;
