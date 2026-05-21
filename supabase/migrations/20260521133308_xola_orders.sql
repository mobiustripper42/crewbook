-- Phase 1.4: local mirror of Xola orders (reservations).
--
-- Orders are the source-of-truth booking records — a customer party reserving
-- a brewboat / duffy / shore activity for a date. Per DEC-115, the mirror
-- captures confirmed + cancelled orders (items.status in {200,201,202,203}
-- ∪ {700}); pending/hold statuses are excluded at fetch time as carrying no
-- scheduling signal.
--
-- Schema is deliberately minimal: id + seller_id + raw + synced_at. The
-- per-item status and items.arrival values live in `raw` and stay there
-- through 1.4; Phase 1.6 (orders → events mapping) is where items get
-- unpacked into the event grain, and that's where denormalized columns
-- (arrival window, status summary) make sense to add — once query patterns
-- are real, not speculative.
--
-- Multi-item orders: a Xola order can carry multiple items on different
-- dates, each with its own status. We store the whole order; downstream
-- code in 1.6 splits items into events. See DEC-115 multi-item gotcha.

create table public.xola_orders (
  -- Xola's object id (mongo-style hex). Source of truth, used for upsert idempotency.
  id          text        primary key,
  seller_id   text        not null,
  -- Full Xola order payload — items[], customer, payment, etc. Future
  -- denormalization in 1.6 reads from here; storing raw avoids re-fetching
  -- when schema needs evolve.
  raw         jsonb       not null,
  synced_at   timestamptz not null default now()
);

alter table public.xola_orders enable row level security;

-- No policies yet. Service-role bypasses RLS; admin-readable policy lands
-- when Phase 5 admin UI needs it. Anon is denied by default (no policy).
