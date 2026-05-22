-- Phase 1.5 RLS smoke for xola_events. Parity with rls_xola_experiences /
-- rls_xola_guides / rls_xola_orders.
--
-- Run with: supabase test db

begin;
select plan(4);

select has_table('public', 'xola_events', 'xola_events exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.xola_events'::regclass),
  'RLS enabled on xola_events'
);

-- Pre-insert a row as the privileged test role so anon's read attempt has
-- something to be denied.
insert into public.xola_events (id, seller_id, raw)
values ('test-id', 'test-seller', '{}'::jsonb);

set local role anon;

select is(
  (select count(*) from public.xola_events)::int,
  0,
  'anon cannot read xola_events'
);

select throws_ok(
  $$ insert into public.xola_events (id, seller_id, raw)
     values ('anon-insert', 'test-seller', '{}'::jsonb) $$,
  '42501',
  null,
  'anon insert rejected'
);

select * from finish();
rollback;
