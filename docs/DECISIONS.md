# BrewBoat Crew Scheduler — Architectural Decisions

Decisions are numbered. Two namespaces:

- **DEC-001..099** — workflow/architectural conventions inherited from the seeds template. These describe *how* we build (stack, auth model, routing).
- **DEC-101..199** — product decisions specific to BrewBoat. These describe *what* we build and why.

"DEC-TBD" means flagged but unresolved — consult @architect before building.

---

## Workflow / Architectural Conventions

### DEC-001: Supabase-direct instead of Express API
**Decision:** No separate backend server. Next.js talks directly to Supabase via server actions and server components.
**Why:** The Express layer is ~40% of the build and is entirely CRUD plumbing. Supabase Auth + Row Level Security replaces JWT middleware and role checks. Eliminates backend hosting costs. For single-tenant CRUD apps, the API layer adds cost with no benefit.
**Tradeoff:** Business logic lives in Postgres RLS policies and database functions. Migration away from Supabase is more involved later.
**Note:** Xola integration (DEC-102) needs server-side calls — those go in server actions / route handlers, not a separate API server.
**Revisit if:** Business logic becomes complex enough to warrant a dedicated API layer, or if the number of webhook/integration endpoints exceeds 3–4.

### DEC-002: Next.js 14+ App Router
**Decision:** Next.js with App Router over bare React or Pages Router.
**Why:** File-based routing, Vercel zero-config deployment, SSR available if needed. React's own docs recommend a framework.
**Tradeoff:** App Router is newer — some patterns are less settled than Pages Router.

### DEC-003: Single profiles table (all roles)
**Decision:** One `profiles` table for all user types, extending Supabase Auth. Role flags as boolean columns (`is_admin`, `is_captain`, `is_mate`, `is_shore`).
**Why:** All roles share the same auth flow. Boolean flags support multi-role staff (a captain who also works shore is common). Simplifies queries and RLS.
**Tradeoff:** Some role-specific nullable fields on users that don't need them.

### DEC-004: shadcn/ui component library
**Decision:** shadcn/ui on top of Tailwind CSS.
**Why:** Components are copied into the repo (not a dependency) — fully customizable. Covers forms, tables, dialogs. Claude Code knows it well.

---

## Product Decisions (BrewBoat)

These are recorded compactly per the project plan (April 12, 2026 planning poker). Expand individual entries with Why / Tradeoff / Revisit-if as the project surfaces non-obvious reasoning.

### DEC-101: Supabase for DB
**Decision:** Same as Sailbook V1.
**Status:** Decided 2026-04-12.

### DEC-102: Xola stays as booking system, we build on top
**Decision:** Reservations originate in Xola; BrewBoat reads from and writes back to Xola via API. Do not replace Xola.
**Status:** Decided 2026-04-12.
**See:** Xola Integration Notes (PROJECT_PLAN.md, end of file).

### DEC-103: Anthropic API for agents
**Decision:** Claude Sonnet for shift-generation and assignment agents.
**Status:** Decided 2026-04-12.

### DEC-104: Magic links for staff auth (no passwords)
**Decision:** Resend-delivered magic links. Admin invites; crew clicks.
**Status:** Decided 2026-04-12.
**See:** Phase 5.1 (PROJECT_PLAN.md).

### DEC-105: Fibonacci estimation scale
**Decision:** 2, 3, 5, 8, 13. No 1s, avoid 13s.
**Status:** Decided 2026-04-12.
**See:** docs/VELOCITY_AND_POKER_GUIDE.md.

### DEC-106: MVP scope = Phases 0–4; staff self-select = Phase 5
**Decision:** Ship Phases 0–4 as the working tool. Phase 5 is the saleable product, built on top.
**Status:** Decided 2026-04-12.

### DEC-107: Three product types
**Decision:** brewboat (captain + mate), captained duffy (captain), duffy rental (shore staff).
**Status:** Decided 2026-04-12.

### DEC-108: Product name → type mapping is configurable
**Decision:** Lookup table, not hardcoded enum. 19 distinct product names across 2024–2025 seasons.
**Status:** Decided 2026-04-12.

### DEC-109: Playwright testing — coverage baked into task estimates
**Decision:** Setup in Phase 0 (task 0.7). Each subsequent task's estimate includes its test coverage.
**Status:** Decided 2026-04-12.

### DEC-110: Phase 5 is mobile-first only
**Decision:** No desktop layout for the staff self-select UI. Crew is on phones at the dock.
**Status:** Decided 2026-04-12.

### DEC-111: Xola App Store registration required
**Decision:** Register and request approval on day one. Human approval has latency.
**Status:** Decided 2026-04-12.
**See:** Phase 0.6 (PROJECT_PLAN.md).

### DEC-112: Write-back is gravy
**Decision:** Schedule board works without Xola write-back; admin can copy assignments by hand if write-back fails or is delayed.
**Status:** Decided 2026-04-12.

---

## DEC-TBD: [Decision placeholder]
**Question:** [What needs to be decided]
**Options:** [Option A vs Option B]
**Consult @architect before building.**
