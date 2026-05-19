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

### DEC-005: Branch model — task/* branches + PR flow
**Decision:** All work happens on `task/*` (or platform-cut `claude/*`) branches. `/its-alive` starts on the working branch, `/kill-this` opens a PR, `/its-dead` finalizes the session log on the same branch, then the user merges with `gh pr merge <N> --merge --delete-branch`. No commits land directly on `main`.
**Why:** PR merge is the natural forcing function — work isn't done until the PR merges, which guarantees push state. Branch protection on `main` enforces it. The CC platform's auto-cut `claude/<slug>` branches mean PR-flow is already the default in this environment.
**Tradeoff:** Slightly more ceremony per task. Worth it for the push guarantee and consistency.
**Note:** The prior "always on main while solo" convention is scoped to unprotected working branches only.

### DEC-007: Project semver — `package.json` + git tag, three triggers
**Decision:** SemVer (`MAJOR.MINOR.PATCH`) lives in `package.json` and mirrors to a git tag (`vX.Y.Z`) on `main`. Three triggers move it:
- **Patch:** `/its-dead` on every PR merge. CHANGELOG entry derived from PR title.
- **Minor:** `/retro` on phase close. CHANGELOG entry summarizes the phase.
- **Major:** manual `/bump-major`. User supplies the rationale.

Tags only ever apply on `main`. In staging-flow projects (DEC-008), bumps on `staging` are untagged; the tag lands when `/promote-staging` ff-merges to `main`.
**Detection:** presence of `package.json` at the repo root. Repos without it (template/markdown-only projects) no-op silently.
**Bump tool:** `npm version <patch|minor|major> --no-git-tag-version` mutates `package.json` in place — the flag is critical because we control tagging ourselves so each release gets exactly one tag.
**`<VersionTag />` template:** `dev/claude/templates/VersionTag.tsx` in seeds reads `process.env.NEXT_PUBLIC_APP_VERSION` + `process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` at build time and renders `v1.2.3 (a1b2c3)`. The `NEXT_PUBLIC_` prefix is required for client-bundle inlining. Wired into login screen + footer per project.
**Why:** Vercel-displayed version on the login screen is the highest-priority surface — without it, "what's deployed?" is unanswerable. Tying patch to PR merges and minor to phase close means version movement matches work cadence with no extra ceremony.

### DEC-008: Staging promotion via ff-merge, not PR
**Decision:** When a project has a `staging` branch, `/kill-this` PRs into `staging` (not `main`). Promotion to `main` happens via `/promote-staging` — fast-forward-merges `staging` into `main`, tags the release with the version currently in `package.json`, and pushes both branches plus the tag. No PR opens for the staging→main step.
**Detection:** `git show-ref --verify --quiet refs/remotes/origin/staging` returns 0. Adopting staging mid-project: cut `staging` from `main` and push — all skills detect automatically.
**Why:** Solo dev — there's no second reviewer for the staging→main promotion, so a PR adds ceremony without signal. The work was already reviewed when each task PR landed in `staging`. Fast-forward keeps history linear.
**Tradeoff:** No GitHub UI moment to inspect the promotion before it ships. The Vercel deploy hook on `main` is still the deploy moment.

### DEC-009: Supabase prod-write guard — discipline + wrapper script
**Decision:** Two-layer defense against destructive Supabase CLI ops landing on production:
- **Discipline:** never `supabase link` to a prod project ref from a dev box. Production reads its `SUPABASE_URL` + service-role key from Vercel env vars; there is no reason for a local link to prod.
- **Wrapper script:** `scripts/safe-supabase.sh` reads the linked ref from `supabase/.temp/project-ref` and a per-project prod-ref allowlist from `.claude/prod-supabase-refs` (gitignored). For destructive subcommands, if the linked ref is in the prod list, it refuses the operation. Pass-through for everything else. The matcher walks adjacent argument pairs so leading global flags don't shift the destructive subcommand out of view.

Guards (extend as new destructive forms surface): `db reset`, `db push`, `db remote *`, `migration up`, `migration repair`.
**Bypass surfaces (by design):** `--db-url postgres://...prod...` flags, direct `psql` against the prod URL, any tool not going through the `supabase` binary. The wrapper closes the CLI-link gap; discipline covers the rest. Alias `supabase='./scripts/safe-supabase.sh'` makes protection transparent.
**Setup:** copy script to `scripts/`, `chmod +x`, create `.claude/prod-supabase-refs` (one ref per line, gitignored).

---

## Product Decisions (BrewBoat)

These are recorded compactly per the project plan (April 12, 2026 planning poker). Expand individual entries with Why / Tradeoff / Revisit-if as the project surfaces non-obvious reasoning.

### DEC-101: Supabase for DB
**Decision:** Same as Sailbook V1. Postgres + Auth + RLS in one service.
**Why:** Free tier (2 projects, 500 MB DB each, 50k MAU, 1-week inactivity pause) covers MVP + Season 1 at BrewBoat's scale (~12 staff, kilobyte data). Off-season pausing is desired behavior. Alternatives (Neon, Cloudflare D1, Vercel Postgres) don't bundle Auth/RLS and would force re-architecting DEC-001 ("no API server, RLS does authz"). Self-hosting on Hetzner saves nothing on free tier and adds ops burden against a fixed-date launch.
**Cost path:** Free → Pro ($25/mo + $10/project) only when usage requires it or Drew is paying. Defer the upgrade decision to Phase 6.4 (production Xola cutover) or first paying customer, whichever comes first.
**Status:** Decided 2026-04-12. Cost rationale + alternatives reviewed 2026-05-18 (architect, Session 4).
**Revisit if:** DB approaches 500 MB, MAU approaches 50k, or in-season pausing becomes a problem (won't at weekly cadence).

### DEC-102: Xola stays as booking system, we build on top
**Decision:** Reservations originate in Xola; BrewBoat reads from and writes back to Xola via API. Do not replace Xola.
**Status:** Decided 2026-04-12.
**See:** Xola Integration Notes (PROJECT_PLAN.md, end of file).

### DEC-103: Anthropic API for agents
**Decision:** Claude Sonnet for shift-generation and assignment agents.
**Status:** Decided 2026-04-12.

### DEC-104: Magic links for staff auth (no passwords)
**Decision:** Resend-delivered magic links via Supabase Auth `signInWithOtp({ email })`. Admin invites; crew clicks. Supabase default refresh-token lifetime (60 days, auto-rotating) means crew sees a magic-link email roughly once per off-season, not per login — in-season weekly use keeps the session warm indefinitely.
**Why:** Same-day integration. Sets `auth.uid()` so RLS (DEC-001) works without app-layer authz threading. Magic-link expiry is the security model — no custom token rotation needed. All crew already has email (Xola requires it).
**Considered alternatives:**
- **Permanent per-staff URL tokens** (admin sends long-token URL, crew bookmarks). Rejected: bypasses `auth.uid()`, requires custom session handling that re-introduces the API-middleware pattern DEC-001 killed, shifts security from time-bounded tokens to manual rotation. Conceptually simpler, operationally worse.
- **PIN-based login** (synthetic email + PIN as Supabase password, name dropdown + PIN field). Deferred 2026-05-18: motivation was "lower friction for crew" but the 60-day refresh-token behavior already delivers near-zero friction during a season. No problem found that PIN solves better than what magic links + session refresh already do. Revisit if crew reports friction after Season 1, or if a real lost-phone / shared-device threat surfaces.
**Status:** Decided 2026-04-12. Alternatives considered + rejected 2026-05-18 (architect + user, Session 4).
**See:** Phase 5.1 (PROJECT_PLAN.md).
**Revisit if:** Drew reports crew friction with email magic-link flow after Season 1, *and* RLS-via-`auth.uid()` is no longer load-bearing.

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

### DEC-113: Initial RLS posture — loose authenticated read, admin write
**Decision:** For the Phase 0.3 initial migration, RLS policies are deliberately loose:
- `profiles`, `shifts`, `assignments` — any authenticated user can `SELECT`; only admins (`profiles.is_admin = true`) can `INSERT` / `UPDATE` / `DELETE`.
- `scheduling_runs` — admin only for all operations (read + write).

RLS is `enabled` on every table per CLAUDE.md ("No table is accessible without explicit policy"), but the policies are coarse.
**Why:** Low-stakes app: shifts and assignments are shared operational data — captains know who they're working with by design. The "worst case" of a read leak is crew seeing another crew's schedule, which is the same information already visible on the schedule board. Looser policies speed initial development (fewer RLS-403 errors during dev), reduce pgTAP test surface in Phase 0.7 (~3 simple tests vs ~8–10 per-row tests), and don't lock out tightening later. `scheduling_runs` stays admin-only because it holds agent prompt inputs/outputs (JSONB blobs) with no crew-facing purpose.
**Tradeoff:** Phase 5.1 (staff self-select) will require an RLS update so staff can `UPDATE` their own row in `assignments` (claim a shift). That update is required regardless of the initial posture, so the loose baseline doesn't add work — it just defers one decision point.
**Status:** Decided 2026-05-18 (Session 4, Task 0.3).
**Revisit:** Phase 5.1 (staff self-select needs assignment write permission for `profile_id = auth.uid()`). Tighten profiles + assignments per-row reads if a real exposure surfaces — none expected at the BrewBoat threat model.

**Production bootstrap:** `supabase/seed.sql` inserts the local-dev admin (`admin@brewboat.local`) but `supabase db push` does **not** apply seed data to remote projects — the seed file only runs on `supabase db reset` locally. The initial schema migration does not include a `handle_new_user` trigger, so creating an `auth.users` row does not automatically populate `public.profiles`. In production there is no admin user when the schema first lands, and the loose RLS posture above blocks every write path (`is_admin()` returns false for everyone). Bootstrap path:

1. In the Supabase dashboard, `Auth → Users → Add user` — supply the admin's email + a temporary password. (Or, once Phase 5.1 magic-link auth ships, sign in once via the deployed app — that path also creates the `auth.users` row.)
2. From the Supabase dashboard's SQL editor, run exactly once:
   ```sql
   insert into public.profiles (id, email, is_admin)
   select id, email, true
   from auth.users
   where email = 'YOUR_EMAIL_HERE';
   ```
   This mirrors the pattern in `supabase/seed.sql`. The profiles `id` column FKs to `auth.users(id)` (`on delete cascade`), so a single row binds them.

After step 2, that user has `is_admin = true` and every admin RLS policy unlocks. Subsequent admins can be promoted by the first admin through the admin UI once Phase 1.8 ships, or via the same SQL snippet in the meantime. The promotion is intentionally manual — the alternative ("auto-admin the first signup") is a known footgun: any visitor who finds the URL pre-promotion becomes admin.

If the project later adopts a `handle_new_user` trigger (auto-create `profiles` on `auth.users` insert), revise step 2 to drop the `insert` in favor of a plain `update public.profiles set is_admin = true where id = (select id from auth.users where email = '…');`.
