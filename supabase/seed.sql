-- Seed data for local dev (`supabase db reset` replays this).
--
-- One admin profile so the local app can sign in as someone with write
-- permissions. The `auth.users` row is also inserted because profiles.id
-- references it; Supabase Auth normally creates this on signup, but for
-- local dev we want a stable UUID + email/password ready to go.
--
-- DO NOT COMMIT real production passwords or emails. This file is
-- replayed every `db reset` — treat it as throwaway dev data only.

-- Stable admin user for local dev: admin@brewboat.local / brewboat-dev
-- Password hash is bcrypt('brewboat-dev') — Supabase will accept it as-is.
insert into auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  role,
  aud,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'admin@brewboat.local',
  crypt('brewboat-dev', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, is_admin)
values (
  '00000000-0000-0000-0000-000000000001',
  'admin@brewboat.local',
  'Local Admin',
  true
)
on conflict (id) do nothing;
