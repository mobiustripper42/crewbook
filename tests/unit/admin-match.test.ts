// Run with: npm run test:unit

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  rankMatches,
  scoreMatch,
  type GuideForMatch,
  type ProfileForMatch,
} from "../../app/admin/staff/match.ts";

const guide = (over: Partial<GuideForMatch> = {}): GuideForMatch => ({
  id: "g1",
  name: "Eric Stoffer",
  email: "eric@example.com",
  ...over,
});

const profile = (over: Partial<ProfileForMatch> = {}): ProfileForMatch => ({
  id: "p1",
  email: "eric@example.com",
  full_name: "Eric Stoffer",
  ...over,
});

describe("scoreMatch — email signal", () => {
  it("returns score 100 on exact email", () => {
    const m = scoreMatch(guide(), profile());
    assert.equal(m?.score, 100);
    assert.equal(m?.reason, "email match");
  });
  it("matches email case-insensitively", () => {
    const m = scoreMatch(guide({ email: "ERIC@example.com" }), profile({ email: "eric@EXAMPLE.com" }));
    assert.equal(m?.score, 100);
  });
  it("does not email-match when guide email is null", () => {
    const m = scoreMatch(guide({ email: null }), profile());
    // Names still match → falls through to name scoring, but NOT 100.
    assert.notEqual(m?.score, 100);
  });
});

describe("scoreMatch — name signal", () => {
  it("scores 80 on exact name match (no email match)", () => {
    const m = scoreMatch(
      guide({ email: null }),
      profile({ email: "different@example.com" }),
    );
    assert.equal(m?.score, 80);
    assert.equal(m?.reason, "exact name match");
  });
  it("scores in the 40–70 band on partial token overlap (>=2 tokens)", () => {
    const m = scoreMatch(
      guide({ email: null, name: "Eric R Stoffer" }),
      profile({ email: "x@y.com", full_name: "Eric Stoffer" }),
    );
    assert.ok(m, "expected a match");
    assert.ok(m.score >= 40 && m.score <= 70, `expected 40..70 band, got ${m.score}`);
    assert.match(m.reason, /name tokens match/);
  });
  it("normalizes whitespace and case before the exact-equal check", () => {
    const m = scoreMatch(
      guide({ email: null, name: "  Eric Stoffer  " }),
      profile({ email: "x@y.com", full_name: "ERIC STOFFER" }),
    );
    assert.equal(m?.score, 80);
    assert.equal(m?.reason, "exact name match");
  });
  it("does NOT match on single first-name overlap when both sides have multiple tokens (too noisy)", () => {
    // "Eric Adams" vs "Eric Smith" — only "eric" overlaps, both 2-token.
    // overlap == 1, minTokens == 2 → fails the >=2 rule AND fails the
    // single-token-both-sides rule.
    const m = scoreMatch(
      guide({ email: null, name: "Eric Adams" }),
      profile({ email: "x@y.com", full_name: "Eric Smith" }),
    );
    assert.equal(m, null);
  });
  it("returns null when guide and profile names are both empty", () => {
    const m = scoreMatch(
      guide({ email: null, name: "" }),
      profile({ email: "x@y.com", full_name: null }),
    );
    assert.equal(m, null);
  });
});

describe("rankMatches", () => {
  it("orders candidates by score desc, drops zeros", () => {
    const g = guide({ email: "eric@example.com", name: "Eric Stoffer" });
    const profiles = [
      profile({ id: "p-noise", email: "nobody@x.com", full_name: "Other Person" }),
      profile({ id: "p-name", email: "different@x.com", full_name: "Eric Stoffer" }),
      profile({ id: "p-email", email: "eric@example.com", full_name: "Unrelated Name" }),
    ];
    const ranked = rankMatches(g, profiles);
    assert.deepEqual(
      ranked.map((c) => c.profile_id),
      ["p-email", "p-name"], // p-noise filtered out (zero score)
    );
    assert.ok(ranked[0].score > ranked[1].score, "email match outranks name match");
  });
  it("returns empty array when no profile matches", () => {
    const g = guide({ email: null, name: "Stranger McUnknown" });
    const profiles = [profile({ email: "x@y.com", full_name: "Eric Stoffer" })];
    assert.deepEqual(rankMatches(g, profiles), []);
  });
  it("handles the email-null + name-only path (the documented sandbox case)", () => {
    // Sandbox returns email: null for the seeded guide. Phase 1.8 acceptance:
    // we still surface a match suggestion based on name alone.
    const g = guide({ email: null, name: "Eric Stoffer" });
    const profiles = [profile({ email: "eric@brewboat.local", full_name: "Eric Stoffer" })];
    const ranked = rankMatches(g, profiles);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].score, 80);
    assert.equal(ranked[0].reason, "exact name match");
  });
});
