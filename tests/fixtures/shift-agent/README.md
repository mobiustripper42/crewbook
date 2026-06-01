# Shift-agent fixtures

Hand-authored known-good week(s) for grading the Phase 2 shift-generation agent
(issue #50 / task 2.0). Without these, every 2.1 prompt iteration is "did the
agent do the right thing?" answered by vibes — the Xola sandbox has one live
product and few orders, so there's no deterministic ground truth to grade against.

Each week is two files:

- `week-YYYY-MM-DD.json` — the input. Raw Xola `events` + `orders` in the real
  sandbox shape, so it feeds `lib/xola/mapping.ts` directly with no adapter.
- `week-YYYY-MM-DD.expected.json` — the answer key. The shifts that *should* be
  generated from those events, per the operator (Drew) rules below. Hand-written
  and human-verified; this is what 2.1's harness grades agent output against.

Times are in the seller's wall clock (`America/New_York`, EDT `-04:00` in June).

## Operator rules (Drew), encoded in the answer key

1. **Same boat, back-to-back → one shift.** A run of consecutive booked slots on
   one boat is a single shift, not one shift per slot.
2. **Each slot is 2 hours.** A shift's `start` = its first event's start; `end` =
   its last event's start + 2h.
3. **One-slot gap is bridged; two-slot gap splits.** Slots run on a ~2h cadence
   (11:00 / 13:00 / 15:00 / 17:00). One empty slot inside a run stays one shift;
   two or more empty slots in a row split it into separate shifts.
4. **Shifts come from booked events only.** An event with zero orders produces no
   shift; an empty slot matters only as a possible gap-filler inside a run.
5. **Brewboat crew is always two: one captain + one mate.** Every shift's
   `roles` is `["captain", "mate"]`.
6. **Cross-boat combination is OUT OF SCOPE.** Drew can sometimes combine
   back-to-back slots across different boats into one shift, but the rule isn't
   firm. Not encoded here — revisit before grading on it.

## `week-2026-06-01` scenarios

| Day | Boat | Booked slots | Expected | Rule exercised |
|-----|------|-------------|----------|----------------|
| Mon 06-01 | A | 11, 13, 15 | 1 shift 11:00–17:00 | same-boat run (rule 1) |
| Tue 06-02 | B | 11, 15 (13 empty) | 1 shift 11:00–17:00 | one-slot gap bridged (rule 3) |
| Wed 06-03 | C | 11, 17 (13, 15 empty) | 2 shifts: 11:00–13:00, 17:00–19:00 | two-slot gap splits (rule 3) |
| Thu 06-04 | D | 13 (two orders, 10 guests) + 11 empty event | 1 shift 13:00–15:00; the empty event → no shift | multi-order summing + booked-only (rules 4, 5) |

Five expected shifts across four boats; eight booked events; one zero-order event
(`...009`) that intentionally produces no shift.

**Gaps are implicit.** The empty in-run slots (Boat B's 13:00; Boat C's 13:00 and
15:00) are *not* present as events — under Xola's `reserved=true` pull, an unbooked
slot returns no event at all, so a gap shows up as missing time on the cadence, not
as a zero-order event. The lone zero-order event (`...009`) is a *standalone* slot
exercising rule 4 (booked-only), not rule 3 (gap bridging). 2.1's grader should
infer gaps from the ~2h cadence, not expect an empty event object to sit in them.

## `week-2025-06-09` scenarios (task 2.5)

Modeled on the real 2025 manifest shape: `:30` cadence (11:30 / 13:30 / 15:30 /
17:30 / 19:30) and multiple boats running in parallel on the same day — neither
of which the 2.0 week exercised.

| Day | Boat | Booked slots | Expected | Rule exercised |
|-----|------|-------------|----------|----------------|
| Mon 06-09 | A | 11:30, 13:30, 15:30 | 1 shift 11:30–17:30 | same-boat run (rule 1) |
| Mon 06-09 | B | 11:30, 13:30 | 1 shift 11:30–15:30 | parallel boat, no cross-combine (rule 6) |
| Mon 06-09 | C | 13:30 | 1 shift 13:30–15:30 | third parallel boat, same day |
| Tue 06-10 | A | 11:30, 15:30 (13:30 empty) | 1 shift 11:30–17:30 | one-slot gap bridged (rule 3) |
| Tue 06-10 | B | 11:30, 17:30 (13:30, 15:30 empty) | 2 shifts: 11:30–13:30, 17:30–19:30 | two-slot gap splits (rule 3) |

Six expected shifts; the marquee case is **three boats in parallel on Monday** —
the agent must emit three distinct shifts and never merge across boats.

## `week-2025-08-04` scenarios (task 2.5)

Edge cases at `:30` cadence.

| Day | Boat | Booked slots | Expected | Rule exercised |
|-----|------|-------------|----------|----------------|
| Mon 08-04 | A | 11:30, 13:30, 15:30, 17:30 | 1 shift 11:30–19:30 | long four-slot continuous run (rule 1) |
| Tue 08-05 | A | 15:30 | 1 shift 15:30–17:30 | isolated single-slot shift |
| Tue 08-05 | B | 11:30 (two orders) | 1 shift 11:30–13:30 | multi-order guest summing (4 + 2 = 6) |

## Validating against real 2025 data — deferred to Phase 6.4

These three weeks are **synthetic** — hand-authored, human-verified, and modeled
on the real 2025 booking patterns, but not real bookings. True validation against
real history needs the per-slot **boat/resource id** (`resourceUsages` on each
event), and Xola's report exports do not emit it — only the events API carries
it, and the real 2025 events live in prod, which we don't connect to until the
Phase 6.4 cutover. At 6.4, pull a handful of real 2025 weeks via the events API,
drop them in as `week-*.json`, author keys from the actual guide assignments
(the manifest CSV has those), and the multi-week eval grades them automatically.

> The agent input does not currently carry order **status**, so a slot whose only
> order is cancelled (700) still counts as booked (`order_count ≥ 1`) and would be
> scheduled. Handling cancellations needs a `confirmed_count` on the slot + a
> prompt rule + a version bump — tracked as a separate follow-up, not in 2.5.

## Current eval baseline

At `temperature: 0` (set in 2.5 for reproducibility), the agent scores **13/14
(93%)**: `week-2026-06-01` and `week-2025-08-04` pass 100%; `week-2025-06-09`
misses one shift — the Tue 06-10 Boat A one-slot-gap bridge (rule 3) splits
instead of bridging. Reproducible, not variance. Tracked in
[#58](https://github.com/mobiustripper42/crewbook/issues/58) — a prompt fix, out
of 2.5 scope. The eval exiting non-zero on that week is expected until #58 lands.

## Running the eval

```
node --experimental-strip-types scripts/eval-shift-agent.ts            # grade ALL weeks
node --experimental-strip-types scripts/eval-shift-agent.ts week-2025-06-09   # one week
```

One **billed** Sonnet call per week (DEC-103). Not part of the test suite. The
offline answer-key integrity checks live in `tests/unit/shift-fixture.test.ts`
and run for free on every `npm run test:unit`.

## Boat resource IDs

| ID | Label |
|----|-------|
| `6a0fa498081e494f74080020` | Boat A |
| `6a0fa498081e494f74080021` | Boat B |
| `6a0fa498081e494f74080022` | Boat C |
| `6a0fa498081e494f74080023` | Boat D |
