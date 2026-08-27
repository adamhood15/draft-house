-- Adds the pre-draft "start with no timer" default the commissioner sets on
-- the setup page (docs/DATABASE.md#3-draft_settings). Separate from
-- draft_state.timer_active, the live runtime toggle this seeds when a draft
-- is initialized — see docs/DRAFT_ENGINE.md#timer-management.
alter table draft_settings
  add column timer_enabled boolean not null default true;
