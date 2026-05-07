# BrewBoat Crew Scheduler — Project Plan

**Target:** Season 2026 (May start)
**Today:** April 12, 2026
**Developer:** Spink (solo, CC-assisted)
**Estimation Scale:** Fibonacci (2, 3, 5, 8, 13)
**Estimation Method:** Planning poker (Spink + Claude, April 12 2026)

---

## Velocity Baseline

From Sailbook V1 (51.75 hrs across 68 effort points):
- **Lifetime avg:** 0.76 hrs/pt
- **Implementation phases (3+4):** ~0.22 hrs/pt
- **Polish phase (5):** ~0.47 hrs/pt

BrewBoat has an external API dependency Sailbook didn't — expect implementation velocity closer to 0.35–0.50 hrs/pt until we have real data.

**Working assumption:** 0.40 hrs/pt for planning. Adjust after Phase 1.

---

## Phase 0: Project Setup

Repo, stack, Supabase project, deploy pipeline, Xola dev account. No custom code yet — just bones.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 0.1 | Create GitHub repo, init Next.js 14+ App Router, Tailwind + shadcn/ui + Geist | 3 | | Merged — same pattern as Sailbook |
| 0.3 | Create Supabase project, apply initial schema | 2 | | Staff, shifts, assignments, scheduling_runs |
| 0.4 | Vercel deploy, env vars (no custom domain yet) | 2 | | Domain later if staff needs it |
| 0.5 | Write CLAUDE.md, AGENTS.md, DECISIONS.md (seed) | 3 | | Port from Sailbook + adapt for Xola |
| 0.6 | Xola sandbox: dev account, register app, request approval + seller account | 2 | | **Start day one** — human approval has latency |
| 0.7 | Playwright setup + test infrastructure | 3 | | Test coverage baked into task estimates going forward |

**Phase 0 total: 15 pts** → ~6 hrs at 0.40

---

## Phase 1: Xola Connector — Read

Pull reservation data from Xola. Read-only. Use 2025 production data for validation.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 1.1 | Xola API client module (auth, base HTTP, error handling, retry) | 5 | | First external API in the stack — budget for auth quirks |
| 1.2 | Pull experiences (list all, cache locally) | 2 | | One GET, store results |
| 1.3 | Pull guides (list all crew in Xola) | 2 | | One GET, store results |
| 1.4 | Pull orders for date range (confirmed only, paginated) | 3 | | Filter status 200-299, handle pagination |
| 1.5 | Pull events for date range | 3 | | Events = time slots, needed for write-back |
| 1.6 | Map orders → events → boats → time slots | 5 | | Configurable product name lookup (19 distinct names across seasons) |
| 1.7 | Admin page: "Pull Week" button + display raw reservation data | 3 | | Table: date, boat, time, guest count, status |
| 1.8 | Seed staff cross-reference table from Xola guides | 5 | | Admin UI: list guides, assign role (captain/mate/shore), boat qualifications. Data entry needs to be clean — you'll use this all season. |

**Phase 1 total: 28 pts** → ~11.2 hrs at 0.40

**Demo:** Admin clicks "Pull Week of May 18" → sees all confirmed reservations in a table, mapped to boats and time slots. Staff roster populated from Xola guides with roles assigned.

---

## Phase 2: Shift Generation Agent

The brain — reservations go in, shifts come out.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 2.1 | Shift generation agent: prompt design + structured JSON output | 5 | | System prompt with business rules, few-shot examples from sample data. THIS is the product. |
| 2.2 | Reservation → shift pipeline (call agent, parse output, store) | 3 | | Orchestration: pull → agent → validate → persist |
| 2.3 | Shift review UI: list generated shifts for a week | 5 | | Needs real UX — scannable, groupable by day. You'll verify this closely before pushing. |
| 2.4 | Shift editing: admin can split/merge/delete shifts before posting | 5 | | Where "the agent got it wrong" gets fixed |
| 2.5 | Validate agent output against 2025 data | 3 | | Run against known weeks, compare to reality. 2 years of actual data available. |

**Phase 2 total: 21 pts** → ~8.4 hrs at 0.40

**Demo:** Pull a week of 2025 data → agent generates shifts → admin reviews shift list, recognizes the pattern matches reality.

---

## Phase 3: Staff Assignment Agent

Take shifts + availability + constraints → produce a complete crew schedule.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 3.1 | Availability grid: admin enters staff availability per week | 5 | | Day × time range per staff member. Weekly data entry — needs to be fast. |
| 3.2 | Assignment agent: prompt design + structured output | 5 | | Hard constraints (license, overlap, availability) + soft (equity, continuity) |
| 3.3 | Assignment pipeline: feed shifts + availability + roster → get assignments | 3 | | Same plumbing pattern as 2.2 |
| 3.4 | Schedule board UI: week view, boats × days, color-coded status | 8 | | Centerpiece admin view. The screen Drew sees. Worth the investment. |
| 3.5 | Assignment override: admin can reassign any shift manually | 3 | | Dropdown swap on schedule board |
| 3.6 | Approval flow: admin approves full week or individual shifts | 3 | | Status: draft → approved → written back |

**Phase 3 total: 27 pts** → ~10.8 hrs at 0.40

**Demo:** Admin sees the full week on a board. Shifts are color-coded. Agent filled everything. Admin swaps one captain, approves the week.

---

## Phase 4: Xola Write-Back

Push approved assignments back to Xola as guide assignments.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 4.1 | Write-back module: assign guide to event via Xola API | 3 | | POST per event per guide. Idempotent. |
| 4.2 | Bulk write-back: process all approved assignments for a week | 3 | | Progress indicator, partial failure recovery |
| 4.3 | Write-back status tracking + audit log | 2 | | Per-assignment: written/failed/skipped |
| 4.4 | Test write-back against Xola sandbox with non-live data | 5 | | First time pushing data INTO Xola. Moment of truth. |

**Phase 4 total: 13 pts** → ~5.2 hrs at 0.40

**Demo:** Admin approves week → clicks "Push to Xola" → progress bar → "22 assignments written, 0 failed" → open Xola, guides are assigned.

**Note:** If write-back fails, the schedule board still works. Admin can enter assignments by hand using the board as reference. Write-back is automation gravy.

---

## Phase 5: Staff Self-Select

The stretch goal that becomes the real product. **Mobile-first, no desktop layout.** Crew is on phones at the dock.

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 5.1 | Staff auth: magic links (Resend), invite flow | 8 | | No passwords. Admin sends invite, crew clicks link. Auth is always bigger than it looks. |
| 5.2 | Available shifts view: mobile-first, filtered by role + qualifications | 5 | | Crew sees what they can claim on their Pixel |
| 5.3 | Claim flow: tap to claim, real-time removal from pool | 3 | | Optimistic UI, DB constraint prevents double-claim |
| 5.4 | My shifts view: what I've claimed this week | 2 | | Simple list — check on the drive to the dock |
| 5.5 | Availability self-entry: staff sets own availability | 5 | | Replaces admin-entered grid from 3.1 |
| 5.6 | Claiming cutoff + gap-fill agent trigger | 3 | | After cutoff, auto-run assignment agent on unclaimed shifts |
| 5.7 | Notifications: email when shifts posted, when assigned | 5 | | First time standing up Resend — domain config, templates, triggers |

**Phase 5 total: 31 pts** → ~12.4 hrs at 0.40

**Demo:** Crew gets email "Shifts posted for May 18 week." Opens on phone. Sees 3 shifts they qualify for. Claims Saturday morning. It disappears for everyone else. Wednesday night, gap-fill agent assigns remaining shifts. Admin approves Thursday morning. Xola updated by lunch.

---

## Phase 6: Polish & Ship

| ID | Task | Effort | Status | Notes |
|----|------|--------|--------|-------|
| 6.1 | Error handling sweep: all API calls, all agent calls | 3 | | What happens when Xola is down or agent returns garbage |
| 6.2 | Loading states + optimistic UI | 3 | | Schedule board, claiming flow, write-back progress |
| 6.3 | Mid-week change handling (new reservations, cancellations) | 5 | | Daily re-pull, diff, flag affected shifts |
| 6.4 | Production Xola API key + first real write-back | 5 | | Switch to prod. First time touching live data. |
| 6.5 | End-to-end walkthrough with Drew | 3 | | Pull real week, generate, assign, approve, write back |
| 6.6 | Bug fixes from walkthrough | 5 | | Always more than you think |
| 6.7 | Seed data + dev page (Sailbook pattern) | 2 | | Fixed UUIDs, test accounts, quick reference |

**Phase 6 total: 26 pts** → ~10.4 hrs at 0.40

---

## Summary

| Phase | Points | Est. Hours | Actual Hours | Hrs/Pt | Status |
|-------|--------|------------|--------------|--------|--------|
| 0 — Setup | 15 | 6.0 | — | — | Not started |
| 1 — Xola Read | 28 | 11.2 | — | — | Not started |
| 2 — Shift Agent | 21 | 8.4 | — | — | Not started |
| 3 — Assignment | 27 | 10.8 | — | — | Not started |
| 4 — Write-Back | 13 | 5.2 | — | — | Not started |
| 5 — Self-Select | 31 | 12.4 | — | — | Not started |
| 6 — Polish | 26 | 10.4 | — | — | Not started |
| **Total** | **161** | **~64.4** | — | — | — |

**MVP (Phases 0–4): 104 pts, ~42 hrs**
**Full (Phases 0–6): 161 pts, ~64 hrs**
At 2–3 productive hours/day: **MVP in ~2–3 weeks, full in ~4–5 weeks.**

---

## Ship Strategy

**Ship MVP first.** Use it for a few weeks of real scheduling. Validate the shift generation agent against reality. Then build Phase 5 once you trust the foundation.

Phase 5 (self-select) is the product Drew wants to sell, but Phases 0–4 are the product *you* need to run the season.

---

## Estimation Poker — Standing Disagreements

*No unresolved disagreements. All estimates converged during April 12 poker session.*

---

## Velocity Tracker

Updated after each session. See velocity calculator artifact for projections.

| Session | Date | Phase | Task(s) | Points | Hours | Hrs/Pt | Cumulative Avg |
|---------|------|-------|---------|--------|-------|--------|----------------|
| — | — | — | — | — | — | — | — |

---

## Cuttable Tasks (if behind)

In order of what hurts least to defer:

1. **5.7** — Notifications. Crew can check the app manually for season one.
2. **5.5** — Availability self-entry. Admin enters it (3.1 covers this).
3. **5.6** — Claiming cutoff + gap-fill. Run the agent manually.
4. **6.3** — Mid-week changes. Handle manually in Xola.
5. **6.7** — Seed data + dev page. Nice to have, not essential.
6. **Phase 5 entirely** — if truly tight, MVP (Phases 0–4) is the floor.

---

## Key Decisions

| ID | Decision | Status |
|----|----------|--------|
| DEC-001 | Supabase for DB (same as Sailbook) | Decided |
| DEC-002 | Xola stays as booking system, we build on top | Decided |
| DEC-003 | Anthropic API for agents (Claude Sonnet) | Decided |
| DEC-004 | Magic links for staff auth (no passwords) | Decided |
| DEC-005 | Fibonacci estimation scale (2, 3, 5, 8, 13) | Decided |
| DEC-006 | MVP = Phases 0–4, staff self-select = Phase 5 | Decided |
| DEC-007 | Three product types: brewboat (capt+mate), captained duffy (capt), duffy rental (shore staff) | Decided |
| DEC-008 | Product name → type mapping is configurable lookup, not hardcoded | Decided |
| DEC-009 | Playwright testing — setup in Phase 0, coverage baked into task estimates | Decided |
| DEC-010 | Phase 5 is mobile-first only, no desktop layout | Decided |
| DEC-011 | Xola App Store registration required — start day one, human approval has latency | Decided |
| DEC-012 | Write-back is gravy — schedule board works without it, admin can enter by hand | Decided |

---

## Xola Integration Notes

- **Sandbox:** `sandbox.xola.com` — all development and testing here first
- **Production:** `xola.com` — only after sandbox validation
- **App Store:** Must register app and get approved before API key works ([docs](https://developers.xola.com/docs/integrate-with-xola))
- **Contact:** `integrations@xola.com` for approval + seller account
- **Product names change between seasons** — 19 distinct names across 2024–2025. Mapper must be configurable.
- **Sample data:** `xola-sample-data.json` — 5 representative weeks extracted from 2024–2025 exports
- **Guide assignments:** API supports assign/remove/acknowledge per event — full round-trip confirmed
