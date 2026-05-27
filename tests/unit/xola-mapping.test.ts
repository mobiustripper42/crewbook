// Run with: npm run test:unit
//
// Covers the Phase 1.6 mapping layer — orders + events + lookup → TimeSlot[].
// Fixtures mirror the real sandbox shape probed during Phase 1.5 to keep the
// mapper honest against actual Xola payloads.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  groupOrderItemsByEvent,
  lookupFromEntries,
  mapEventToSlot,
  mapSlotsForWeek,
} from "../../lib/xola/mapping.ts";
import type { XolaEvent } from "../../lib/xola/events.ts";
import type { XolaOrder } from "../../lib/xola/orders.ts";

const SELLER_ID = "69dfbe5744e51dad92085ae5";
const BREWBOAT_EXP = "6a0f4923822a6545cf0e1cfb";
const BOAT_RESOURCE = "6a0fa498081e494f74080020";

const brewboatLookup = lookupFromEntries([["Brewboat Tour - captained", "brewboat"]]);

function event(id: string, overrides: Partial<XolaEvent> = {}): XolaEvent {
  return {
    id,
    title: "Brewboat Tour - captained",
    start: "2026-05-24T12:00:00+00:00",
    end: "2026-05-24T13:58:59+00:00",
    seller: { id: SELLER_ID },
    experience: { id: BREWBOAT_EXP },
    resourceUsages: [{ count: 1, resource: { id: BOAT_RESOURCE } }],
    ...overrides,
  };
}

function order(id: string, items: Array<Record<string, unknown>>): XolaOrder {
  return { id, items } as XolaOrder;
}

function item(
  eventId: string,
  opts: { status?: number; guestCount?: number; name?: string } = {},
): Record<string, unknown> {
  const guestCount = opts.guestCount ?? 1;
  return {
    id: `item-${eventId}-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name ?? "Brewboat Tour - captained",
    event: { id: eventId },
    experience: { id: BREWBOAT_EXP },
    seller: { id: SELLER_ID },
    status: opts.status ?? 200,
    arrival: "2026-06-06",
    quantity: 1,
    guests: Array.from({ length: guestCount }, (_, i) => ({
      id: `g-${i}`,
      name: `Adults #${i + 1}`,
    })),
  };
}

describe("groupOrderItemsByEvent", () => {
  it("buckets items by event.id and preserves order linkage", () => {
    const orders = [
      order("ord-1", [item("evt-1"), item("evt-2")]),
      order("ord-2", [item("evt-1")]),
    ];
    const grouped = groupOrderItemsByEvent(orders);
    assert.equal(grouped.size, 2);
    const evt1 = grouped.get("evt-1") ?? [];
    assert.equal(evt1.length, 2);
    assert.deepEqual(
      evt1.map((e) => e.orderId).sort(),
      ["ord-1", "ord-2"],
    );
    assert.equal((grouped.get("evt-2") ?? []).length, 1);
  });

  it("skips items missing event.id and orders missing id", () => {
    const orders = [
      order("ord-1", [
        item("evt-1"),
        { id: "noevt", name: "x" }, // no event field
        { name: "noid", event: { id: "evt-9" } }, // item missing id is still grouped (no id constraint)
      ]),
      { items: [item("evt-1")] } as unknown as XolaOrder, // order missing id
    ];
    const grouped = groupOrderItemsByEvent(orders);
    assert.equal((grouped.get("evt-1") ?? []).length, 1);
    assert.equal((grouped.get("evt-9") ?? []).length, 1);
    assert.equal(grouped.has("noevt"), false);
  });

  it("ignores orders with no items array", () => {
    const orders = [{ id: "o", items: null } as unknown as XolaOrder];
    assert.equal(groupOrderItemsByEvent(orders).size, 0);
  });
});

describe("mapEventToSlot — happy path", () => {
  it("builds a TimeSlot from one event + one matching order item", () => {
    const evt = event("evt-1");
    const items = [{ orderId: "ord-1", item: item("evt-1", { guestCount: 2 }) }];
    const slot = mapEventToSlot(evt, items, brewboatLookup);

    assert.equal(slot.event_id, "evt-1");
    assert.equal(slot.product_name, "Brewboat Tour - captained");
    assert.equal(slot.product_type, "brewboat");
    assert.equal(slot.seller_id, SELLER_ID);
    assert.equal(slot.experience_id, BREWBOAT_EXP);
    assert.equal(slot.boat_resource_id, BOAT_RESOURCE);
    assert.equal(slot.total_guests, 2);
    assert.equal(slot.order_count, 1);
    assert.deepEqual(slot.status_breakdown, { "200": 1 });
    assert.deepEqual(slot.warnings, []);
  });

  it("sums guests across multiple orders on the same event", () => {
    const evt = event("evt-1");
    const items = [
      { orderId: "ord-1", item: item("evt-1", { guestCount: 6 }) },
      { orderId: "ord-2", item: item("evt-1", { guestCount: 4 }) },
    ];
    const slot = mapEventToSlot(evt, items, brewboatLookup);
    assert.equal(slot.total_guests, 10);
    assert.equal(slot.order_count, 2);
    assert.deepEqual(slot.status_breakdown, { "200": 2 });
  });

  it("returns a slot with zero guests/orders when no items reference the event", () => {
    const slot = mapEventToSlot(event("evt-open"), [], brewboatLookup);
    assert.equal(slot.total_guests, 0);
    assert.equal(slot.order_count, 0);
    assert.deepEqual(slot.status_breakdown, {});
    assert.deepEqual(slot.warnings, []);
  });
});

describe("mapEventToSlot — soft handling", () => {
  it("unknown product name → product_type null + warning, slot still built", () => {
    const evt = event("evt-x", { title: "Sunset Wine Tour" });
    const slot = mapEventToSlot(evt, [], brewboatLookup);
    assert.equal(slot.product_name, "Sunset Wine Tour");
    assert.equal(slot.product_type, null);
    assert.ok(
      slot.warnings.some((w) => w.includes("Sunset Wine Tour")),
      `expected warning to mention unknown name; got ${JSON.stringify(slot.warnings)}`,
    );
  });

  it("missing event title → null type + 'missing title' warning, no unknown-name warning", () => {
    const evt = event("evt-x", { title: undefined });
    const slot = mapEventToSlot(evt, [], brewboatLookup);
    assert.equal(slot.product_name, "");
    assert.equal(slot.product_type, null);
    assert.ok(
      slot.warnings.some((w) => w.includes("missing title")),
      `expected missing-title warning; got ${JSON.stringify(slot.warnings)}`,
    );
    assert.equal(
      slot.warnings.some((w) => w.includes("unknown product name")),
      false,
      "should not double-flag — missing title is the real cause",
    );
  });

  it("multiple resourceUsages → warning + first wins", () => {
    const evt = event("evt-x", {
      resourceUsages: [
        { count: 1, resource: { id: "boat-A" } },
        { count: 1, resource: { id: "boat-B" } },
      ],
    });
    const slot = mapEventToSlot(evt, [], brewboatLookup);
    assert.equal(slot.boat_resource_id, "boat-A");
    assert.ok(
      slot.warnings.some((w) => w.includes("2 resourceUsages")),
      "expected warning about multiple resourceUsages",
    );
  });

  it("no resourceUsages → boat_resource_id null, no warning", () => {
    const slot = mapEventToSlot(event("evt-x", { resourceUsages: [] }), [], brewboatLookup);
    assert.equal(slot.boat_resource_id, null);
    assert.deepEqual(slot.warnings, []);
  });

  it("cancelled items (status 700) counted in breakdown, not silently dropped", () => {
    const evt = event("evt-1");
    const items = [
      { orderId: "ord-1", item: item("evt-1", { status: 200, guestCount: 4 }) },
      { orderId: "ord-2", item: item("evt-1", { status: 700, guestCount: 2 }) },
    ];
    const slot = mapEventToSlot(evt, items, brewboatLookup);
    assert.deepEqual(slot.status_breakdown, { "200": 1, "700": 1 });
    // total_guests sums everything — cancelled guests are still relevant
    // historical data; the board decides whether to highlight or hide.
    assert.equal(slot.total_guests, 6);
  });
});

describe("mapSlotsForWeek — end-to-end", () => {
  it("multi-item order across two events → one slot per event, correctly attributed", () => {
    const events = [event("evt-1"), event("evt-2")];
    const orders = [
      order("ord-1", [item("evt-1", { guestCount: 3 }), item("evt-2", { guestCount: 5 })]),
    ];
    const slots = mapSlotsForWeek(events, orders, brewboatLookup);
    assert.equal(slots.length, 2);
    const slot1 = slots.find((s) => s.event_id === "evt-1")!;
    const slot2 = slots.find((s) => s.event_id === "evt-2")!;
    assert.equal(slot1.total_guests, 3);
    assert.equal(slot2.total_guests, 5);
    assert.equal(slot1.order_count, 1);
    assert.equal(slot2.order_count, 1);
  });

  it("events with zero matching items still produce slots (open seats)", () => {
    const events = [event("evt-empty")];
    const slots = mapSlotsForWeek(events, [], brewboatLookup);
    assert.equal(slots.length, 1);
    assert.equal(slots[0].order_count, 0);
    assert.equal(slots[0].total_guests, 0);
  });

  it("real sandbox payload shape — single brewboat event with one order resolves cleanly", () => {
    // Captured from xola_events / xola_orders mirror, May 2026 sandbox.
    const evt: XolaEvent = {
      id: "6a0fae84d7b4d5cbe95393b4",
      title: "Brewboat Tour - captained",
      start: "2026-05-24T12:00:00+00:00",
      end: "2026-05-24T13:58:59+00:00",
      seller: { id: SELLER_ID },
      experience: { id: BREWBOAT_EXP },
      quantity: { reserved: 1, confirmed: 1 },
      resourceUsages: [{ count: 1, resource: { id: BOAT_RESOURCE } }],
    };
    const ord: XolaOrder = {
      id: "6a0fae7170b5fb3ee10acf7c",
      items: [
        {
          id: "item-1",
          name: "Brewboat Tour - captained",
          event: { id: "6a0fae84d7b4d5cbe95393b4" },
          experience: { id: BREWBOAT_EXP },
          seller: { id: SELLER_ID },
          status: 200,
          arrival: "2026-05-24",
          quantity: 1,
          guests: [{ id: "g1", name: "Adults #1" }],
        },
      ],
    } as XolaOrder;
    const [slot] = mapSlotsForWeek([evt], [ord], brewboatLookup);
    assert.equal(slot.product_type, "brewboat");
    assert.equal(slot.total_guests, 1);
    assert.equal(slot.order_count, 1);
    assert.equal(slot.boat_resource_id, BOAT_RESOURCE);
    assert.deepEqual(slot.warnings, []);
  });
});
