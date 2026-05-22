# Xola Integration

Reference for the Xola App Store plugin that powers BrewBoat Crew Scheduler.
Reads experiences, orders, and guides; writes guide assignments to events.

## URLs

- Sandbox seller dashboard: https://seller.sandbox.xola.app/ (login: eric@stoffer.net)
- Developer console (approve/edit plugin): https://app.sandbox.xola.com/store-console/index.html#user/login?redirect=apps
- API docs: https://developers.xola.com/docs/integrate-with-xola
- Sandbox API base: https://sandbox.xola.com

## Known IDs

| | |
|---|---|
| BrewBoat sandbox seller ID | `69dfbe5744e51dad92085ae5` |
| BrewBoat production seller ID | TBD |
| Plugin name | BrewBoat Crew Scheduler |

## Authentication

The app uses one key: the **plugin user key**, returned in the `user.apiKey` field of the plugin registration response and stored as `$XOLA_PLUGIN_KEY`. It authenticates every data operation across all sellers that have installed the plugin. Production gets its own key at Phase 6.4 cutover.

(For completeness: a separate developer-account key exists in Xola's model and is used once when registering the plugin via `POST /api/plugins`. The app never holds it.)

Every API call requires both headers:

```
X-API-Key: <plugin user key>
X-API-Version: 2021-03-10
```

## "Seller" Terminology

A "seller" in Xola is a tenant/business account, not a salesperson. BrewBoat Cleveland is a seller. The plugin authenticates as itself (one key) and is granted access to specific sellers via the install flow.

## Endpoint Patterns

Most data lives under a seller-scoped path:

```
GET /api/sellers/{seller_id}/guides
GET /api/sellers/{seller_id}/...
```

A few endpoints are not seller-scoped in the URL but still filter to sellers the plugin can see:

```
GET /api/experiences
GET /api/orders
GET /api/events                        (list, seller param REQUIRED)
GET /api/events/{event_id}
POST /api/events/{event_id}/guides     (assign a guide to an event)
```

There is **no** flat `/api/guides`, `/api/users`, or `/api/sellers` endpoint. A 403 or 404 on those paths = wrong URL, not a permissions issue.

## Events endpoint — gotchas

The `/api/events` list endpoint diverges from the rest of Xola in three load-bearing ways. Don't generalize from `/api/orders`.

1. **`seller` is required.** Unlike `/api/orders` where it's optional, `/api/events` returns nothing without it. Source: https://developers.xola.com/reference/list-all-events
2. **Date filter is epoch seconds, not query operators.** Use `?start=<unix-seconds>&end=<unix-seconds>` — the `items.arrival[gte]=...` Xola-query-language shape that works on `/api/orders` does **not** apply here.
3. **`offset` matters.** It shifts the start/end window into the seller's timezone (seconds, like `-14400` for EDT or `-18000` for EST). Omitting it means UTC boundaries — for Cleveland, midnight UTC is 8pm the previous day local, so events on the first/last day of the window are dropped or double-counted. Use a DST-aware helper to compute the offset for the date you're querying.
4. **No `items.status` filter.** Events don't carry order status. For "trips that actually need a captain," use `?reserved=true` (means "has ≥1 reservation," loose — doesn't filter cancellations). For confirmed-only granularity, pull events then fetch `/api/orders?items.event=<id>&items.status[gte]=200&items.status[lt]=300` to know what's actually confirmed.
5. **Pagination is undocumented on this endpoint.** No `limit` / `skip` in the spec; Xola's general pagination doc claims most list endpoints paginate, so probably the orders convention works, but it's not pinned. Worth a smoke test against a busy week to inspect the response wrapper. Confirmed-or-denied → ask Michelle.

Typical BrewBoat events fetch (Cleveland, EDT, June 2026, only reserved):

```
GET /api/events
  ?seller=69dfbe5744e51dad92085ae5
  &start=1748736000        # 2026-06-01 00:00 EDT
  &end=1749340799          # 2026-06-07 23:59 EDT
  &offset=-14400           # EDT
  &reserved=true
```

## For AI agents

Xola publishes an LLM-readable index of its OpenAPI surface at `https://developers.xola.com/llms.txt` (linked from the developer site header). When the JavaScript-rendered docs pages are hard to scrape, that's the canonical source. Don't substitute it for human confirmation of load-bearing endpoint shapes — but it's a good starting point.

## Plugin Permissions (currently configured)

- Administer seller's account
- Create/edit listings
- Create/edit bookings and view the dashboard, rosters and customers
- Assign guides to events
- View all bookings and financial data

**Changing permissions un-approves the plugin.** After any edit, click "Request Approval" in the developer console and wait for Xola staff to re-approve.

## Approval / Install Lifecycle

1. Register plugin via `POST /api/plugins` using the developer key. Response contains `user.apiKey` — that's the plugin user key.
2. Submit for approval in the developer console.
3. Xola staff approve.
4. Seller installs the plugin in their seller dashboard. Xola fires an `installation.create` webhook to the plugin's webhook URL.
5. Plugin key now has access to that seller's data.

If permissions are changed at any point, approval resets and the plugin must be re-submitted.

## Smoke Tests

Verify plugin can see the BrewBoat seller:

```bash
curl -H "X-API-Key: $XOLA_PLUGIN_KEY" \
     -H "X-API-Version: 2021-03-10" \
     https://sandbox.xola.com/api/experiences | jq '[.data[].seller.id] | unique'
```

Expected: list includes `69dfbe5744e51dad92085ae5`.

Fetch BrewBoat guides:

```bash
curl -H "X-API-Key: $XOLA_PLUGIN_KEY" \
     -H "X-API-Version: 2021-03-10" \
     https://sandbox.xola.com/api/sellers/69dfbe5744e51dad92085ae5/guides | jq
```

Expected: at least one guide (Eric Stoffer).

## Xola Contacts

- Michelle Beynon, Director of Implementation — `michelle@xola.com`
- Nemanja, Dev team — Michelle loops him in for technical questions
- OTA Support — `ota-support@xola.com`

For account/approval issues, start with Michelle. For API behavior questions, ask her to loop in Nemanja. Lead with the request, the response, and what was expected — not code.
