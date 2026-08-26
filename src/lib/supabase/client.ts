import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components. Subject to RLS as the
 * signed-in user — see docs/REALTIME.md for the policy set.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
