-- Storage for team customization (docs/DESIGN.md#18-team-customization-screen,
-- docs/AUDIO.md#upload-technical-details). Public buckets: images/audio are
-- meant to be viewable by anyone with the URL (draft room, invite page),
-- same trust level as team_image_url already pulled from Sleeper's public CDN.
--
-- No storage.objects policies needed: all writes go through the admin
-- client server-side (see src/lib/storage.ts), the same pattern already
-- used for leagues/draft_settings/teams — never the browser directly.
insert into storage.buckets (id, name, public)
values
  ('team-images', 'team-images', true),
  ('walk-up-songs', 'walk-up-songs', true)
on conflict (id) do nothing;
