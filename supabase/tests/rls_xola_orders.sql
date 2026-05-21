-- Phase 1.4 RLS smoke for xola_orders. Parity with rls_xola_experiences /
-- rls_xola_guides.
--
-- Run with: supabase test db

begin;
select plan(4);

select has_table('public', 'xola_orders', 'xola_orders exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.xola_orders'::regclass),
  'RLS enabled on xola_orders'
);

-- Pre-insert a row as the privileged test role so anon's read attempt has
-- something to be denied.
insert into public.xola_orders (id, seller_id, raw)
values ('test-id', 'test-seller', '{}'::jsonb);

set local role anon;

select is(
  (select count(*) from public.xola_orders)::int,
  0,
  'anon cannot read xola_orders'
);

select throws_ok(
  $$ insert into public.xola_orders (id, seller_id, raw)
     values ('anon-insert', 'test-seller', '{}'::jsonb) $$,
  '42501',
  null,
  'anon insert rejected'
);

select * from finish();
rollback;
