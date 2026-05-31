-- Phase 2.2: pins the shifts columns + idempotency anchor added for the
-- agent pipeline. Base shifts shape + RLS posture are covered by rls_smoke;
-- this file covers what 2.2 introduced.
--
-- Run with: supabase test db

begin;
select plan(10);

-- New columns exist with the right types.
select has_column('public', 'shifts', 'week_start', 'week_start column added');
select col_type_is('public', 'shifts', 'week_start', 'date', 'week_start is date');

select has_column('public', 'shifts', 'boat_resource_id', 'boat_resource_id column added');
select has_column('public', 'shifts', 'roles', 'roles column added');
select col_type_is('public', 'shifts', 'roles', 'jsonb', 'roles is jsonb');

select has_column('public', 'shifts', 'covered_event_ids', 'covered_event_ids column added');
select col_type_is('public', 'shifts', 'covered_event_ids', 'text[]', 'covered_event_ids is text[]');

select has_column('public', 'shifts', 'scheduling_run_id', 'scheduling_run_id column added');

-- Partial unique idempotency anchor on (week_start, boat_resource_id, start_time).
-- Two agent-generated rows for the same boat at the same time in the same
-- week are rejected; the action layer enforces the regenerate gate above this.
insert into public.scheduling_runs (
  id, run_type, agent_version, input_payload, week_start, model
) values (
  '00000000-0000-0000-0000-0000000000aa', 'shift_generation', '2.1.0',
  '{}'::jsonb, '2026-06-01', 'claude-sonnet-4-6'
);

insert into public.shifts (
  shift_date, start_time, end_time, product_type,
  week_start, boat_resource_id, roles, covered_event_ids, scheduling_run_id
) values (
  '2026-06-01', '11:00', '17:00', 'brewboat',
  '2026-06-01', 'boatA', '["captain","mate"]'::jsonb, '{e1,e2,e3}',
  '00000000-0000-0000-0000-0000000000aa'
);

select throws_ok(
  $$ insert into public.shifts (
       shift_date, start_time, end_time, product_type,
       week_start, boat_resource_id, roles, covered_event_ids, scheduling_run_id
     ) values (
       '2026-06-01', '11:00', '15:00', 'brewboat',
       '2026-06-01', 'boatA', '["captain","mate"]'::jsonb, '{e9}',
       '00000000-0000-0000-0000-0000000000aa'
     ) $$,
  '23505',
  null,
  'duplicate (week_start, boat_resource_id, start_time) rejected by partial unique index'
);

-- Pre-existing admin-entered rows (week_start null) are not covered by the
-- partial unique — multiple null-week rows for the same boat+time are allowed.
insert into public.shifts (shift_date, start_time, end_time, product_type) values
  ('2026-06-02', '11:00', '13:00', 'brewboat'),
  ('2026-06-02', '11:00', '13:00', 'brewboat');
select is(
  (select count(*)::int from public.shifts where week_start is null),
  2,
  'null-week rows are not constrained by the partial unique'
);

select * from finish();
rollback;
