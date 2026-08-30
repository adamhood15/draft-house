import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS entirely — this is the ONLY
 * place allowed to write to the server-authoritative draft-mechanics tables
 * (draft_picks, rosters), which have no client-facing write policies by design
 * (see docs/REALTIME.md, "Core principle").
 *
 * `drafts` is the one table that is partly client-writable: drafts_update RLS
 * lets the commissioner change the draft settings, and a column grant keeps the
 * live clock (current_pick_no, timer_*, started_at) out of that set. Those
 * columns still belong here. Never import this into a Client Component; the
 * `server-only` import above makes that a build error if it happens anyway.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
