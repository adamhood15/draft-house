export type ImportState = { error: string | null; existingLeagueId?: string | null };

export const initialImportState: ImportState = { error: null };

export type LookupLeague = {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
};

export type LookupState = {
  error: string | null;
  leagues: LookupLeague[] | null;
};

export const initialLookupState: LookupState = { error: null, leagues: null };

export type SettingsState = { error: string | null };

export const initialSettingsState: SettingsState = { error: null };

export type ClaimState = { error: string | null };

export const initialClaimState: ClaimState = { error: null };
