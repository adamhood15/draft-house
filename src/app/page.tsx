import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = data?.display_name ?? null;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-16 text-center">
      <Wordmark />
      {user ? (
        <>
          <p className="text-sm text-ink/70">
            Signed in as <span className="font-bold">{displayName ?? user.id}</span>
          </p>
          <div className="flex gap-3">
            <Link
              href="/leagues/new"
              className="rounded-lg border-2 border-ink bg-green px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[3px_3px_0_var(--ink)]"
            >
              Import a League
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="secondary">
                Log Out
              </Button>
            </form>
          </div>
        </>
      ) : (
        <div className="flex gap-3">
          <Link
            href="/login"
            className="rounded-lg border-2 border-ink bg-background px-4 py-2 text-sm font-bold uppercase tracking-wide shadow-[3px_3px_0_var(--ink)]"
          >
            Log In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border-2 border-ink bg-green px-4 py-2 text-sm font-bold uppercase tracking-wide text-white shadow-[3px_3px_0_var(--ink)]"
          >
            Sign Up
          </Link>
        </div>
      )}
    </div>
  );
}
