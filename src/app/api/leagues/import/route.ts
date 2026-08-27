import { importSleeperLeague, LeagueImportError } from "@/lib/leagues/import";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sleeperLeagueId = typeof body?.sleeperLeagueId === "string" ? body.sleeperLeagueId : "";

  try {
    const result = await importSleeperLeague(sleeperLeagueId);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof LeagueImportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
