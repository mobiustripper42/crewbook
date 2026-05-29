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

## Boat resource IDs

| ID | Label |
|----|-------|
| `6a0fa498081e494f74080020` | Boat A |
| `6a0fa498081e494f74080021` | Boat B |
| `6a0fa498081e494f74080022` | Boat C |
| `6a0fa498081e494f74080023` | Boat D |
