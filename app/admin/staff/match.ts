// Phase 1.8 — pure auto-match scorer. Given a Xola guide and the existing
// profile list, rank profiles by how confidently they look like "the same
// person." Drew always confirms the link via the picker — this just
// surfaces the most likely candidate so the common case is one click.
//
// Scoring is deliberately coarse (whole-number bands) because the admin
// is the final arbiter and the UI shows the underlying signal. Don't
// over-engineer; the cost of a wrong auto-suggest is one extra click.

export interface GuideForMatch {
  id: string;
  name: string;
  email: string | null;
}

export interface ProfileForMatch {
  id: string;
  email: string;
  full_name: string | null;
}

export interface MatchCandidate {
  profile_id: string;
  score: number;
  // Why this profile matched — surfaced in the admin UI as a tooltip so
  // Drew can see "matched by email" vs "matched by name only" at a glance.
  reason: string;
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// Tokens of an English-ish name: split on whitespace + drop empties.
// "Eric  Stoffer" → ["eric", "stoffer"]. "O'Hara" stays one token (we
// don't try to split punctuation — too easy to over-trim "St. James").
function nameTokens(name: string | null | undefined): string[] {
  return normalize(name).split(/\s+/).filter((t) => t.length > 0);
}

// Score a single (guide, profile) pair. Returns 0 when nothing matches.
export function scoreMatch(guide: GuideForMatch, profile: ProfileForMatch): MatchCandidate | null {
  // Email-equal beats everything. It's the strongest signal Xola gives.
  const guideEmail = normalize(guide.email);
  const profileEmail = normalize(profile.email);
  if (guideEmail && profileEmail && guideEmail === profileEmail) {
    return { profile_id: profile.id, score: 100, reason: "email match" };
  }

  // Name comparison — only meaningful when both sides have a name.
  const guideName = normalize(guide.name);
  const profileName = normalize(profile.full_name);
  if (!guideName || !profileName) return null;

  if (guideName === profileName) {
    return { profile_id: profile.id, score: 80, reason: "exact name match" };
  }

  // Token overlap — pick up "Eric Stoffer" vs "Eric R Stoffer" (middle
  // initial added) without false-positives like "Eric Adams" vs "Eric Smith".
  const guideTokens = nameTokens(guide.name);
  const profileTokens = nameTokens(profile.full_name);
  if (guideTokens.length === 0 || profileTokens.length === 0) return null;

  const profileSet = new Set(profileTokens);
  let overlap = 0;
  for (const t of guideTokens) {
    if (profileSet.has(t)) overlap++;
  }

  // Require at least 2 token overlap OR overlap == both-have-1-token. A
  // single-token first-name match alone is too noisy (multiple "Erics").
  const minTokens = Math.min(guideTokens.length, profileTokens.length);
  if (overlap >= 2) {
    const pct = overlap / minTokens;
    return {
      profile_id: profile.id,
      score: Math.round(40 + pct * 30), // 40..70 band
      reason: `${overlap}/${minTokens} name tokens match`,
    };
  }

  return null;
}

// Rank all profiles against one guide. Highest score first. Filter out
// zero-score candidates entirely — they're noise.
export function rankMatches(
  guide: GuideForMatch,
  profiles: readonly ProfileForMatch[],
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];
  for (const profile of profiles) {
    const c = scoreMatch(guide, profile);
    if (c) candidates.push(c);
  }
  return candidates.sort((a, b) => b.score - a.score);
}
