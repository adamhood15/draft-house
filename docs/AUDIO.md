# Audio

This document describes how Draft House handles audio playback, specifically walk-up music and draft chimes.

---

## Walk-Up Music

### Overview

Walk-up music is a signature feature of Draft House. When a player is on the clock during **Round 1 only**, their custom song plays for all participants.

### User Experience

```
Round 1, Pick #1
  Adam is on the clock
    ↓
  Adam's walk-up song begins playing
    ↓
  All other users hear it (unless they've muted music)
    ↓
  Adam makes a pick or timer expires
    ↓
  Music stops
  Draft chime plays
    ↓
  Next player's turn begins
    ↓
  Next player's walk-up music plays
```

### Upload Flow

Users upload their walk-up song at two possible times:

1. **During Account Creation**
   ```
   Create Account
     ↓
   Set Password
     ↓
   Upload Walk-Up Song (optional)
     ↓
   Account Created
   ```

2. **When Claiming Team**
   ```
   Click "Claim Team"
     ↓
   Enter Team Name
     ↓
   Choose Team Image
     ↓
   Upload Walk-Up Song (optional)
     ↓
   Team Claimed
   ```

Users can also update their song from team settings later.

### Upload Technical Details

> **Authority: the code wins.** This path has shipped in `src/lib/storage.ts`. This section tracks
> the implementation — if they drift, update this section, not the code.
> Note this is the opposite direction from *Draft Chime* below, in the same file.

**Storage**: Supabase Storage

**Bucket**: `walk-up-songs` (public — see `supabase/migrations/20260827000004_team_storage_buckets.sql`)

**Path structure**: keyed by `team_id`, not `user_id` — `walk_up_song_url` lives on `teams`, and a user can own different teams (with different songs) across leagues.

```
walk-up-songs/
  └── teams/
      ├── {team_id}/song.mp3
      └── {team_id}/song.wav
```

**Constraints**:
- Supported formats: MP3, WAV, OGG, AAC/M4A (`audio/mpeg`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/aac`, `audio/mp4`, `audio/x-m4a`). Browsers report m4a inconsistently, so a recognized *extension* (`mp3`, `wav`, `ogg`, `aac`, `m4a`) is accepted on its own — a file is rejected only when neither signal matches.
- Max file size: 10 MB
- Naming: `teams/{team_id}/song.{ext}` — re-uploading in a different format replaces the old file rather than orphaning it (see `src/lib/storage.ts`)
- All writes go through the admin client server-side (`src/lib/leagues/team-actions.ts`'s `updateTeam`), never the browser directly — same pattern as `leagues`/`draft_settings`/`teams` writes elsewhere in the app. No `storage.objects` RLS policies needed as a result.
- The browser holds no Storage credentials. The client posts the file to the `updateTeam` server action as `FormData`; that action performs the upload with the service-role client and writes `teams.walk_up_song_url`.

**Upload Handler**:

> Spec tracks implementation: the sample below mirrors `src/lib/storage.ts` and
> `src/lib/leagues/team-actions.ts` as shipped. If the two diverge, the code is
> authoritative — update this block rather than the code.

`replaceTeamFile` is shared by walk-up songs and team images, so it takes the bucket and a
name prefix rather than being song-specific:

```typescript
// src/lib/storage.ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateUploadFile, type UploadConstraints } from "@/lib/media-constraints";

export async function replaceTeamFile(
  bucket: string,
  teamId: string,
  namePrefix: "image" | "song",
  file: File,
  constraints: UploadConstraints
): Promise<string> {
  // Authoritative check. The client-side one is only for fast feedback and
  // can't be trusted on its own — a direct POST would skip it entirely.
  const validationError = validateUploadFile(file, constraints);
  if (validationError) {
    throw new Error(validationError);
  }

  const admin = createAdminClient();
  const folder = `teams/${teamId}`;

  // `upsert: true` only replaces an *identical* path, so re-uploading a .wav
  // over an existing .mp3 would orphan the old object. Clear the prefix first.
  await removeTeamFile(bucket, teamId, namePrefix);

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${folder}/${namePrefix}.${ext}`;

  const { error } = await admin.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) {
    throw new Error("Upload failed. Please try again.");
  }

  return admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeTeamFile(
  bucket: string,
  teamId: string,
  namePrefix: "image" | "song"
): Promise<void> {
  const admin = createAdminClient();
  const folder = `teams/${teamId}`;

  const { data: existing } = await admin.storage.from(bucket).list(folder);
  const stale = (existing ?? []).filter((f) => f.name.startsWith(`${namePrefix}.`));
  if (stale.length > 0) {
    await admin.storage.from(bucket).remove(stale.map((f) => `${folder}/${f.name}`));
  }
}
```

Call site, inside the `updateTeam` server action — note that the `teams` update error is
surfaced to the caller rather than discarded:

```typescript
// src/lib/leagues/team-actions.ts
const songFile = formData.get("song");
if (songFile instanceof File && songFile.size > 0) {
  try {
    updates.walk_up_song_url = await replaceTeamFile(
      "walk-up-songs",
      teamId,
      "song",
      songFile,
      SONG_UPLOAD_CONSTRAINTS
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Song upload failed." };
  }
}

const { error } = await supabase.from("teams").update(updates).eq("id", teamId);
if (error) {
  return { error: "Failed to save team. Please try again." };
}
```

**UI Feedback**:
- Upload progress bar (% complete)
- Success message with filename
- Error message if upload fails
- Preview: "Playing sample..." (optional)

---

## Playback

### When Music Plays

```
// When draft state changes to a team's pick in Round 1
if (draft_state.current_round === 1 && team_changed) {
  const team = getCurrentTeam();
  if (team.walk_up_song_url) {
    audioPlayer.play(team.walk_up_song_url);
  }
}
```

### Synchronization Across Clients

**Challenge**: Ensure all users hear the same song at the same time.

**Solution**: Use server-side timing

```javascript
// Server: When pick advances to Round 1 player
UPDATE draft_state SET current_pick_number = 2, current_team_id = team_2;
  Realtime event → song_started = now()

// All clients receive event with timestamp
// Calculate local play delay to synchronize
const client_time_offset = server_song_started - client_now;
audio.play();
// Audio plays at approximately same time across all clients
```

**Limitation**: Perfect synchronization is hard (network latency varies). Acceptable tolerance: ±500ms.

### HTML5 Audio Element

```html
<audio
  id="walkupMusic"
  style="display: none"
  preload="auto"
>
  <source src="" type="audio/mpeg" />
</audio>
```

```javascript
const playWalkUpMusic = (songUrl) => {
  const audio = document.getElementById('walkupMusic');
  audio.src = songUrl;
  audio.currentTime = 0;
  audio.play().catch(err => {
    // Handle autoplay restrictions
    console.error('Autoplay blocked:', err);
  });
};
```

### Browser Autoplay Restrictions

Modern browsers require user interaction before audio can autoplay:

**Best Practice**: Require user to join draft lobby first (they've interacted), then play music in Round 1.

If music is blocked:
```javascript
audio.play().catch((err) => {
  console.warn('Autoplay blocked. User must interact first.');
  // Could prompt: "Click to enable sound"
});
```

---

## Music Controls

### UI Controls

Users should see:

```
┌─────────────────────┐
│  🔊 Draft Music     │
│  ⏹️ Mute            │
│                     │
│  🔔 Draft Sounds    │
│  ⏹️ Mute            │
└─────────────────────┘
```

### JavaScript Implementation

```javascript
const [musicMuted, setMusicMuted] = useState(false);
const [soundsMuted, setSoundsMuted] = useState(false);

const playWalkUpMusic = (songUrl) => {
  if (musicMuted) return;  // Skip if muted
  
  const audio = document.getElementById('walkupMusic');
  audio.volume = 0.7;  // 70% volume
  audio.src = songUrl;
  audio.play();
};

const playDraftChime = () => {
  if (soundsMuted) return;  // Skip if muted
  
  const audio = document.getElementById('draftChime');
  audio.volume = 0.8;
  audio.play();
};

const toggleMusicMute = () => {
  setMusicMuted(!musicMuted);
  localStorage.setItem('musicMuted', !musicMuted);
};
```

### Persistence

Store user's mute preference in localStorage:

```javascript
useEffect(() => {
  const saved = localStorage.getItem('musicMuted');
  if (saved) setMusicMuted(JSON.parse(saved));
}, []);

useEffect(() => {
  localStorage.setItem('musicMuted', musicMuted);
}, [musicMuted]);
```

---

## Draft Chime

> **Authority: this spec wins.** The chime is not built — `src/lib/audio.ts` does not exist. Code
> written later conforms to this section.
> A second, divergent `playDraftChime` once lived in [COMPONENTS.md](COMPONENTS.md); it was removed.

### Overview

Every time a pick is made, a short chime sound plays to indicate the action. This plays for **all rounds**, not just Round 1.

### Sound Effect

**Audio file**: Should be a short, distinct sound

- Duration: 1-2 seconds
- Format: MP3 or WAV
- Quality: 128kbps minimum
- Suggested: Doorbell, chime, or bell sound

**Storage**: Supabase Storage (static asset)

```
draft-assets/
  ├── chime.mp3
  ├── chime_success.wav
  └── chime_alternate.wav
```

### Playback

```javascript
const playDraftChime = () => {
  if (soundsMuted) return;
  
  const chimeAudio = new Audio('/sounds/draft-chime.mp3');
  chimeAudio.volume = 0.8;
  chimeAudio.play();
};

// Triggered when pick is made
supabase
  .channel(`picks:${league_id}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'picks' },
    (payload) => {
      playDraftChime();  // Play on new pick
      updateActivityFeed(payload.new);
    }
  )
  .subscribe();
```

---

## Performance & Optimization

### Audio Preloading

Preload common sounds to avoid lag on first play:

```javascript
useEffect(() => {
  // Preload chime sound
  const chimeAudio = new Audio('/sounds/draft-chime.mp3');
  chimeAudio.preload = 'auto';

  // Preload walk-up songs for all teams
  teams.forEach(team => {
    if (team.walk_up_song_url) {
      const audio = new Audio(team.walk_up_song_url);
      audio.preload = 'metadata';  // Load metadata only
    }
  });
}, [teams]);
```

### Audio Context & Cleanup

Stop playback when component unmounts:

```javascript
useEffect(() => {
  return () => {
    const audio = document.getElementById('walkupMusic');
    audio.pause();
    audio.currentTime = 0;
  };
}, []);
```

### Volume Normalization

Walk-up songs may have different loudness levels. Normalize where possible:

```javascript
// Set reasonable default volumes
const walkupAudio = document.getElementById('walkupMusic');
walkupAudio.volume = 0.7;  // 70%

const chimeAudio = new Audio('/sounds/chime.mp3');
chimeAudio.volume = 0.8;  // 80%
```

---

## Accessibility

### Video Controls

Make audio controls keyboard accessible:

```html
<button 
  onClick={toggleMusicMute}
  aria-label="Toggle draft music"
  aria-pressed={musicMuted}
>
  {musicMuted ? '🔇' : '🔊'} Music
</button>
```

### Captions / Transcripts

For draft chimes, provide visual feedback:

```javascript
const playDraftChime = () => {
  if (!soundsMuted) {
    const chimeAudio = new Audio('/sounds/chime.mp3');
    chimeAudio.play();
  }
  
  // Always show visual feedback
  setChimeFlash(true);
  setTimeout(() => setChimeFlash(false), 500);
};
```

---

## Troubleshooting

### Autoplay Not Working

**Problem**: "Autoplay policy blocked playback"

**Solution**:
1. Ensure user has interacted with the page first
2. Use user gesture (click) before playing
3. Mute option is available if needed

```javascript
audio.play().catch(err => {
  // Fallback: show prompt to user
  console.warn('Autoplay blocked:', err);
  showNotification('Click to enable sound');
  
  // Retry on next user click
  document.addEventListener('click', () => {
    audio.play();
  }, { once: true });
});
```

### Audio Not Playing

**Checklist**:
- [ ] Audio file URL is correct
- [ ] File exists in Supabase Storage
- [ ] Correct MIME type
- [ ] Browser allows audio (check console for errors)
- [ ] Volume not muted (OS level or browser level)
- [ ] File size reasonable (not too large)

### Out of Sync Audio

**Problem**: Music plays at different times across clients

**Tolerance**: ±500ms is acceptable for a social experience

**If worse**: 
- Check network latency
- Use simpler synchronization (all clients use server timestamp)
- Consider pre-loading songs

---

## Analytics & Logging

### Track Audio Usage

```javascript
const logAudioEvent = async (event_type, data) => {
  await supabase
    .from('audio_events')
    .insert({
      user_id: currentUser.id,
      league_id: currentLeague.id,
      event_type,  // 'walkup_played', 'chime_played', 'mute_toggled'
      ...data
    });
};

// Usage
logAudioEvent('walkup_played', {
  team_id: team.id,
  song_url: team.walk_up_song_url
});
```

**Questions to Answer**:
- How many users upload walk-up songs?
- How often is music muted?
- Does audio improve engagement?

---

## TBD: Future Enhancements

### Variants

- Different chime sounds (multiple options)
- Commissioner can customize chime
- Crowd sounds (cheering, booing)

### Music Quality

- Spotify integration? (licensing complexity)
- Lossless audio option? (file size impact)
- Multiple audio tracks (background + walkup layered)?

### Analytics

- "Most popular walk-up songs" leaderboard?
- Audio quality metrics?

---

## Testing Audio

### Unit Test Example

```javascript
describe('Audio playback', () => {
  test('plays walk-up music when team on clock in round 1', () => {
    const mockAudio = jest.fn();
    global.Audio = mockAudio;

    playWalkUpMusic('https://example.com/song.mp3');

    expect(mockAudio).toHaveBeenCalledWith('https://example.com/song.mp3');
  });

  test('respects music mute setting', () => {
    setMusicMuted(true);
    const mockAudio = jest.fn();
    global.Audio = mockAudio;

    playWalkUpMusic('https://example.com/song.mp3');

    expect(mockAudio).not.toHaveBeenCalled();
  });
});
```

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| HTML5 `<audio>` | ✅ | ✅ | ✅ | ✅ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ |
| Autoplay (muted) | ✅ | ✅ | ✅ | ✅ |
| Autoplay (with sound) | ⚠️ (user gesture required) | ⚠️ | ⚠️ | ⚠️ |
| MP3 Support | ✅ | ✅ | ✅ | ✅ |
| WAV Support | ✅ | ✅ | ✅ | ✅ |
| OGG Support | ✅ | ✅ | ❌ | ✅ |

---

## See Also

- [DATABASE.md](DATABASE.md) — Storage of `walk_up_song_url` in teams table
- [COMPONENTS.md](COMPONENTS.md) — Popup components that trigger the chime
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — Announcement sequence the audio accompanies
- [REALTIME.md](REALTIME.md) — Real-time events triggering audio
- [DESIGN.md](DESIGN.md) — Audio UI controls and placement
- [AGENTS.md](../AGENTS.md) — Project overview
