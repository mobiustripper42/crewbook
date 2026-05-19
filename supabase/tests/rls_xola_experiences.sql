-- Phase 1.2 RLS smoke for xola_experiences. Mirror of rls_smoke.sql.
--
-- Run with: supabase test db

begin;
select plan(3);

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

select * from finish();
rollback;
