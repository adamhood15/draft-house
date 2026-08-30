-- leagues.scoring_format is a closed set of three values, enforced only in TypeScript.
--
-- `leagues` (20260823000001_core_tables.sql) declares scoring_format as bare
-- `text not null`. The value is a label collapsed from Sleeper's scoring_settings
-- map by deriveScoringFormat in src/lib/sleeper/transform.ts, which can only ever
-- return 'std' | 'half_ppr' | 'ppr' — Sleeper exposes no scoring format field, so
-- the label is ours, derived from scoring_settings.rec (0 / 0.5 / 1).
--
-- Downstream the value is not decorative. docs/SLEEPER.md#player-rankings-for-auto-draft
-- maps it onto the ADP source's path segment (std→standard, ppr→ppr,
-- half_ppr→half-ppr), so an unrecognized label doesn't fail at write time — it
-- fails much later, when auto-draft goes to fetch rankings for a format that
-- doesn't exist. The same shape of deferred failure that
-- 20260828000002_teams_one_claim_per_user.sql closed for team claims.
--
-- Application code already validates on the one client-reachable path:
-- updateLeagueSettings (src/lib/leagues/settings.ts) rejects anything outside the
-- three before its update, and the Select in setup/league-settings-form.tsx offers
-- only those options. That check stays — this constraint is not a replacement for
-- it, because a rejected form gives the commissioner a message and a 23514 gives
-- them a failed save. It covers the writers that bypass that path entirely:
-- scripts/seed-from-sleeper.js and the admin-client import in
-- src/lib/leagues/import.ts both write scoring_format under the service role,
-- where RLS and the server action's validation are equally absent.
--
-- Note this deliberately does NOT constrain draft_format or draft_status, which
-- have the same bare-text gap (see the comment in settings.ts). Those are separate
-- value sets with their own call sites and belong in their own migration.

-- Fail before the DDL with an actionable message rather than an opaque 23514: the
-- environment this migration is applied to may hold rows written before the
-- application-side check existed, or by a script that never had one.
do $$
declare
  invalid_count integer;
  sample text;
begin
  select count(*) into invalid_count
  from leagues
  where scoring_format not in ('std', 'half_ppr', 'ppr');

  if invalid_count > 0 then
    select coalesce(string_agg(detail, '; '), '') into sample
    from (
      select format('league %s (%s): %L', id, name, scoring_format) as detail
      from leagues
      where scoring_format not in ('std', 'half_ppr', 'ppr')
      limit 10
    ) sampled;

    raise exception
      'Cannot add leagues_scoring_format_check: % row(s) hold a value outside (std, half_ppr, ppr). Resolve them first — pick the label matching the league''s scoring_settings.rec (0 = std, 0.5 = half_ppr, 1 = ppr). First 10: %',
      invalid_count, sample;
  end if;
end;
$$;

alter table leagues
  add constraint leagues_scoring_format_check
  check (scoring_format in ('std', 'half_ppr', 'ppr'));

-- Adding a value to this set is a three-place change: this constraint, the
-- deriveScoringFormat return type in src/lib/sleeper/transform.ts, and the
-- allow-list in updateLeagueSettings. Changing one alone either rejects a value
-- the app now produces, or reopens the gap this closes.
