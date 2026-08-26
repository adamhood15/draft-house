export default async function DraftRoomPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <p>Draft room for {leagueId} — coming soon.</p>;
}
