export default async function LeagueLobbyPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <p>Draft lobby for {leagueId} — coming soon.</p>;
}
