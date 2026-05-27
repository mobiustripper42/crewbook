// Phase 1.8 — Staff cross-reference admin page.
//
// Lists every Xola guide (mirror table) alongside its linked BrewBoat
// profile (if any). For unlinked guides, surfaces the auto-match
// suggestion + a "create new profile" fallback. Drew always confirms;
// no silent auto-link.
//
// Auth gap (same as /admin/reservations): publicly reachable until
// Phase 5.1 magic-link + is_admin() gate ships. Documented in code; uses
// the service-role client.

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { ProfileEditForm } from "@/components/admin/profile-edit-form";

import {
  createProfileFromGuide,
  linkGuideToProfile,
  unlinkGuide,
} from "./actions";
import { rankMatches, type GuideForMatch, type ProfileForMatch } from "./match";

// Force SSR on every request — without this, Next pre-renders at build
// time and the page captures whatever was in the DB during the build
// instead of the current state. /admin/reservations doesn't need this
// because `await searchParams` already opts it into dynamic.
export const dynamic = "force-dynamic";

// Server-Component <form action={...}> requires void-returning handlers.
// The underlying actions return ActionResult for the Client Component edit
// form; these adapters discard the return for the per-row Server forms.
// The error path is currently swallowed — V1 acceptable because admin will
// see the un-changed row state on revalidate and re-try.
async function linkAction(formData: FormData): Promise<void> {
  "use server";
  await linkGuideToProfile(formData);
}
async function unlinkAction(formData: FormData): Promise<void> {
  "use server";
  await unlinkGuide(formData);
}
async function createAction(formData: FormData): Promise<void> {
  "use server";
  await createProfileFromGuide(formData);
}

interface GuideRow {
  id: string;
  name: string;
  email: string | null;
  seller_id: string;
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_captain: boolean;
  is_mate: boolean;
  is_shore: boolean;
  boat_quals: string[];
  xola_guide_id: string | null;
  auth_user_id: string | null;
}

export default async function AdminStaffPage() {
  const supabase = getSupabaseAdmin();
  const [guidesRes, profilesRes] = await Promise.all([
    supabase.from("xola_guides").select("id, name, email, seller_id").order("name"),
    supabase
      .from("profiles")
      .select(
        "id, email, full_name, is_admin, is_captain, is_mate, is_shore, boat_quals, xola_guide_id, auth_user_id",
      )
      .order("full_name", { nullsFirst: false }),
  ]);

  const errors: string[] = [];
  if (guidesRes.error) errors.push(`xola_guides: ${guidesRes.error.message}`);
  if (profilesRes.error) errors.push(`profiles: ${profilesRes.error.message}`);

  const guides: GuideRow[] = guidesRes.data ?? [];
  const profiles: ProfileRow[] = (profilesRes.data ?? []).map((p) => ({
    ...p,
    boat_quals: Array.isArray(p.boat_quals) ? (p.boat_quals as string[]) : [],
  }));

  const profilesByGuideId = new Map<string, ProfileRow>();
  for (const p of profiles) {
    if (p.xola_guide_id) profilesByGuideId.set(p.xola_guide_id, p);
  }
  const orphanedProfiles = profiles.filter((p) => !p.xola_guide_id);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-lg font-medium">Staff Cross-Reference</h1>
        <p className="text-xs text-muted-foreground">
          {guides.length} Xola guide{guides.length === 1 ? "" : "s"} ·{" "}
          {profilesByGuideId.size} linked · {guides.length - profilesByGuideId.size} unlinked ·{" "}
          {orphanedProfiles.length} profile{orphanedProfiles.length === 1 ? "" : "s"} without a Xola guide
        </p>
      </header>

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <p className="font-medium">Could not load:</p>
          <ul className="mt-1 list-disc pl-4">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="flex flex-col gap-3" data-testid="guides-section">
        <h2 className="text-sm font-medium">Xola Guides</h2>
        {guides.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No Xola guides synced yet. Run the Xola guide sync to populate this list.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {guides.map((guide) => (
              <GuideCard
                key={guide.id}
                guide={guide}
                linkedProfile={profilesByGuideId.get(guide.id) ?? null}
                allProfiles={profiles}
              />
            ))}
          </ul>
        )}
      </section>

      {orphanedProfiles.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="orphans-section">
          <h2 className="text-sm font-medium">Profiles without a Xola guide</h2>
          <p className="text-xs text-muted-foreground">
            These profiles exist but aren&apos;t linked to a guide. They might be admin-only
            (Drew) or pre-Phase-5.1 placeholders. Link them from a guide above, or leave
            unlinked if intentional.
          </p>
          <ul className="flex flex-col gap-3">
            {orphanedProfiles.map((profile) => (
              <li
                key={profile.id}
                className="rounded-md border border-border p-3"
                data-testid={`orphan-${profile.id}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div className="text-sm">
                    {profile.full_name ?? <span className="italic">(no name)</span>}
                    <span className="ml-2 text-xs text-muted-foreground">{profile.email}</span>
                  </div>
                  <RoleBadges profile={profile} />
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Edit roles
                  </summary>
                  <div className="mt-2">
                    <ProfileEditForm
                      profileId={profile.id}
                      initial={{
                        is_admin: profile.is_admin,
                        is_captain: profile.is_captain,
                        is_mate: profile.is_mate,
                        is_shore: profile.is_shore,
                        boat_quals: profile.boat_quals,
                      }}
                    />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

interface GuideCardProps {
  guide: GuideRow;
  linkedProfile: ProfileRow | null;
  allProfiles: ProfileRow[];
}

function GuideCard({ guide, linkedProfile, allProfiles }: GuideCardProps) {
  const guideForMatch: GuideForMatch = {
    id: guide.id,
    name: guide.name,
    email: guide.email,
  };
  // Auto-match against unlinked profiles only — already-linked profiles
  // would just confuse the picker.
  const unlinkedProfiles: ProfileForMatch[] = allProfiles
    .filter((p) => !p.xola_guide_id)
    .map((p) => ({ id: p.id, email: p.email, full_name: p.full_name }));
  const matches = rankMatches(guideForMatch, unlinkedProfiles);
  const topMatchId = matches[0]?.profile_id;

  return (
    <li
      className="rounded-md border border-border p-3"
      data-testid={`guide-${guide.id}`}
      data-linked={linkedProfile ? "true" : "false"}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <div className="text-sm font-medium">{guide.name}</div>
          <div className="text-xs text-muted-foreground">
            {guide.email ?? <span className="italic">no email</span>}
            <span className="ml-2 font-mono text-[0.625rem]">{guide.id.slice(-8)}</span>
          </div>
        </div>
        {linkedProfile && <RoleBadges profile={linkedProfile} />}
      </div>

      {linkedProfile ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">
            Linked to <span className="font-medium text-foreground">{linkedProfile.full_name ?? linkedProfile.email}</span>
            {linkedProfile.auth_user_id ? " · has auth" : " · no auth yet"}
          </div>
          <form action={unlinkAction}>
            <input type="hidden" name="profile_id" value={linkedProfile.id} />
            <button
              type="submit"
              className="text-xs text-destructive underline-offset-2 hover:underline"
              data-testid={`unlink-${guide.id}`}
            >
              Unlink
            </button>
          </form>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Edit roles
            </summary>
            <div className="mt-2">
              <ProfileEditForm
                profileId={linkedProfile.id}
                initial={{
                  is_admin: linkedProfile.is_admin,
                  is_captain: linkedProfile.is_captain,
                  is_mate: linkedProfile.is_mate,
                  is_shore: linkedProfile.is_shore,
                  boat_quals: linkedProfile.boat_quals,
                }}
              />
            </div>
          </details>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <form action={linkAction} className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Link to existing profile</label>
            <input type="hidden" name="guide_id" value={guide.id} />
            <div className="flex gap-2">
              <select
                name="profile_id"
                defaultValue={topMatchId ?? ""}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                data-testid={`link-select-${guide.id}`}
                aria-label={`Pick a profile to link to ${guide.name}`}
              >
                <option value="">— pick a profile —</option>
                {unlinkedProfiles.map((p) => {
                  const match = matches.find((m) => m.profile_id === p.id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.full_name ?? p.email}
                      {match ? ` — ${match.reason}` : ""}
                    </option>
                  );
                })}
              </select>
              <button
                type="submit"
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                data-testid={`link-btn-${guide.id}`}
              >
                Link
              </button>
            </div>
            {topMatchId && (
              <span className="text-[0.625rem] text-muted-foreground">
                Auto-suggested: {matches[0].reason}
              </span>
            )}
          </form>
          <form action={createAction}>
            <input type="hidden" name="guide_id" value={guide.id} />
            <button
              type="submit"
              className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
              data-testid={`create-${guide.id}`}
            >
              Create new profile from this guide
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function RoleBadges({ profile }: { profile: ProfileRow }) {
  const roles: string[] = [];
  if (profile.is_admin) roles.push("admin");
  if (profile.is_captain) roles.push("captain");
  if (profile.is_mate) roles.push("mate");
  if (profile.is_shore) roles.push("shore");
  if (roles.length === 0) return <span className="text-xs text-muted-foreground italic">no roles</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-foreground"
        >
          {r}
        </span>
      ))}
    </div>
  );
}
