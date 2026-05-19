-- Phase 1.2: local mirror of Xola experiences.
--
-- Experiences are the catalog of tours/products Xola offers (e.g. "BLUE ICE
-- JETBOATING ~ Twentymile Glacier Lake"). They're stable — Drew doesn't add
-- new ones often — so we cache the full list locally and refresh on demand
-- via lib/xola/experiences.ts to avoid hammering the API.
--
-- The product_type_lookup table (DEC-108) will reference these experience
-- names to map Xola's 19 product names to our 3 internal types
-- (brewboat / captained_duffy / duffy_rental). That mapping lands in 1.6.

create table public.xola_experiences (
  -- Xola's object id (mongo-style hex string). Source of truth — we use
  -- Xola's id as the PK so upserts on resync are idempotent.
  id          text        primary key,
  name        text        not null,
  description text,
  -- Full Xola payload. Future-proofs against fields we don't model yet
  -- (price tiers, schedule, media, etc.) — Phase 1.6 mapping can read raw
  -- without another migration.
  raw         jsonb       not null,
  synced_at   timestamptz not null default now()
);

create index xola_experiences_synced_at_idx on public.xola_experiences(synced_at desc);

alter table public.xola_experiences enable row level security;

-- No policies yet. Service-role bypasses RLS; admin-readable policy lands
-- when Phase 5 admin UI needs it. Anon is denied by default (no policy).
