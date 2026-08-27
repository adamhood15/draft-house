"use server";

import { redirect } from "next/navigation";
import {
  importSleeperLeague,
  lookupSleeperLeagues,
  LeagueImportError,
} from "@/lib/leagues/import";
import type { ImportState, LookupState } from "@/lib/leagues/state";

export async function lookupLeagues(
  _prevState: LookupState,
  formData: FormData
): Promise<LookupState> {
  const username = String(formData.get("username") ?? "");

  try {
    const { leagues } = await lookupSleeperLeagues(username);
    return {
      error: null,
      leagues: leagues.map((l) => ({
        league_id: l.league_id,
        name: l.name,
        season: l.season,
        total_rosters: l.total_rosters,
      })),
    };
  } catch (error) {
    if (error instanceof LeagueImportError) {
      return { error: error.message, leagues: null };
    }
    throw error;
  }
}

export async function importLeague(
  _prevState: ImportState,
  formData: FormData
): Promise<ImportState> {
  const sleeperLeagueId = String(formData.get("sleeperLeagueId") ?? "");

  let leagueId: string;
  try {
    ({ leagueId } = await importSleeperLeague(sleeperLeagueId));
  } catch (error) {
    if (error instanceof LeagueImportError) {
      return { error: error.message, existingLeagueId: error.existingLeagueId ?? null };
    }
    throw error;
  }

  redirect(`/leagues/${leagueId}/setup`);
}
