// Live eval for the Phase 2 shift agent. NOT part of the test suite — it makes
// a real Sonnet call per week (DEC-103) and costs real API money per run.
//
// Run:
//   node --experimental-strip-types scripts/eval-shift-agent.ts            # ALL weeks
//   node --experimental-strip-types scripts/eval-shift-agent.ts week-2026-06-01   # one week
//
// (reads ANTHROPIC_API_KEY from .env.local.) Each week is mapped through
// lib/xola/mapping.ts, run through the agent, and graded against its hand-
// authored answer key. Phase 2.5 generalized this from one week to the whole
// fixture corpus: it prints a per-week score, an aggregate, and exits non-zero
// if ANY week is below 100% so it can gate a tuning loop.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { mapSlotsForWeek, lookupFromEntries } from "../lib/xola/mapping.ts";
import type { XolaEvent } from "../lib/xola/events.ts";
import type { XolaOrder } from "../lib/xola/orders.ts";
import { generateShifts } from "../lib/agents/shift-agent.ts";
import { gradeShifts, type GradeReport } from "../lib/agents/grade-shifts.ts";
import type { GeneratedShift } from "../lib/agents/shift-agent-prompt.ts";

const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "shift-agent");

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

// All fixture slugs that have BOTH an input and an answer key.
function allSlugs(): string[] {
  const files = new Set(readdirSync(FIXTURE_DIR));
  return [...files]
    .filter((f) => f.endsWith(".json") && !f.endsWith(".expected.json"))
    .map((f) => f.slice(0, -".json".length))
    .filter((slug) => files.has(`${slug}.expected.json`))
    .sort();
}

async function evalWeek(slug: string): Promise<{ slug: string; report: GradeReport }> {
  const week = JSON.parse(readFileSync(join(FIXTURE_DIR, `${slug}.json`), "utf8")) as WeekFixture;
  const expected = JSON.parse(
    readFileSync(join(FIXTURE_DIR, `${slug}.expected.json`), "utf8"),
  ) as ExpectedFixture;

  const lookup = lookupFromEntries([["Brewboat Tour - captained", "brewboat"]]);
  const slots = mapSlotsForWeek(week.events, week.orders, lookup);

  console.log(`\n── ${slug}: ${slots.length} slots → expecting ${expected.shifts.length} shifts (1 live Sonnet call)…`);
  const result = await generateShifts({ slots, weekStart: week.week_start, timezone: week.timezone });
  const report = gradeShifts(result.shifts, expected.shifts);

  console.log(`   score ${(report.score * 100).toFixed(0)}%  (${report.matched}/${report.total} exact)`);
  if (report.mismatched.length) {
    for (const m of report.mismatched) console.log(`   ✗ ${m.key}\n       - ${m.diffs.join("\n       - ")}`);
  }
  if (report.missing.length) console.log(`   missing: ${report.missing.join(", ")}`);
  if (report.extra.length) console.log(`   extra:   ${report.extra.join(", ")}`);
  return { slug, report };
}

async function main(): Promise<void> {
  loadEnvLocal();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (add it to .env.local). This eval makes real, billed API calls.");
    process.exit(1);
  }

  const arg = process.argv[2];
  const slugs = arg ? [arg] : allSlugs();
  if (slugs.length === 0) {
    console.error(`No gradeable fixtures found in ${FIXTURE_DIR} (need week-*.json + week-*.expected.json pairs).`);
    process.exit(1);
  }
  console.log(`Evaluating ${slugs.length} week(s): ${slugs.join(", ")}  → ${slugs.length} live Sonnet call(s).`);

  const results = [];
  for (const slug of slugs) results.push(await evalWeek(slug));

  const totalExpected = results.reduce((n, r) => n + r.report.total, 0);
  const totalMatched = results.reduce((n, r) => n + r.report.matched, 0);
  const aggregate = totalExpected === 0 ? 1 : totalMatched / totalExpected;
  const failed = results.filter((r) => r.report.score < 1);

  console.log(`\n══ Aggregate: ${(aggregate * 100).toFixed(0)}%  (${totalMatched}/${totalExpected} shifts exact across ${results.length} week(s))`);
  if (failed.length) {
    console.log(`FAIL — ${failed.length} week(s) below 100%: ${failed.map((r) => r.slug).join(", ")}. Tune the prompt and re-run.`);
    process.exit(1);
  }
  console.log("PASS — every week matches its answer key exactly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
