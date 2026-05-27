// Phase 1.7 — Admin "Pull Week" page. Read-only view of mirrored Xola
// reservations for one week, with a button to re-sync.
//
// Auth: this surface is admin-only conceptually. Real auth (magic link +
// profiles.is_admin gate) lands in Phase 5.1; until then the page is
// effectively open and reads via the service-role client. Don't link to it
// from public pages, and treat anything sensitive as still un-built.

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  lookupFromEntries,
  mapSlotsForWeek,
  type ProductType,
  type TimeSlot,
} from "@/lib/xola/mapping";
import type { XolaEvent } from "@/lib/xola/events";
import type { XolaOrder } from "@/lib/xola/orders";

import { PullWeekForm } from "@/components/admin/pull-week-form";

import {
  filterSlotsInWeek,
  shortResourceId,
  sortSlotsForDisplay,
  startOfWeek,
  summarizeStatuses,
  weekRange,
} from "./week";

// Default to the seeded sandbox week so the page shows real data on first
// load. Swap to "current week" once prod data flows.
const DEFAULT_MONDAY = "2026-05-18";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

export default async function AdminReservationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const requestedWeek = params.week ?? DEFAULT_MONDAY;
  let monday: string;
  try {
    monday = startOfWeek(requestedWeek);
  } catch {
    monday = startOfWeek(DEFAULT_MONDAY);
  }
  const range = weekRange(monday);
  const showingSeededNote = params.week === undefined;

  const supabase = getSupabaseAdmin();
  const [eventsRes, ordersRes, lookupRes] = await Promise.all([
    supabase.from("xola_events").select("raw"),
    supabase.from("xola_orders").select("raw"),
    supabase.from("product_type_lookup").select("xola_name, product_type"),
  ]);

  const queryErrors: string[] = [];
  if (eventsRes.error) queryErrors.push(`xola_events: ${eventsRes.error.message}`);
  if (ordersRes.error) queryErrors.push(`xola_orders: ${ordersRes.error.message}`);
  if (lookupRes.error) queryErrors.push(`product_type_lookup: ${lookupRes.error.message}`);

  const events: XolaEvent[] = (eventsRes.data ?? []).map((row) => row.raw as unknown as XolaEvent);
  const orders: XolaOrder[] = (ordersRes.data ?? []).map((row) => row.raw as unknown as XolaOrder);
  const lookup = lookupFromEntries(
    (lookupRes.data ?? []).map(
      (row) => [row.xola_name, row.product_type as ProductType] as const,
    ),
  );

  const allSlots = mapSlotsForWeek(events, orders, lookup);
  const slots = sortSlotsForDisplay(filterSlotsInWeek(allSlots, range));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-medium">Reservations</h1>
          <p className="text-xs text-muted-foreground" data-testid="week-range">
            Week of {range.start} → {range.end}{" "}
            {showingSeededNote && (
              <span className="italic">(showing seeded sandbox week)</span>
            )}
          </p>
        </div>
        <PullWeekForm monday={monday} />
      </header>

      <WeekPicker monday={monday} />

      {queryErrors.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <p className="font-medium">Could not load reservation mirror:</p>
          <ul className="mt-1 list-disc pl-4">
            {queryErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {slots.length === 0 ? (
        <EmptyState range={range} />
      ) : (
        <SlotsTable slots={slots} />
      )}
    </main>
  );
}

function WeekPicker({ monday }: { monday: string }) {
  return (
    <form action="/admin/reservations" method="get" className="flex items-center gap-2">
      <label htmlFor="week" className="text-xs text-muted-foreground">
        Week starting:
      </label>
      <input
        id="week"
        name="week"
        type="date"
        defaultValue={monday}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        data-testid="week-input"
      />
      <button
        type="submit"
        className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
      >
        Go
      </button>
    </form>
  );
}

function EmptyState({ range }: { range: { start: string; end: string } }) {
  return (
    <div
      data-testid="empty-state"
      className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground"
    >
      No reservations for week of {range.start} – {range.end}.
      <br />
      Click <span className="font-medium">Pull Week</span> to sync from Xola.
    </div>
  );
}

function SlotsTable({ slots }: { slots: TimeSlot[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-xs" data-testid="slots-table">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Product</th>
            <th className="px-3 py-2 font-medium">Boat</th>
            <th className="px-3 py-2 font-medium">Guests</th>
            <th className="px-3 py-2 font-medium">Orders</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <SlotRow key={slot.event_id} slot={slot} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotRow({ slot }: { slot: TimeSlot }) {
  const date = slot.start ? slot.start.slice(0, 10) : "—";
  const startTime = slot.start ? slot.start.slice(11, 16) : "—";
  const endTime = slot.end ? slot.end.slice(11, 16) : "—";
  const productTypeUnknown = slot.product_name && !slot.product_type;
  return (
    <tr className="border-t border-border/60">
      <td className="px-3 py-2 whitespace-nowrap font-mono">{date}</td>
      <td className="px-3 py-2 whitespace-nowrap font-mono">
        {startTime}–{endTime}
      </td>
      <td className="px-3 py-2">
        <span className={productTypeUnknown ? "italic" : undefined}>
          {slot.product_name || "—"}
        </span>
        {productTypeUnknown && (
          <span
            className="ml-1 text-amber-600 dark:text-amber-400"
            title={slot.warnings.join("\n") || "unknown product type"}
            aria-label="unknown product type"
          >
            ⚠
          </span>
        )}
        {slot.product_type && (
          <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
            {slot.product_type}
          </span>
        )}
      </td>
      <td className="px-3 py-2 font-mono" title={slot.boat_resource_id ?? undefined}>
        {shortResourceId(slot.boat_resource_id)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{slot.total_guests}</td>
      <td className="px-3 py-2 text-right tabular-nums">{slot.order_count}</td>
      <td className="px-3 py-2">{summarizeStatuses(slot.status_breakdown)}</td>
    </tr>
  );
}
