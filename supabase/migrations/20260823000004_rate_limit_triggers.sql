-- Rate limiting. Source of truth: docs/REALTIME.md "Rate Limiting & Abuse Prevention".
-- Enforced via BEFORE INSERT triggers (not application code) since these tables are
-- written directly from the client via supabase-js — a client-side-only check could
-- be bypassed by calling the API differently.
--
-- Note on the "reactions" limit: docs/REALTIME.md separately calls out a 5-distinct-
-- emoji-per-pick cap and a 30/min toggle cap. Since `reactions` has a unique
-- (pick_id, user_id, emoji) constraint, every "add" is necessarily an INSERT —
-- counting INSERTs alone already bounds add-reaction spam, so both are implemented
-- as INSERT-time checks below without a separate delete-tracking mechanism.

create or replace function enforce_chat_rate_limit()
returns trigger as $$
begin
  if (
    select count(*) from chat_messages
    where sender_id = new.sender_id
      and message_type = 'message'
      and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Rate limit exceeded: max 20 messages per minute';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger chat_rate_limit
  before insert on chat_messages
  for each row
  when (new.message_type = 'message')
  execute function enforce_chat_rate_limit();

create or replace function enforce_dm_rate_limit()
returns trigger as $$
begin
  if (
    select count(*) from direct_messages
    where sender_id = new.sender_id
      and created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Rate limit exceeded: max 20 direct messages per minute';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger dm_rate_limit
  before insert on direct_messages
  for each row execute function enforce_dm_rate_limit();

create or replace function enforce_reaction_rate_limit()
returns trigger as $$
begin
  -- Max 5 distinct emoji per user per pick (the unique constraint already
  -- blocks re-adding the same emoji, this bounds variety)
  if (
    select count(distinct emoji) from reactions
    where pick_id = new.pick_id and user_id = new.user_id
  ) >= 5 then
    raise exception 'Rate limit exceeded: max 5 distinct reactions per pick';
  end if;

  -- Max 30 reaction adds per user per minute, across all picks
  if (
    select count(*) from reactions
    where user_id = new.user_id
      and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'Rate limit exceeded: max 30 reactions per minute';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger reaction_rate_limit
  before insert on reactions
  for each row execute function enforce_reaction_rate_limit();
