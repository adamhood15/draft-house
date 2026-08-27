import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function LeagueLobbyPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league } = await supabase
    .from("leagues")
    .select("commissioner_id")
    .eq("id", leagueId)
    .single();

  const isCommissioner = user && league?.commissioner_id === user.id;

  return (
    <div className="flex flex-col items-center gap-3 p-16 text-center">
      <p className="text-sm text-ink/70">Draft lobby for {leagueId} — coming soon.</p>
      {isCommissioner && (
        <Link href={`/leagues/${leagueId}/setup`} className="text-sm font-bold text-purple underline">
          League Settings
        </Link>
      )}
    </div>
  );
}
