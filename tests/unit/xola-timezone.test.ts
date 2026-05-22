// Unit tests for timezone-offset helper.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { getOffsetSeconds, localDateToEpochSeconds } from "../../lib/xola/timezone.ts";

describe("getOffsetSeconds — DST awareness", () => {
  it("Cleveland in June is EDT (-14400)", () => {
    // 2026-06-15 12:00 UTC — well inside DST.
    const d = new Date("2026-06-15T12:00:00Z");
    assert.equal(getOffsetSeconds(d, "America/New_York"), -14400);
  });

  it("Cleveland in January is EST (-18000)", () => {
    const d = new Date("2026-01-15T12:00:00Z");
    assert.equal(getOffsetSeconds(d, "America/New_York"), -18000);
  });

  it("UTC zone is 0", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    assert.equal(getOffsetSeconds(d, "UTC"), 0);
  });

  it("handles half-hour offsets (India Standard Time +5:30)", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    assert.equal(getOffsetSeconds(d, "Asia/Kolkata"), 5 * 3600 + 30 * 60);
  });

  it("handles 15-minute offsets (Nepal +5:45)", () => {
    const d = new Date("2026-06-15T12:00:00Z");
    assert.equal(getOffsetSeconds(d, "Asia/Kathmandu"), 5 * 3600 + 45 * 60);
  });
});

describe("localDateToEpochSeconds", () => {
  it("converts 2026-06-01 midnight Cleveland local → correct UTC epoch", () => {
    // 2026-06-01 00:00 EDT == 2026-06-01 04:00 UTC.
    const epoch = localDateToEpochSeconds("2026-06-01", "America/New_York");
    // 2026-06-01T04:00:00Z = 1780257600
    assert.equal(epoch, Math.floor(Date.UTC(2026, 5, 1, 4, 0, 0) / 1000));
  });

  it("converts 2026-01-01 midnight Cleveland local → correct UTC epoch (EST)", () => {
    // 2026-01-01 00:00 EST == 2026-01-01 05:00 UTC.
    const epoch = localDateToEpochSeconds("2026-01-01", "America/New_York");
    assert.equal(epoch, Math.floor(Date.UTC(2026, 0, 1, 5, 0, 0) / 1000));
  });

  it("UTC zone passes through unchanged", () => {
    const epoch = localDateToEpochSeconds("2026-06-01", "UTC");
    assert.equal(epoch, Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000));
  });

  it("respects explicit hour/minute/second", () => {
    // End-of-week boundary: 2026-06-07 23:59:59 Cleveland EDT.
    const epoch = localDateToEpochSeconds("2026-06-07", "America/New_York", 23, 59, 59);
    // 23:59:59 EDT = 03:59:59 next day UTC.
    assert.equal(epoch, Math.floor(Date.UTC(2026, 5, 8, 3, 59, 59) / 1000));
  });

  it("rejects malformed date strings", () => {
    assert.throws(
      () => localDateToEpochSeconds("not-a-date", "UTC"),
      /expected YYYY-MM-DD/,
    );
    assert.throws(
      () => localDateToEpochSeconds("2026/06/01", "UTC"),
      /expected YYYY-MM-DD/,
    );
  });
});
