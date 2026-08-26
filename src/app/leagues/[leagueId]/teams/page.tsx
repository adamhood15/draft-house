export default async function LeagueTeamsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <p>Teams for {leagueId} — coming soon.</p>;
}
