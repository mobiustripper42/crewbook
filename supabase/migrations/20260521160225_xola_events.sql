-- Phase 1.5: local mirror of Xola events (time slots).
--
-- An event is a specific instance of an experience at a specific time —
-- "Brewboat Tour, Saturday 2pm on Boat A". Shifts derive from events
-- (per CLAUDE.md data model), not directly from orders, because multiple
-- orders can fill one event (party of 6 + party of 4 share a brewboat).
--
-- Same minimal-schema discipline as xola_orders / xola_guides: id,
-- seller_id, raw, synced_at. Denormalization (start_at, end_at,
-- experience_id, reserved-seat count) is a Phase 1.6 concern when the
-- orders → events mapping needs concrete columns to query against.

create table public.xola_events (
  -- Xola's object id (mongo-style hex). Source of truth, used for upsert idempotency.
  id          text        primary key,
  seller_id   text        not null,
  -- Full Xola event payload: experience reference, start/end timestamps,
  -- seat counts, reservation summary, etc. Phase 1.6 unpacks these into
  -- the event grain for shift generation.
  raw         jsonb       not null,
  synced_at   timestamptz not null default now()
);

alter table public.xola_events enable row level security;

-- No policies yet. Service-role bypasses RLS; admin-readable policy lands
-- when Phase 5 admin UI needs it. Anon is denied by default (no policy).
