// Live eval for the Phase 2.1 shift agent. NOT part of the test suite — it
// makes a real Sonnet call (DEC-103) and costs real API money per run.
//
// Run:  node --experimental-strip-types scripts/eval-shift-agent.ts
//   (reads ANTHROPIC_API_KEY from .env.local; pass a fixture slug as argv[2]
//    to eval a different week, default week-2026-06-01)
//
// It maps the 2.0 fixture week through lib/xola/mapping.ts, runs the agent,
// grades the output against the hand-authored answer key, prints a report,
// and exits non-zero on any mismatch so it can gate a tuning loop.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { mapSlotsForWeek, lookupFromEntries } from "../lib/xola/mapping.ts";
import type { XolaEvent } from "../lib/xola/events.ts";
import type { XolaOrder } from "../lib/xola/orders.ts";
import { generateShifts } from "../lib/agents/shift-agent.ts";
import { gradeShifts } from "../lib/agents/grade-shifts.ts";
import type { GeneratedShift } from "../lib/agents/shift-agent-prompt.ts";

// Minimal .env.local loader (Node doesn't auto-read it for plain scripts).
// Strips inline `# comments` after values, matching tests/global-setup.ts.
function loadEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue;
    let val = m[2].trim();
    const hash = val.indexOf(" #");
    if (hash !== -1) val = val.slice(0, hash).trim();
    val = val.replace(/^["']|["']$/g, "");
    process.env[key] = val;
  }
}

interface WeekFixture {
  week_start: string;
  timezone?: string;
  events: XolaEvent[];
  orders: XolaOrder[];
}
interface ExpectedFixture {
  shifts: GeneratedShift[];
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (add it to .env.local). This eval makes a real, billed API call.");
    process.exit(1);
  }

  const slug = process.argv[2] ?? "week-2026-06-01";
  const dir = join(process.cwd(), "tests", "fixtures", "shift-agent");
  const week = JSON.parse(readFileSync(join(dir, `${slug}.json`), "utf8")) as WeekFixture;
  const expected = JSON.parse(readFileSync(join(dir, `${slug}.expected.json`), "utf8")) as ExpectedFixture;

  const lookup = lookupFromEntries([["Brewboat Tour - captained", "brewboat"]]);
  const slots = mapSlotsForWeek(week.events, week.orders, lookup);

  console.log(`Eval ${slug}: ${slots.length} slots → expecting ${expected.shifts.length} shifts.`);
  console.log("Making 1 live Sonnet call (claude-sonnet-4-6)…\n");

  const generated = await generateShifts({
    slots,
    weekStart: week.week_start,
    timezone: week.timezone,
  });
  const report = gradeShifts(generated, expected.shifts);

  console.log(`Score: ${(report.score * 100).toFixed(0)}%  (${report.matched}/${report.total} shifts exact)`);
  if (report.mismatched.length) {
    console.log(`\nMismatched (${report.mismatched.length}):`);
    for (const m of report.mismatched) console.log(`  ${m.key}\n    - ${m.diffs.join("\n    - ")}`);
  }
  if (report.missing.length) console.log(`\nMissing (${report.missing.length}): ${report.missing.join(", ")}`);
  if (report.extra.length) console.log(`\nExtra (${report.extra.length}): ${report.extra.join(", ")}`);

  if (report.score < 1) {
    console.log("\nFAIL — output does not match the answer key. Tune the prompt and re-run.");
    process.exit(1);
  }
  console.log("\nPASS — agent output matches the answer key exactly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
