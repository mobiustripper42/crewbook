-- Phase 1.8 / DEC-116: profile identity decoupled from auth.users.
-- Pins the load-bearing invariants — wrong is_admin() rewrite would lock
-- every admin out of every RLS policy.
--
-- Run with: supabase test db

begin;
select plan(11);

-- Column shape: new auth_user_id + xola_guide_id exist with the right types.
select has_column('public', 'profiles', 'auth_user_id', 'auth_user_id column added');
select col_type_is('public', 'profiles', 'auth_user_id', 'uuid',
  'auth_user_id is uuid');
select col_is_unique('public', 'profiles', 'auth_user_id',
  'auth_user_id is unique');

select has_column('public', 'profiles', 'xola_guide_id', 'xola_guide_id column added');
select col_type_is('public', 'profiles', 'xola_guide_id', 'text',
  'xola_guide_id is text');
select col_is_unique('public', 'profiles', 'xola_guide_id',
  'xola_guide_id is unique');

-- The seeded admin's auth_user_id must equal its id (backfilled).
select is(
  (select auth_user_id from public.profiles where email = 'admin@brewboat.local'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'seeded admin auth_user_id backfilled from id'
);

-- is_admin() must still return true for the seeded admin under their auth.uid().
-- Set the JWT claim sub to the admin's auth.users id; is_admin() reads auth.uid().
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is(
  public.is_admin(),
  true,
  'is_admin() returns true for seeded admin under their auth.uid()'
);

-- is_admin() returns false for an unknown auth.uid().
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000099';
select is(
  public.is_admin(),
  false,
  'is_admin() returns false for an unknown auth.uid()'
);
reset request.jwt.claim.sub;

-- New profile rows can be inserted WITHOUT an auth.users row (the DEC-116
-- whole point) — auth_user_id stays null until Phase 5.1 magic-link.
insert into public.profiles (id, email, full_name, is_admin, auth_user_id)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'pre-auth@example.com',
        'Crew with no auth yet', false, null);
select is(
  (select auth_user_id from public.profiles where email = 'pre-auth@example.com'),
  null::uuid,
  'profile with null auth_user_id is allowed'
);

-- xola_guide_id FK on_delete is `set null` — deleting the guide doesn't
-- delete the profile. Use an existing guide id if one's been synced;
-- otherwise insert a throwaway guide for the test.
insert into public.xola_guides (id, seller_id, name, raw)
values ('test-guide-1', 'test-seller', 'Test Guide', '{}'::jsonb)
on conflict (id) do nothing;
update public.profiles
  set xola_guide_id = 'test-guide-1'
  where email = 'pre-auth@example.com';
delete from public.xola_guides where id = 'test-guide-1';
select is(
  (select xola_guide_id from public.profiles where email = 'pre-auth@example.com'),
  null::text,
  'deleting xola_guide nulls the xref column (on delete set null)'
);

select * from finish();
rollback;
