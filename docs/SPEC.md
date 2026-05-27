# BrewBoat — Product Specification

> ⚠️ This is a v0 draft (2026-05-13). Review + revision is task 0.01 in `PROJECT_PLAN.md`.

## Overview

BrewBoat is a crew-scheduling tool for a small brewery-boat operation. It reads reservations from Xola, uses Claude agents to generate weekly shifts and propose crew assignments, lets the admin (Drew) review and adjust on a schedule board, and writes assignments back to Xola as guide assignments. Phase 5 adds a mobile-first staff self-select view — crew claims open shifts from their phone at the dock.

It exists because the current process is a spreadsheet + group text, and that doesn't scale to a full season.

## Philosophy

BrewBoat keeps the season running. It does the boring scheduling math so the admin can spend Saturday morning running the boats instead of pasting names into a spreadsheet. The app should feel like a competent crew member — quiet, accurate, gets out of the way. Not a corporate SaaS, not a beer brand.

The agent makes the first pass. The admin always has the final say.

## Target Launch

- **V1 target:** Season 2026 (May start)
- **V1 critical path:** End-to-end admin flow — pull a Xola week → agent generates shifts → admin reviews → agent assigns crew → admin adjusts → push assignments back to Xola. All from one admin surface, against real 2026 reservation data. (Phases 0–4 = MVP per DEC-106.)

## Stack

- **Frontend:** Next.js 16 (App Router) + React 19, Tailwind CSS v4, shadcn/ui (Base UI primitives, `base-mira` preset, `mist` base), Raleway sans / Geist Mono via `next/font/google`. Light + Dark via `next-themes` (`defaultTheme="system"`).
- **Backend:** Supabase (PostgreSQL + Auth + Row Level Security) — no separate API server (DEC-001)
- **Agents:** Anthropic Claude Sonnet — shift generation (Phase 2) and staff assignment (Phase 3)
- **Booking integration:** Xola REST API (DEC-102, DEC-111)
- **Notifications:** Resend (email) — magic links (DEC-104), shift-posted alerts. No SMS / no Twilio.
- **Hosting:** Vercel (frontend), Supabase Cloud (database)
- **Dev Environment:** Local Supabase via Docker
- **Testing:** pgTAP (RLS), Playwright (integration), axe-core (accessibility)

## Roles

- **Admin** — manages staff roster, reviews generated shifts, approves the week, pushes to Xola. Drew is the operational admin.
- **Captain** — runs a brewboat or captained duffy. Captain's license required; per-boat qualification.
- **Mate** — assists the captain on a brewboat. No captain's license required.
- **Shore Staff** — handles duffy rentals from the dock. No boat operation.

Multi-role staff are common (a captain who also works shore). Roles are boolean flags on `profiles`, not mutually exclusive (DEC-003).

## Core Concepts

- **Shift** — a captain/mate/shore role on a specific boat or dock position, at a specific time slot, on a specific date. Derived from Xola events (DEC-102). Multiple Xola orders can fill one shift (party of 6 + party of 4 in the same brewboat).
- **Assignment** — a staff member × shift × role binding. Has a status (draft / approved / written-back-to-Xola).
- **Product type** — internal classification (`brewboat` / `captained_duffy` / `duffy_rental`) determining required crew. Xola product names map to these via an admin-editable lookup table (DEC-108). Today the live set is one product (`Brewboat Tour - captained` → `brewboat`); the table accommodates growth without code changes.
- **Scheduling run** — one agent invocation. Stores inputs, outputs, prompt version. Enables replay and debugging when the agent gets something wrong.
- **Week** — the unit of scheduling. Admin pulls a week, generates shifts, assigns crew, pushes to Xola — all keyed on the week.

## V1 Scope

V1 = Phases 0–6. MVP = Phases 0–4 (DEC-106).

### Phase 0 — Infrastructure
Repo, Supabase project, Vercel deploy, Xola sandbox account + app registration, Playwright + axe-core setup, seeded docs, shadcn theme locked.

### Phase 1 — Xola Connector (Read)
Pull experiences, guides, orders, events from Xola. Map orders → events → boats → time slots. Admin "Pull Week" button shows raw reservation data. Staff cross-reference seeded from Xola guides.

### Phase 2 — Shift Generation Agent
Reservations → shifts pipeline. System prompt + few-shot examples from 2024–2025 sample data. Shift review UI: admin scans, splits/merges/deletes as needed. Validated against known 2025 weeks.

### Phase 3 — Staff Assignment Agent
Admin enters staff availability per week. Agent assigns crew against hard constraints (license, overlap, availability) and soft constraints (equity, continuity). Schedule board UI is the centerpiece: boats × days, color-coded. Admin can override any assignment and approve the week.

### Phase 4 — Xola Write-Back
Bulk-write approved assignments to Xola as guide assignments. Per-assignment status (written / failed / skipped). Schedule board still works if write-back fails — admin can copy by hand (DEC-112).

### Phase 5 — Staff Self-Select (Mobile-Only)
Magic-link auth (DEC-104). Crew sees shifts they qualify for on their phone, claims with one tap. Staff self-entered availability replaces the admin grid. Claiming cutoff + gap-fill agent picks up unclaimed shifts. Email notifications on shift-posted and shift-assigned events. **No desktop layout** (DEC-110).

### Phase 6 — Polish & Ship
Error handling sweep, loading states, mid-week change handling (re-pull diff), prod Xola API key + first real write-back, walkthrough with Drew, bug fixes.

## Not V1

Explicitly out of scope. This list is the scope guardrail — check it before adding anything.

- **SMS notifications.** Email only via Resend. No Twilio. (Crew checks email; SMS adds vendor cost and PII surface.)
- **Payment processing.** Xola handles all guest payments. BrewBoat doesn't touch money.
- **Replacing Xola.** Xola stays as the booking system. We build on top (DEC-102).
- **Multi-tenant.** Single brewery operation. Don't generalize.
- **Custom domain.** Defer until staff actually need it. `*.vercel.app` is fine for V1.
- **Public self-signup.** Admin invites; crew clicks magic link. No registration form.
- **Desktop layout for Phase 5.** Crew is on phones at the dock (DEC-110).
- **Real-time multi-admin editing.** Single admin (Drew) does scheduling. If a second admin shows up, revisit.
- **Payroll / hours-worked reporting.** BrewBoat schedules. Payroll is downstream.
- **Custom agent fine-tuning.** Prompts + few-shots only. If quality plateaus, revisit before tuning work.
- **Phase 5 entirely.** If behind schedule, MVP (Phases 0–4) ships and Phase 5 defers. (Cuttable Tasks list in `PROJECT_PLAN.md`.)
