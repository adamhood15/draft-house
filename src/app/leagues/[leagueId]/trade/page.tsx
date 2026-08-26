export default async function LeagueTradePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return <p>Trades for {leagueId} — coming soon.</p>;
}
