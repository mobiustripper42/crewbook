# BrewBoat — Brand Direction

> ⚠️ This is a v0 draft (2026-05-13). Review + revision is task 0.01 in `PROJECT_PLAN.md`.

## Name

BrewBoat

## Tagline

None needed. Internal tool.

## Philosophy

BrewBoat keeps the season running. It does the boring scheduling math so the admin can spend Saturday morning actually running the boats, not pasting names into a spreadsheet.

The app should feel like a competent crew member — quiet, accurate, gets out of the way. The schedule is the product; everything else is plumbing.

The agent makes the first pass. The admin always has the final say.

In practice this means:
- The schedule board is the heart of the app. Other pages are scaffolding for it.
- Error messages tell you what happened, not what you should feel about it.
- An empty state explains what to do next, not "Welcome!"
- Every screen earns its place. If a screen exists, it solves a real problem the admin or crew has at that moment.

## Voice

Practical with a dry sense of humor. Drew's voice, not a marketing team's. Occasional sarcasm allowed; one good line beats three forced ones.

**Sounds like:**
- "Week of May 18 pulled. 12 brewboat slots, 4 duffy rentals."
- "Agent couldn't find a captain for the 2pm brewboat — license + availability mismatch. Manual assignment needed."
- "Write-back failed for 2 of 22 assignments. Open Xola; the board has the rest."

**Does not sound like:**
- "Oops! Something went wrong."
- "Awesome! Your week has been successfully scheduled!"
- "Let's get you started on your scheduling journey."

## Visual Direction

- **Style:** TBD — shadcn theme picked in Phase 0.1 (`ui-reviewer.md` Active Theme block updated at the same time).
- **Default mode:** Light. Boats run in daylight; staff use the app outdoors.
- **Font:** Geist Sans (heading + body)
- **Border radius:** `rounded-lg` (md). One radius, used everywhere. Never mix.
- **Shadows:** Cards `shadow-sm`. Modals `shadow-lg`. Nothing else.
- **Color approach:** Semantic shadcn tokens (`bg-background`, `bg-card`, etc.) — no hardcoded Tailwind color classes for surfaces or text. Amber for warnings is OK (UX signal, not brand color).
- **Schedule-board status colors:** Approved / Pending / Unfilled / Conflict — small, distinct, paired with icon + text label (never color alone — accessibility baseline).

## Anti-patterns

What to explicitly avoid:

- **No nautical kitsch.** No rope dividers, no anchor icons, no compass roses, no "ahoy."
- **No hero images.** Internal tool. Land on the schedule.
- **No empty-state mascots.** If a screen is empty, say what's empty and what to do.
- **Not a beer brand.** BrewBoat is the scheduling tool, not the brewery. No beer-can iconography, no brewery color palette.
- **No gamification.** Crew shouldn't earn badges for claiming shifts.
- **No color as the sole state indicator.** Pair color with icon + text label.

## Priority

Function over form. Polish is Phase 6.
