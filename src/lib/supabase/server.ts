import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers
 * acting as the requesting user. Subject to RLS — see docs/REALTIME.md.
 *
 * Cookie writes silently no-op when called from a Server Component (Next.js
 * only allows cookie mutation from Server Actions/Route Handlers); that's
 * expected as long as middleware or a Server Action refreshes the session.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — ignore, see note above.
          }
        },
      },
    }
  );
}
