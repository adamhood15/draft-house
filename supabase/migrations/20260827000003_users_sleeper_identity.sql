-- Remembers which Sleeper account a Draft House user looked up, so the home
-- page can show their other Sleeper leagues (not yet imported) without
-- asking for the username again. Set best-effort on lookup — see
-- src/lib/leagues/import.ts's lookupSleeperLeagues.
--
-- Deliberately not a cached leagues list: the set of leagues Sleeper reports
-- for that user is fetched live each time (see getAvailableSleeperLeagues),
-- since a stored snapshot would drift as Sleeper league membership changes.
alter table users
  add column sleeper_user_id text,
  add column sleeper_username text;

create unique index idx_users_sleeper_user_id on users(sleeper_user_id)
  where sleeper_user_id is not null;
