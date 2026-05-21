-- Phase 1.3: local mirror of Xola guides (crew known to Xola).
--
-- Guides are people Xola can assign to events — the same population we want
-- to schedule. We mirror them locally so Phase 1.8 can seed the
-- staff cross-reference (xola_guide_id ↔ profiles.id) without re-hitting
-- Xola every time. seller_id is denormalized on each row because guide
-- listings are seller-scoped per DEC-114 (/api/sellers/{seller_id}/guides);
-- preserving it lets a future V2 multi-seller world filter without a
-- separate installations table.

create table public.xola_guides (
  -- Xola's object id (mongo-style hex). Source of truth, used for upsert idempotency.
  id          text        primary key,
  name        text        not null,
  email       text,
  seller_id   text        not null,
  -- Full Xola payload. Future-proofs against fields we don't model yet
  -- (avatar, roles, etc.) — Phase 1.8 staff xref can read raw without
  -- another migration.
  raw         jsonb       not null,
  synced_at   timestamptz not null default now()
);

alter table public.xola_guides enable row level security;

-- No policies yet. Service-role bypasses RLS; admin-readable policy lands
-- when Phase 5 admin UI needs it. Anon is denied by default (no policy).
