# BrewBoat — Phase Retrospectives

Written at each phase boundary by `/retro`. Newest at top.

---

## Phase 0 — 2026-05-19

**Sessions:** 5 closed (Session 2 abandoned, excluded from metrics)
**Points:** 17 / 17 (100%) shipped against the original plan
**Wall clock:** 13.88h
**Dev time:** 2.31h
**Review time:** 2.97h

**Velocities (against 17 planned Phase 0 points):**
- Wall: 0.82 h/pt
- Dev: 0.14 h/pt *(under-reports — see method note)*
- Review: 0.17 h/pt
- **Active (dev + review): 0.31 h/pt ← headline forecast**

vs. the 0.40 h/pt PROJECT_PLAN baseline → ~25% faster. PM commentary below cautions against extrapolating.

**Issues:** 6 created (`phase:0`), 6 closed, 0 moved to Phase 1, 0 descoped. All issues opened on 2026-05-18, all closed by 2026-05-19T15:48Z.

### Per-session breakdown

| Session | Date | Wall | Dev | Review | Breaks | Points | PRs |
|---------|------|------|-----|--------|--------|--------|-----|
| 1 | 2026-05-07 | 0.30h | 0.30h | 0.00h | 0.00h † | 3 | — |
| 2 | 2026-05-13 | — | — | — | — | — | **abandoned** |
| 3 | 2026-05-18 | 0.53h | 0.39h | 0.14h | 0.00h † | 3 | #13 |
| 4 | 2026-05-18 | 7.21h | 0.58h | 1.10h | 5.53h | 7 | #14 / #15 / #16 |
| 5 | 2026-05-19 | 1.93h | 0.45h | 1.02h | 0.46h | 4 | #17 / #18 |
| 6 | 2026-05-19 | 3.91h | 0.59h | 0.71h | 2.61h | 6 | #19 / #20 / #21 |
| **Total** | | **13.88h** | **2.31h** | **2.97h** | **8.60h** | **23** | 10 PRs |

† `inference: transcript-unavailable` — Sessions 1 + 3 ran on different hosts (`/home/user/`, `/root/`); JSONL not readable from this dev box.

### Method note

DEC-015 specifies per-PR dev + review windows. Session 4 (Tasks 1–3, PRs #14/#15/#16) had concurrent PR reviews — #15 + #16 overlapped by ~3h47m while Eric was AFK overnight. Under the literal per-PR-window rule, overlapping reviews double-count time, breaking the `dev + review + breaks ≈ wall` sanity check by 0.33h.

Fell back to a single-boundary model: first-PR-opened time = dev→review seam, capped at last-PR-merged or session end. That sanity-checks exactly across all sessions. The cost: any code edits made during PR review windows (responding to `@code-review` findings, iterating) land in `review_time`, not `dev_time`. This is why `dev_time / pt` (0.14 h/pt) under-reports — most of Phase 0's actual coding was iterative on already-opened PRs. **Use `active_time / pt` (0.31 h/pt) as the headline going forward** until DEC-015's overlap handling is sharpened.

### What worked

> all the tasks were spec properly and dev was on track

### What didn't

> nothing to add, i hope all phases are that smooth

### Changes for next phase

*Skipped — stay the course.*

### Scope changes

- **Session-points vs phase-points:** 23 pts session-sum vs 17 pts phase-issue-sum. The 6pt drift is repo/workflow work that touched the codebase but wasn't Phase 0 issue scope:
  - **PR #13** (Session 3, 3pts) — seeds-template baseline-sweep + DEC-014 migration pull
  - **PR #16** (Session 4 Task 2, ~3pts) — DEC-016 ui-reviewer split (workflow agent refactor)
- **Mid-phase add:** PR #20 — Phase 0.3 follow-up (committing generated Supabase types). Lived as untracked across Sessions 4 + 5, shipped in Session 6. Not a new issue; folded into the existing 0.3 row in PROJECT_PLAN.md.
- All 6 original Phase 0 issues closed within phase. No issues moved out, none descoped.

### PM read

Phase 0 came in 25% under the velocity baseline, but read that number with a hand on the brake. Six issues, all self-contained, all spec'd before code touched the branch — that's not Phase 1. Phase 1.1 alone is a 5-point Xola client against a sandbox you don't control, with rate limits, auth weirdness, and a paginated orders endpoint that doesn't care about your test plan. Expect 0.40 h/pt or worse on that one and budget the slip. The 0.31 number is real, but it's real *for the kind of work Phase 0 was*, which is the kind of work where the dependency graph fits in your head.

"I hope all phases are that smooth" — they won't be. Phase 0 was smooth because the failure modes were all local: a bad migration, a typo, a missing env var. Every Phase 1+ task introduces an external surface that can fail in ways the spec didn't anticipate. The shift agent in Phase 2 will surprise us. The Xola write-back in 6.4 will surprise us. The smoothness here is partly skill and partly that you picked the right work to start with. Bank it, don't extrapolate it.

Session 4's 5.53h of breaks isn't a problem to solve — it's the async workflow doing exactly what it's supposed to. PR sat open overnight while you slept, code review ran, you came back and addressed comments. The fact that it shows up as "75% break time" is a measurement artifact, not a workflow failure. The honest headline for async-heavy phases is points-per-week, not hours-per-point. Worth noting in RETROSPECTIVES.md so future-you doesn't squint at the same ratio in Phase 4 and think something's broken.

Phase 0.6 being mostly user-side waiting on Xola approval was the right call — you can't compress external approval latency by adding a tighter task spec. Landing it in the same session as 0.7 once approval came through is the optimal shape for that kind of work: start the clock when the unblock happens, not before. Worth doing the same when Phase 6 hits prod Xola — don't open the task until the human-side gate clears.

Forward note for Phase 1: sequence 1.1 (Xola client) before anything that depends on real order data. The sample fixtures in `tests/fixtures/xola-sample-data.json` will carry you through 1.2–1.4, but 1.1 is the only task in Phase 1 where you'll learn whether the sandbox actually behaves like the docs claim. If the sandbox surprises us, the surprise should land on the first task, not the fourth.

---
