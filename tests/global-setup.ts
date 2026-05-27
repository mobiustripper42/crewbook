// Playwright globalSetup — load .env.local into the test process so specs
// that need Supabase keys (e.g. admin-staff.spec.ts seeding xola_guides
// rows) can read them. Next.js loads .env.local for the dev server, but
// the test runner is a separate Node process.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup() {
  const path = resolve(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // Missing .env.local is fine — specs that need vars will throw their
    // own missing-env error with a useful pointer to docs/TEST.md.
    return;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    // Strip trailing inline comment ( whitespace + # ... ). Be careful not
    // to strip `#` inside a quoted value or in the middle of an unquoted
    // value with no preceding space.
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const hashIdx = value.search(/\s+#/);
      if (hashIdx >= 0) value = value.slice(0, hashIdx);
    }
    value = value.trim();
    // Strip surrounding quotes (single or double) to match dotenv semantics.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
