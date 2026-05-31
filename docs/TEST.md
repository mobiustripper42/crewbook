# Testing BrewBoat

How to verify a change works. **Kept current** — whenever the test path changes (remote Supabase added, Xola prod cutover, magic-link auth lands), update this file in the same PR that changes it.

---

## Current state (as of 2026-05-27)

- **Local only.** No remote Supabase project exists for BrewBoat yet. Vercel builds succeed but the deployed app can't reach a database — it'll render a Supabase error.
- **Xola sandbox** is the only live external API. Sandbox keys live in `.env.local`; no prod keys until Phase 6.4.
- **Auth** is not built yet. `/admin/*` is publicly reachable until Phase 5.1 ships magic-link + `profiles.is_admin`.

This will change. See "When this changes" at the bottom — update this file at the same time.

---

## What's automated

| Layer | Command | Where it runs |
|------|---------|---------------|
| Unit | `npm run test:unit` | Local. Node `--test` runner against `tests/unit/**/*.test.ts`. |
| pgTAP (RLS) | `supabase test db` | Local. Requires `supabase start` running. |
| Playwright (integration + axe-core a11y) | `npx playwright test` (full) or `npx playwright test tests/foo.spec.ts --project=desktop` (one file, one viewport) | Local. Spins up `npm run dev` automatically. |
| Build | `npm run build` | Local. Vercel runs it again on push (but the deployed app is non-functional today — see above). |
| Typecheck | `npm run typecheck` | Local. |
| Lint | `npm run lint` | Local. |

Per CLAUDE.md: targeted Playwright runs during a task; full suite only when the user asks.

The shift agent's pure surface (prompt assembly, output parsing/validation, grading) is covered by `tests/unit/shift-agent.test.ts` with the model call mocked — no key, no network, runs in CI. The live model behavior is **not** automated; see the agent eval below.

---

## Agent evals (Phase 2+) — live, billed, not in CI

The shift agent's actual output quality is graded against the hand-authored Phase 2.0 answer key:

```
node --experimental-strip-types scripts/eval-shift-agent.ts
```

This makes **one real Sonnet call per run** and costs real API money — it is deliberately outside `npm run test:unit` and CI. It reads `ANTHROPIC_API_KEY` from `.env.local`, maps the `tests/fixtures/shift-agent/week-2026-06-01.json` fixture through `lib/xola/mapping.ts`, runs the agent, and grades against `…expected.json`. Exit 0 = output matches the answer key exactly; non-zero prints the mismatches for prompt tuning. Pass a different fixture slug as the first arg to eval another week.

---

## Manual verification — local

For a UI change or a sanity check that "it actually works."

### One-time setup

1. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — get from `supabase status` after `supabase start`.
   - `XOLA_PLUGIN_KEY` — sandbox plugin user key (the one ping-tested in Phase 0.6 / 1.1).
   - `XOLA_SELLER_ID=69dfbe5744e51dad92085ae5` — BrewBoat sandbox seller.
   - `XOLA_ENV=sandbox` (default) and `NOTIFICATIONS_ENABLED=false`.
   - `ANTHROPIC_API_KEY` — server-side key for the shift/assignment agents (DEC-103). Only needed to run the agent eval below; not required for unit tests, build, or the UI.

2. `supabase start` — boots local Postgres + Studio + Kong in Docker. Only one project's Supabase stack can run on this box at a time; check `docker ps | grep supabase` if `db:start` complains. (See memory `feedback_supabase_single_stack`.)

3. `supabase db reset` — replays all migrations + seed. Run this after pulling new migrations or whenever the schema looks off.

### Daily flow

1. **Is dev already running?** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` — if `200`, skip the start.
2. `npm run dev` if not.
3. Hit `mill-dev:3000` (not `localhost` — Tailscale-routed review devices need the hostname; see memory `feedback_localhost_via_tailscale`).
4. Pages worth knowing:
   - `/` — placeholder home with the dark-mode toggle (`d` key).
   - `/admin/reservations` — Pull Week + reservation table + **Generate Shifts** (Phase 2.2: calls the shift agent, persists to `shifts` + `scheduling_runs`). Default lands on the seeded sandbox week (2026-05-18). `?week=YYYY-MM-DD` snaps to that Monday's week. The Generate Shifts button costs one real Sonnet call per click on a week that has mirrored slots — use a non-seeded week first if you want to exercise the no-slots error path without spend. Regenerate is gated: tick the **force** checkbox to overwrite an existing week's shifts.
5. **Mobile check** — open Chrome DevTools, toggle device toolbar, set to 375px. Most regressions show up here first; Playwright covers the gate but eyeballs catch the rest.

### Data state

The local Supabase mirror has seeded data from the Session 8 sandbox sync:
- `xola_events` — 5 events total, all on the brewboat experience: 1 in the week of 2026-05-18 (the default `/admin/reservations` week — clicking Generate Shifts there yields 1 shift) and 4 on Saturday 2026-06-06 (week of 2026-06-01; use `?week=2026-06-01` to exercise the multi-event path).
- `xola_orders` — 5 orders, one per event, status 200 (confirmed).
- `xola_guides` — 1 guide (Eric Stoffer, `email: null` — gotcha for Phase 1.8).
- `xola_experiences` — 200 rows (mostly sandbox-contamination from other tenants per Session 7; Drew's prod will be ~20).
- `product_type_lookup` — 1 row (`Brewboat Tour - captained` → `brewboat`).
- `shifts` / `scheduling_runs` — empty until you click **Generate Shifts** on a week with mirrored slots. Each click writes one `scheduling_runs` row (success OR failure — audit) plus N `shifts` rows on success. `supabase db reset` wipes them.

Hitting the **Pull Week** button re-syncs the same data idempotently from Xola sandbox. The sandbox currently has zero orders for any seller other than the 5 seeded ones; live volume only materializes when (a) Eric seeds more sandbox data, or (b) Phase 6.4 cuts over to prod Xola.

To re-seed from scratch: `supabase db reset` wipes everything, then re-run a sync via the Pull Week button or the test scripts.

---

## Manual verification — Vercel

**Not useful for BrewBoat today.** Vercel builds succeed but the deployed app errors out on first DB call. Skip until a remote Supabase project exists.

When that lands, this section becomes: "set env vars in Project Settings → Environment Variables; preview URLs are on each PR." Update this file then.

---

## Bug verification — the loop

When a bug is reported:

1. Reproduce it locally first (Section above). If you can't reproduce, ask for the URL the user hit + the browser + the time so logs line up.
2. Write a failing test that pins the bug — Playwright if it's a page-level regression, unit test if it's a pure-function bug, pgTAP if it's an RLS leak.
3. Fix. Test goes green.
4. Per CLAUDE.md: full Playwright suite is the user's call — ask before running it.

---

## When this changes

Update this file (same PR as the change) if any of the below ship:

- **Remote Supabase project** lands → fill in the "Manual verification — Vercel" section; mention which env vars belong in Production vs Preview scope. Per DEC-009, never `supabase link` to a prod ref from this dev box.
- **Phase 6.4 prod Xola cutover** → document the `XOLA_ENV=prod` switch + which env vars need different values; add the read-only-first verification steps.
- **Phase 5.1 magic-link auth** → admin pages will require login; document how to authenticate as the seeded admin (`admin@brewboat.local`) for tests.
- **Staging branch adopted** (DEC-008) → document the `/promote-staging` flow + how previews behave on `staging` vs `main`.
- **`tests/fixtures/` populated** with offline-capable Xola sample data → mention the fixture path so PRs can be tested without a live sandbox key.
- **CI added** (currently CI integration is deferred per Phase 0.7 notes) → list which workflows run on PR and what they gate.

If the test path changes and you don't update this file, future-you will re-derive everything from scratch — that's the loss. The whole point of this doc is "I should be able to read this and not need to remember." Treat it like an OPERATIONS log, not a spec.
