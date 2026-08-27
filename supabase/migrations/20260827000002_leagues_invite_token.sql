-- Shareable invite link token (docs/ARCHITECTURE.md's "Generate Shareable
-- Invite Link" / docs/DATABASE.md#2-leagues). A separate column rather than
-- reusing leagues.id so the link is regenerable later without touching the
-- league's real identity. gen_random_uuid() as a non-constant default also
-- backfills a distinct token for any pre-existing rows, not just new ones.
alter table leagues
  add column invite_token uuid not null unique default gen_random_uuid();
