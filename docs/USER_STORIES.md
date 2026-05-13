# BrewBoat — User Stories

> ⚠️ This is a v0 draft (2026-05-13). Review + revision is task 0.01 in `PROJECT_PLAN.md`.

Story IDs use a role prefix: AD (Admin), CP (Captain), MT (Mate), SH (Shore Staff). Cross-reference with `SPEC.md` and `PROJECT_PLAN.md`.

---

## Admin (Drew)

### Roster
- **AD-1** — As Admin, I import staff from Xola guides so I don't re-key the roster.
- **AD-2** — As Admin, I mark a staff member's roles (captain / mate / shore) and per-boat qualifications so the agent assigns only people who can actually do the job.

### Weekly schedule
- **AD-3** — As Admin, I click "Pull Week" and see every confirmed reservation for that week, mapped to boats and time slots, so I know what needs staffing.
- **AD-4** — As Admin, the agent generates a shift list from the week's reservations so I'm not building shifts by hand.
- **AD-5** — As Admin, I can split, merge, or delete a generated shift before posting it, because the agent will sometimes get the boundary wrong.
- **AD-6** — As Admin, I enter staff availability for the week so the assignment agent has the constraint set it needs. *(Phase 3 — replaced by staff self-entry in Phase 5.)*
- **AD-7** — As Admin, the agent proposes a complete crew assignment so I can review rather than author.
- **AD-8** — As Admin, I see the full week on a schedule board (boats × days, color-coded by status) so I can spot gaps and over/under-assignments at a glance.
- **AD-9** — As Admin, I can swap any captain / mate / shore manually with a dropdown so I can react to availability changes the agent didn't know about.
- **AD-10** — As Admin, I approve the week (or individual shifts) so the system knows what's ready to push.

### Push to Xola
- **AD-11** — As Admin, I click "Push to Xola" and the system writes all approved assignments back to Xola as guide assignments so the team in Xola sees the schedule.
- **AD-12** — As Admin, I see per-assignment write-back status (written / failed / skipped) so I know what needs hand-entry if anything fails (DEC-112).

### Mid-week
- **AD-13** — As Admin, the system flags affected shifts when new reservations or cancellations land mid-week, so I can react without re-pulling from scratch.

### Phase 5 — crew self-select
- **AD-14** — As Admin, I post the week to crew so they can claim shifts.
- **AD-15** — As Admin, I see which shifts are claimed vs unclaimed in real time.
- **AD-16** — As Admin, the gap-fill agent assigns unclaimed shifts after the cutoff so I'm not chasing crew at the last minute.

---

## Captain

*All Captain stories are Phase 5 (mobile self-select).*

- **CP-1** — As Captain, I set my availability for the upcoming week from my phone so I can do it on the drive home, not at a desk.
- **CP-2** — As Captain, I see only the shifts I'm qualified for (brewboat captain, captained duffy) so I'm not scrolling past irrelevant options.
- **CP-3** — As Captain, I claim a shift with one tap so I can lock in plans at the dock without typing.
- **CP-4** — As Captain, I see my upcoming shifts in a simple list so I know where to be and when.
- **CP-5** — As Captain, I get an email when the week is posted so I don't have to check the app every day.

---

## Mate

*All Mate stories are Phase 5 (mobile self-select).*

- **MT-1** — As Mate, I set my availability for the upcoming week from my phone.
- **MT-2** — As Mate, I see only open mate shifts on brewboats so I'm not scrolling past captain-only slots.
- **MT-3** — As Mate, I claim a shift with one tap.
- **MT-4** — As Mate, I see my upcoming shifts in a simple list.
- **MT-5** — As Mate, I get an email when shifts are posted.

---

## Shore Staff

*All Shore Staff stories are Phase 5 (mobile self-select).*

- **SH-1** — As Shore Staff, I set my availability for the upcoming week from my phone.
- **SH-2** — As Shore Staff, I see open duffy-rental shifts so I can pick the days that work.
- **SH-3** — As Shore Staff, I claim a shift with one tap.
- **SH-4** — As Shore Staff, I see my upcoming shifts in a simple list.
- **SH-5** — As Shore Staff, I get an email when shifts are posted.
