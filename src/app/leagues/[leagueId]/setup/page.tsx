export default async function LeagueSetupPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <p>League setup for {leagueId} — coming soon.</p>;
}
