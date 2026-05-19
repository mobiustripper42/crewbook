-- Phase 1.2 RLS smoke for xola_experiences. Mirror of rls_smoke.sql.
--
-- Run with: supabase test db

begin;
select plan(4);

select has_table('public', 'xola_experiences', 'xola_experiences exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.xola_experiences'::regclass),
  'RLS enabled on xola_experiences'
);

-- Pre-insert a row as the privileged test role so anon's read attempt has
-- something to be denied. Service-role bypasses RLS via the JS client; here
-- we're just confirming anon role can't see anything regardless.
insert into public.xola_experiences (id, name, raw)
values ('test-id', 'Test Experience', '{}'::jsonb);

set local role anon;

select is(
  (select count(*) from public.xola_experiences)::int,
  0,
  'anon cannot read xola_experiences'
);

-- INSERT under RLS-with-no-policy raises 42501 (insufficient_privilege)
-- because the WITH CHECK has no policy that can pass.
-- UPDATE/DELETE under RLS-with-no-policy silently affect zero rows (the
-- USING filter returns no rows to operate on; that's not a permission
-- error). The SELECT-returns-0 assertion above already covers that anon
-- can't even *see* the rows it would try to mutate, which is the meaningful
-- guarantee; an extra UPDATE/DELETE assertion would just re-test the
-- USING filter.
select throws_ok(
  $$ insert into public.xola_experiences (id, name, raw)
     values ('anon-insert', 'should not stick', '{}'::jsonb) $$,
  '42501',
  null,
  'anon insert rejected'
);

select * from finish();
rollback;
