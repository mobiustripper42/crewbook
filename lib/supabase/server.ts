// Server-only admin Supabase client. Bypasses RLS via the service-role key,
// so guard the surface — only background sync code (Phase 1.x mirror loaders,
// Phase 4 write-back) should import this. Per-request auth-aware clients are
// a separate concern (Phase 5 admin UI).
//
// TODO Phase 5: add `import "server-only";` once the package is installed
// alongside the per-request supabase client. Today, file-naming convention
// (`server.ts`) and the absence of any 'use client' importer is the guard.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types.ts";

let cached: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  cached = createClient<Database>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
