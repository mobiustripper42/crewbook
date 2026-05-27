-- Phase 1.6 RLS smoke for product_type_lookup.
-- Authenticated read, admin write (DEC-113 posture). Anon is denied entirely.
--
-- Run with: supabase test db

begin;
select plan(7);

select has_table('public', 'product_type_lookup', 'product_type_lookup exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.product_type_lookup'::regclass),
  'RLS enabled on product_type_lookup'
);

-- Seeded row from migration should be visible.
select is(
  (select product_type from public.product_type_lookup where xola_name = 'Brewboat Tour - captained'),
  'brewboat',
  'seeded row maps Brewboat Tour - captained → brewboat'
);

-- check constraint guards the three valid types.
select throws_ok(
  $$ insert into public.product_type_lookup (xola_name, product_type)
     values ('Bogus', 'spaceship') $$,
  '23514',
  null,
  'invalid product_type rejected by check constraint'
);

set local role anon;

select is(
  (select count(*) from public.product_type_lookup)::int,
  0,
  'anon cannot read product_type_lookup'
);

select throws_ok(
  $$ insert into public.product_type_lookup (xola_name, product_type)
     values ('anon-insert', 'brewboat') $$,
  '42501',
  null,
  'anon insert rejected'
);

reset role;
set local role authenticated;

-- authenticated user with no admin flag should be able to read but not write.
select throws_ok(
  $$ insert into public.product_type_lookup (xola_name, product_type)
     values ('non-admin', 'brewboat') $$,
  '42501',
  null,
  'non-admin authenticated insert rejected'
);

select * from finish();
rollback;
