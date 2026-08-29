-- One team per user per league was enforced only in application code, and it raced.
--
-- `teams` (20260823000001_core_tables.sql) carries no unique constraint on
-- (league_id, owner_id). claimTeam in src/lib/leagues/team-actions.ts read for an
-- existing claim and then updated — two concurrent submissions could both read "no
-- existing claim" and both succeed on different teams. Downstream,
-- getUserClaimedTeamId in src/lib/leagues/teams.ts uses `.maybeSingle()`, which on two
-- rows returns `{ data: null, error: PGRST116 }` rather than throwing; that call site
-- discarded the error, so a duplicate made the user read as owning NO team and routed
-- them back into claiming another. Quieter than a throw, and worse for it.
--
-- The per-TEAM half of the invariant was already correct and is the model followed
-- here: the update at team-actions.ts guards with `.is("owner_id", null)`, so
-- claiming a given team is atomic. Only the per-USER half was unguarded — this index
-- closes it in the database, where concurrency is actually decidable.
--
-- Partial on `owner_id is not null` because unclaimed teams are the normal state and
-- many of them coexist per league; NULLs are excluded from the index entirely rather
-- than relying on NULL-distinctness semantics.
--
-- No column is added or altered. `teams.owner_id` keeps its existing definition
-- (nullable, no default, FK to users(id) on delete set null) and its existing write
-- path — service-role only, via the admin client in team-actions.ts. This migration
-- grants no client write access, so no SECURITY sign-off is required.

-- Fail before the DDL with an actionable message rather than an opaque unique
-- violation: the race this index prevents may already have fired in an environment
-- other than the one checked when this migration was written.
do $$
declare
  duplicate_count integer;
  sample text;
begin
  select count(*) into duplicate_count
  from (
    select 1
    from teams
    where owner_id is not null
    group by league_id, owner_id
    having count(*) > 1
  ) all_duplicates;

  if duplicate_count > 0 then
    select coalesce(string_agg(detail, '; '), '') into sample
    from (
      select format('league %s / owner %s: %s teams', league_id, owner_id, count(*)) as detail
      from teams
      where owner_id is not null
      group by league_id, owner_id
      having count(*) > 1
      limit 10
    ) sampled;

    raise exception
      'Cannot add one-claim-per-user index: % duplicate (league_id, owner_id) group(s) exist. Resolve them first (release the unintended claim by setting teams.owner_id to null). First 10: %',
      duplicate_count, sample;
  end if;
end;
$$;

create unique index teams_one_claim_per_user
  on teams (league_id, owner_id)
  where owner_id is not null;

-- This index and the application code are a pair. Both call sites above now handle
-- the states it makes reachable: claimTeam treats a 23505 at the update as "you
-- already have a team" and redirects to the lobby rather than reporting a generic
-- error or falsely blaming another claimer, and getUserClaimedTeamId throws on
-- PGRST116 instead of answering "owns no team". Dropping this index would not break
-- that code — 23505 simply stops occurring — but it would restore the silent
-- double-claim the handlers exist to make impossible.
