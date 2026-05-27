-- Phase 1.8: decouple profile identity from auth.users + add Xola guide xref (DEC-116).
--
-- Why now: Phases 2-4 need crew profile rows BEFORE Phase 5.1 magic-link
-- auth ships. Under the old model (profiles.id references auth.users(id)
-- on delete cascade), creating a profile required an existing auth.users
-- row. Decoupling lets Drew populate the staff cross-reference table
-- (Phase 1.8) and run the assignment agent (Phase 3) against profiles
-- that don't yet have auth — 5.1 fills auth_user_id on first sign-in.
--
-- Critical invariant: public.is_admin() now matches by auth_user_id, NOT
-- by id. A wrong rewrite locks every admin out of every admin-gated RLS
-- policy. Pinned by pgTAP.

-- Step 1: add auth_user_id, backfill from existing id, drop the
-- profiles.id → auth.users.id FK constraint.
alter table public.profiles
  add column auth_user_id uuid unique references auth.users(id) on delete set null;

update public.profiles set auth_user_id = id where auth_user_id is null;

-- The constraint name follows Postgres's default (table_column_fkey).
-- Drop it explicitly rather than relying on identifier discovery — the
-- migration must be reproducible against a fresh `db reset`.
alter table public.profiles drop constraint profiles_id_fkey;

-- New profiles created from here on get a fresh standalone id. Existing
-- rows keep their old (auth.users-shaped) id values — they're now just
-- bytes; nothing references auth.users through this column anymore.
alter table public.profiles alter column id set default gen_random_uuid();

-- Step 2: add xola_guide_id link.
-- One-to-one for V1 single-seller (DEC-114). Nullable because a profile
-- can exist before being linked to a Xola guide (and vice versa). Set
-- on_delete to `set null` so deleting the Xola mirror row (which
-- shouldn't happen, but) doesn't cascade-delete the profile.
alter table public.profiles
  add column xola_guide_id text unique references public.xola_guides(id) on delete set null;

-- Step 3: rewrite is_admin() to use the new identity column.
-- Function signature/return type unchanged; only the WHERE clause moves.
-- Every admin-gated RLS policy on profiles/shifts/assignments/scheduling_runs
-- + the new product_type_lookup table calls into this function — getting
-- the rewrite right is load-bearing for the entire app.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = auth.uid()
      and is_admin = true
  );
$$;

-- Step 4: lookup index for the new admin path. The pre-DEC-116 index
-- (profiles_is_admin_idx) is still useful (filters admin-true rows); add
-- a partial index on auth_user_id so the is_admin() WHERE clause has a
-- fast path even with hundreds of profiles.
create index profiles_auth_user_id_idx on public.profiles(auth_user_id)
  where auth_user_id is not null;
