"use client";

import { useActionState } from "react";

import { updateProfileRoles, type ActionResult } from "@/app/admin/staff/actions";
import { Button } from "@/components/ui/button";

interface ProfileEditFormProps {
  profileId: string;
  initial: {
    is_admin: boolean;
    is_captain: boolean;
    is_mate: boolean;
    is_shore: boolean;
    boat_quals: string[];
  };
}

const ROLE_FIELDS = [
  { name: "is_admin", label: "Admin" },
  { name: "is_captain", label: "Captain" },
  { name: "is_mate", label: "Mate" },
  { name: "is_shore", label: "Shore" },
] as const;

export function ProfileEditForm({ profileId, initial }: ProfileEditFormProps) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => updateProfileRoles(formData),
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-2" data-testid={`profile-edit-${profileId}`}>
      <input type="hidden" name="profile_id" value={profileId} />
      <div className="flex flex-wrap gap-3 text-xs">
        {ROLE_FIELDS.map((role) => (
          <label key={role.name} className="flex items-center gap-1">
            <input
              type="checkbox"
              name={role.name}
              defaultChecked={initial[role.name]}
              className="size-3 accent-primary"
            />
            <span>{role.label}</span>
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Boat qualifications (comma-separated)</span>
        <input
          name="boat_quals"
          defaultValue={initial.boat_quals.join(", ")}
          placeholder="e.g. Brewboat A, Brewboat B"
          className="rounded-md border border-input bg-background px-2 py-1"
        />
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state?.ok && (
          <span className="text-xs text-muted-foreground" data-testid={`profile-edit-result-${profileId}`}>
            Saved.
          </span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-destructive">{state.error ?? "Save failed."}</span>
        )}
      </div>
    </form>
  );
}
