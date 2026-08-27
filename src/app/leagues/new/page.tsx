import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export default async function NewLeaguePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/leagues/new");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-2xl">IMPORT YOUR LEAGUE</h1>
        <p className="text-sm text-ink/70">
          Enter your Sleeper username to see your leagues, then pick one to bring in its roster
          construction, teams, and draft settings.
        </p>
      </div>
      <div className="w-full max-w-sm rounded-xl border-2 border-ink bg-white p-6 shadow-[5px_5px_0_var(--ink)]">
        <ImportForm />
      </div>
    </div>
  );
}
