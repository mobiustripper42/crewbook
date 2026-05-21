-- Phase 1.3 RLS smoke for xola_guides. Mirror of rls_xola_experiences.sql.
--
-- Run with: supabase test db

begin;
select plan(4);

select has_table('public', 'xola_guides', 'xola_guides exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.xola_guides'::regclass),
  'RLS enabled on xola_guides'
);

-- Pre-insert a row as the privileged test role so anon's read attempt has
-- something to be denied.
insert into public.xola_guides (id, name, email, seller_id, raw)
values ('test-id', 'Test Guide', 'guide@example.com', 'test-seller', '{}'::jsonb);

set local role anon;

select is(
  (select count(*) from public.xola_guides)::int,
  0,
  'anon cannot read xola_guides'
);

select throws_ok(
  $$ insert into public.xola_guides (id, name, seller_id, raw)
     values ('anon-insert', 'should not stick', 'test-seller', '{}'::jsonb) $$,
  '42501',
  null,
  'anon insert rejected'
);

select * from finish();
rollback;
