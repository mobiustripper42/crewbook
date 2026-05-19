# Xola sandbox approval email — draft

Copy the block below into your mail client. Recipient: `integrations@xola.com`. Adjust the placeholders in `[ ]` before sending.

---

**Subject:** Sandbox API access + seller account request — BrewBoat (crew scheduling for [Drew's brewery-boat company name])

Hi Xola integrations team,

I'm Eric Stoffer, writing on behalf of [Drew's full name / company name], who operates [a brewery-boat charter + Duffy rental business at [marina / city]] using Xola for reservations. We're building an internal crew-scheduling tool ("BrewBoat") that reads reservation data from Xola, generates and assigns weekly shifts to captains, mates, and shore staff, and then writes guide assignments back to Xola events.

To finish that integration we'd like to request:

1. **Sandbox account approval** for `sandbox.xola.com` — we've registered an app and would like the sandbox API key activated so we can develop against representative test data before touching production.
2. **Seller account** linked to the same sandbox so we can create and reserve test experiences end-to-end.
3. **Production access** once sandbox validation is complete — we expect to request the prod API key after we've validated the read + write-back flows end-to-end against sandbox (likely several weeks out).

A few details that may help:

- **Single-tenant, internal-only.** This is a private tool for [Drew's] operation — not a public marketplace or multi-seller product.
- **Endpoints we plan to use:** read — experiences, guides, orders (status 200–299), events; write — assign/remove guide on event, acknowledge (mark order as seen / processed).
- **Write volume:** modest. We write back guide assignments once per week after admin review, plus mid-week adjustments. We expect well under the published rate limits.
- **Data handling:** we mirror Xola orders + events into a private Supabase database to avoid hammering the API and to support offline schedule editing. Xola remains the source of truth — local copies are caches, refreshed on demand.
- **App registration name:** [name you used in the App Store registration form].
- **Primary technical contact:** eric@stoffer.net.
- **Primary operational contact:** [Drew's email].

Happy to share more about the project or jump on a call if helpful. Thanks for your time.

Best,
Eric Stoffer
eric@stoffer.net

---

## Placeholders to fill in

- `[Drew's brewery-boat company name]` — Xola seller name
- `[Drew's full name]`
- `[a brewery-boat charter + Duffy rental business at [marina / city]]` — one-line operation summary
- `[name you used in the App Store registration form]` — match exactly what's in the App Store entry
- `[Drew's email]` — operational contact

## Notes

- Sending from `eric@stoffer.net` is fine — keep Drew CC'd so the thread is visible on his side.
- If they ask for more detail on volumes, the realistic numbers are: ~5–25 reservations/day in season; one full write-back per week (~10–40 assignment writes); occasional re-assignments mid-week. Well below typical API limits.
- Data-handling note now lives in the email body (fourth bullet) so it pre-answers the partnerships-team retention question.
