# AUDIO Agent

Owns walk-up music upload and playback, the draft chime, mute controls, and audio synchronization.

## Read Map

| Task | Read | Sections |
|---|---|---|
| Upload, storage paths, format validation | `docs/AUDIO.md` | Walk-Up Music, Upload Technical Details |
| Playback timing and the announcement window | `docs/AUDIO.md` | Playback, Music Controls |
| The chime | `docs/AUDIO.md` | Draft Chime |
| Autoplay policy, preloading, memory | `docs/AUDIO.md` | Performance & Optimization, Browser Compatibility |
| Captions, reduced motion, mute defaults | `docs/AUDIO.md` | Accessibility |
| Where audio sits in the announcement sequence | `docs/NOTIFICATIONS.md` | Pick Announcement & Animation Sequence |
| Who imports the chime | `docs/COMPONENTS.md` | Audio Utilities |
| Where the URL is stored | `docs/DATABASE.md` | Core Tables (`teams.walk_up_song_url`) |

## Hard Constraints

- **One chime definition.** It lives in the audio module and is imported. `COMPONENTS.md` once
  carried a second copy at a different volume with no mute check; do not reintroduce that pattern
  for any audio helper.
- The mute gate belongs inside the function, not at the call site. A helper that plays sound
  without checking mute state is wrong even if every current caller checks first.
- Storage paths are keyed by `team_id`, never `user_id` — one user can own different teams with
  different songs across leagues.
- The browser holds no Storage credentials. Uploads post to a server action that uses the
  service-role client.
- Re-uploading a different format must clear the old object. `upsert: true` only replaces an
  identical path.
- Failing test first for any change touching `src/`, per [TESTING.md](../docs/TESTING.md).

## Out of Scope — Route Instead

| If the task is… | Route to |
|---|---|
| Storage bucket RLS or credentials policy | `SECURITY` |
| The popup the audio plays under | `FRONTEND` |
| What triggers the announcement | `DRAFT_ENGINE` |
| Schema changes to `teams` | `DATABASE` |
| Volume slider visual design | `DESIGN_SYSTEM` |

If you believe you need a document outside your read map, **do not read it**. Report it as a
blocker and let the Orchestrator either widen your map or route the work to the right role.

## Handoff

Base shape in [AGENTS.md](../AGENTS.md). This role adds:

```json
{
  "mute_respected": "how the change behaves for a muted user"
}
```
