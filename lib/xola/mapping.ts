// Phase 1.6: pure mapping layer — orders + events + product_type_lookup → TimeSlot[].
//
// A TimeSlot is the unit shifts and assignments hang off (per CLAUDE.md data
// model). Each Xola event is one slot — multiple orders can share an event
// (party of 6 + party of 4 in the same brewboat window). Mapping is
// deliberately read-side and stateless: re-run any time, no persistence
// needed in V1.
//
// Unknown product names are handled SOFTLY — the slot still appears with
// product_type=null and a warning. Schedule shouldn't break because Drew
// renamed a product in Xola (DEC-108).

import type { XolaEvent } from "./events.ts";
import type { XolaOrder } from "./orders.ts";

export type ProductType = "brewboat" | "captained_duffy" | "duffy_rental";

export type ProductTypeLookup = ReadonlyMap<string, ProductType>;

export interface TimeSlot {
  event_id: string;
  seller_id: string;
  experience_id: string | null;
  // Xola's product name — used for display and as the lookup key.
  product_name: string;
  // null when the lookup has no entry for product_name. See `warnings`.
  product_type: ProductType | null;
  // ISO timestamps from event.start / event.end (passthrough — Xola owns
  // the wall-clock semantics; we don't reinterpret).
  start: string;
  end: string;
  // The boat. Xola exposes capacity-bearing equipment via `resourceUsages`.
  // V1 expects exactly one resource per event (a brewboat IS one boat); we
  // surface the first one and flag any additional ones as a warning so the
  // schedule board can decide what to render.
  boat_resource_id: string | null;
  // Sum of guests across all items pointing at this event (across all
  // orders). Brewboat is sold whole-boat private, so this is "how many
  // people are on board" rather than "how many tickets sold."
  total_guests: number;
  // Distinct order IDs that have at least one item on this event.
  order_count: number;
  // Per-status item count: { "200": 1, "700": 0, ... }. Preserves
  // cancellations so the board can show "1 confirmed, 1 cancelled" rather
  // than silently dropping the cancellation per DEC-115.
  status_breakdown: Record<string, number>;
  warnings: string[];
}

// Pulls Xola order items and groups them by the event they reference.
// One order can have items on different events (multi-item bookings), so
// we walk items individually rather than orders.
export function groupOrderItemsByEvent(
  orders: readonly XolaOrder[],
): Map<string, Array<{ orderId: string; item: Record<string, unknown> }>> {
  const byEvent = new Map<string, Array<{ orderId: string; item: Record<string, unknown> }>>();
  for (const order of orders) {
    const orderId = typeof order.id === "string" ? order.id : "";
    if (!orderId) continue;
    const items = Array.isArray(order.items) ? order.items : [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const event = item.event;
      const eventId =
        event && typeof event === "object" && typeof (event as Record<string, unknown>).id === "string"
          ? ((event as Record<string, unknown>).id as string)
          : null;
      if (!eventId) continue;
      const bucket = byEvent.get(eventId) ?? [];
      bucket.push({ orderId, item });
      byEvent.set(eventId, bucket);
    }
  }
  return byEvent;
}

// Build a single TimeSlot from one event plus the items that point at it.
// itemsForEvent may be empty — an event with no orders is still a slot
// (Xola lets you create events with `reserved=false` slots open).
export function mapEventToSlot(
  event: XolaEvent,
  itemsForEvent: ReadonlyArray<{ orderId: string; item: Record<string, unknown> }>,
  lookup: ProductTypeLookup,
): TimeSlot {
  const warnings: string[] = [];

  // event.title is the canonical product name we map against. event.title
  // and item.name should agree for any given event, but if they don't (e.g.
  // historical rename), event.title wins because it's the slot we're
  // scheduling against.
  const productName = typeof event.title === "string" ? event.title : "";
  if (!productName) {
    warnings.push("event missing title — cannot resolve product_type");
  }
  const productType = productName ? (lookup.get(productName) ?? null) : null;
  if (productName && !productType) {
    warnings.push(`unknown product name "${productName}" — admin must add to product_type_lookup`);
  }

  const start = typeof event.start === "string" ? event.start : "";
  const end = typeof event.end === "string" ? event.end : "";
  if (!start || !end) {
    warnings.push("event missing start/end");
  }

  const seller = event.seller;
  const sellerId =
    seller && typeof seller === "object" && typeof (seller as Record<string, unknown>).id === "string"
      ? ((seller as Record<string, unknown>).id as string)
      : "";

  const experience = event.experience;
  const experienceId =
    experience && typeof experience === "object" && typeof (experience as Record<string, unknown>).id === "string"
      ? ((experience as Record<string, unknown>).id as string)
      : null;

  // Pull the boat. V1 expects exactly one; flag deviations so we notice
  // before a multi-resource event silently picks the wrong one.
  const resourceUsages = Array.isArray(event.resourceUsages) ? event.resourceUsages : [];
  let boatResourceId: string | null = null;
  if (resourceUsages.length > 0) {
    const first = resourceUsages[0];
    if (first && typeof first === "object") {
      const resource = (first as Record<string, unknown>).resource;
      if (resource && typeof resource === "object" && typeof (resource as Record<string, unknown>).id === "string") {
        boatResourceId = (resource as Record<string, unknown>).id as string;
      }
    }
    if (resourceUsages.length > 1) {
      warnings.push(
        `event has ${resourceUsages.length} resourceUsages — V1 assumes one boat per event; using the first`,
      );
    }
  }

  // Sum guests + count per-status across the items on this event.
  let totalGuests = 0;
  const statusBreakdown: Record<string, number> = {};
  const orderIds = new Set<string>();
  for (const { orderId, item } of itemsForEvent) {
    orderIds.add(orderId);
    const guests = Array.isArray(item.guests) ? item.guests : [];
    totalGuests += guests.length;
    const status = item.status;
    const statusKey = typeof status === "number" ? String(status) : "unknown";
    statusBreakdown[statusKey] = (statusBreakdown[statusKey] ?? 0) + 1;
  }

  return {
    event_id: typeof event.id === "string" ? event.id : "",
    seller_id: sellerId,
    experience_id: experienceId,
    product_name: productName,
    product_type: productType,
    start,
    end,
    boat_resource_id: boatResourceId,
    total_guests: totalGuests,
    order_count: orderIds.size,
    status_breakdown: statusBreakdown,
    warnings,
  };
}

// The end-to-end mapping: given a week's worth of events + orders + the
// lookup, produce one TimeSlot per event.
export function mapSlotsForWeek(
  events: readonly XolaEvent[],
  orders: readonly XolaOrder[],
  lookup: ProductTypeLookup,
): TimeSlot[] {
  const grouped = groupOrderItemsByEvent(orders);
  return events.map((event) => {
    const eventId = typeof event.id === "string" ? event.id : "";
    const items = eventId ? (grouped.get(eventId) ?? []) : [];
    return mapEventToSlot(event, items, lookup);
  });
}

// Convenience constructor for code paths that don't want to think about
// readonly Map ceremony.
export function lookupFromEntries(
  entries: ReadonlyArray<readonly [string, ProductType]>,
): ProductTypeLookup {
  return new Map(entries);
}
