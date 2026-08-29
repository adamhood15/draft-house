-- Re-importing a soft-deleted league was permanently impossible.
--
-- 20260823000001_core_tables.sql declared `sleeper_league_id text not null unique`,
-- a constraint over ALL rows, while leagues are soft-deleted via `deleted_at`
-- (docs/DATABASE.md#1-soft-deletes-for-leagues). The import duplicate pre-check in
-- src/lib/leagues/import.ts filters `.is("deleted_at", null)`, so the two disagreed
-- about what "already imported" means: after a soft delete the pre-check passes, the
-- insert then trips the unique constraint, and the failure surfaces as the generic
-- 500 "Failed to import league. Please try again." — never the 409 with its "Go to
-- it" link. There was no way back for that league.
--
-- Scoping uniqueness to live rows makes the constraint say what the application
-- means. Soft-deleted rows may now repeat a sleeper_league_id, which is the point:
-- delete-then-reimport works, and the old row is still retained for history
-- (docs/DATABASE.md#data-retention--archival).
--
-- No column is added or altered; nullability, defaults and the write path for
-- `leagues.sleeper_league_id` are unchanged (service-role only, written by import).

-- Named lookup rather than a hardcoded name, so a constraint applied under a
-- different name is still found — and its absence fails loudly instead of leaving
-- the old all-rows constraint quietly in place.
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'leagues'
    and con.contype = 'u'
    and con.conkey = array[
      (select attnum from pg_attribute
        where attrelid = rel.oid and attname = 'sleeper_league_id')
    ]::smallint[];

  if constraint_name is null then
    raise exception
      'Expected an all-rows unique constraint on leagues.sleeper_league_id; found none. Verify the schema before applying this migration.';
  end if;

  execute format('alter table leagues drop constraint %I', constraint_name);
end;
$$;

-- Strictly narrower than the constraint it replaces (live rows are a subset of all
-- rows), so this cannot fail on existing data.
create unique index leagues_sleeper_league_id_live_key
  on leagues (sleeper_league_id)
  where deleted_at is null;

-- Note: dropping the constraint also drops the index backing it. Lookups by
-- sleeper_league_id that do NOT filter on deleted_at remain covered by
-- idx_leagues_sleeper_league_id from 20260823000002_indexes.sql.
