-- Phase 1.6: configurable mapping from Xola product names → internal product types (DEC-108).
--
-- Three internal types per DEC-107:
--   - brewboat        (captain + mate)
--   - captained_duffy (captain)
--   - duffy_rental    (shore staff)
--
-- The table is keyed by the exact Xola product name (event.title /
-- order.items[].name). Names are admin-editable rather than a hardcoded enum
-- because Xola lets the seller rename products at will, and renames don't
-- propagate retroactively to existing events — so a season change could
-- introduce a new label like "Brewboat Tour — captained (2027)".
--
-- The "many product names" DEC-108 mentioned originally turned out to be
-- mostly defunct historical products in Xola; the live set is small.
-- Today: one row. Mapping handles unknown names softly — the slot still
-- shows up with a null product_type and a warning, so the schedule never
-- breaks on a rename.

create table public.product_type_lookup (
  xola_name    text        primary key,
  product_type text        not null check (product_type in ('brewboat', 'captained_duffy', 'duffy_rental')),
  updated_at   timestamptz not null default now()
);

alter table public.product_type_lookup enable row level security;

-- Authenticated users read (mapper runs under the caller's role).
-- Admin-only write — same posture as profiles/shifts/assignments per DEC-113.
create policy product_type_lookup_read_authenticated
  on public.product_type_lookup for select
  to authenticated
  using (true);

create policy product_type_lookup_insert_admin
  on public.product_type_lookup for insert
  to authenticated
  with check (public.is_admin());

create policy product_type_lookup_update_admin
  on public.product_type_lookup for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy product_type_lookup_delete_admin
  on public.product_type_lookup for delete
  to authenticated
  using (public.is_admin());

-- Seed the one currently-active product. Additional names land via the
-- admin UI (Phase 1.7-adjacent) or direct SQL once prod data shows them.
insert into public.product_type_lookup (xola_name, product_type) values
  ('Brewboat Tour - captained', 'brewboat')
on conflict (xola_name) do nothing;
