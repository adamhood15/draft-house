# Notifications

Split out of [DRAFT_ENGINE.md](DRAFT_ENGINE.md) — the pick announcement sequence and per-user notification preferences.

> Specification for the pick announcement sequence and per-user notification preferences.
> Implementation (React + CSS) lives in [COMPONENTS.md](COMPONENTS.md) — this file is the spec,
> that file is the code.

## Pick Announcement & Animation Sequence

When a player is selected, a coordinated sequence of events occurs across all clients: draft pause, notification, animation, and then draft resume. This creates an engaging experience and gives all players time to react.

### Sequence Overview

```
1. Pick submitted by Team A
    ↓
2. Server pauses draft timer immediately
    ↓
3. Broadcast pick_in_progress event to all clients
    ↓
4. All clients show "The pick is in" popup + activity feed notification
    ↓
5. Play draft chime sound
    ↓
6. After 1.5 seconds, update popup message:
   "With the X pick of the 2026 [League Name] draft, [Team] selects..."
    ↓
7. Display animated player card in popup with:
   - Player image (scales in with fade)
   - Player name (slides in from bottom)
   - Player position (fades in)
    ↓
8. Update activity feed with full pick details
    ↓
9. Allow players to react to activity feed entry
    ↓
10. After animation completes (3-4 seconds total):
    Close popup
    ↓
11. Update draft_state: increment pick number
    ↓
12. Resume timer for next team
```

### Server-Side: Draft Pause & Broadcast

```javascript
const submitPickWithAnimation = async (league_id, team_id, player_id) => {
  // Validate pick
  const validation = await validatePick(league_id, team_id, player_id);
  if (!validation.valid) throw new Error(validation.error);
  
  // STEP 1: Pause draft immediately
  await supabase
    .from('draft_state')
    .update({ timer_paused: true, pause_reason: 'pick_in_progress' })
    .eq('league_id', league_id);
  
  // Insert the pick
  const pick = await supabase
    .from('picks')
    .insert({
      league_id,
      team_id,
      sleeper_player_id: player_id,
      pick_number: current_pick_number,
      created_at: now()
    })
    .select();
  
  // Update rosters
  await updateTeamRoster(team_id, player_id);
  
  // Fetch player details for display
  const playerData = await getPlayerData(player_id);
  
  // STEP 2: Broadcast pick_in_progress event
  supabase.channel(`draft:${league_id}`).send({
    type: 'broadcast',
    event: 'pick_in_progress',
    payload: {
      pick_number: current_pick_number,
      team_id: team_id,
      team_name: team_name,
      league_name: league_name,
      league_season: league_season,
      player_id: player_id,
      player_name: playerData.name,
      player_position: playerData.position,
      // Built from a template, not fetched or stored — see SLEEPER.md#player-photos
      player_image_url: getPlayerImageUrl(player_id, playerData.position),
      player_nfl_team: playerData.nfl_team
    }
  });
  
  // Timer for animation sequence (3-4 seconds)
  setTimeout(async () => {
    // STEP 11: Increment pick number
    await supabase
      .from('draft_state')
      .update({
        current_pick_number: current_pick_number + 1,
        timer_paused: false  // Resume timer
      })
      .eq('league_id', league_id);
    
    // Broadcast animation complete
    supabase.channel(`draft:${league_id}`).send({
      type: 'broadcast',
      event: 'pick_animation_complete',
      payload: { next_team_id: next_team_id }
    });
  }, 3500); // 3.5 second animation sequence
};
```

### Client-Side: Notification Popup

All clients subscribe to pick events:

```javascript
useEffect(() => {
  const channel = supabase
    .channel(`draft:${league_id}`)
    .on('broadcast', { event: 'pick_in_progress' }, (payload) => {
      // Show "The pick is in" popup
      setPickInProgress(true);
      setPickData(payload.payload);
      
      // Play draft chime immediately
      playDraftChime();
      
      // After 1.5 seconds, show full pick announcement
      setTimeout(() => {
        setShowPickAnnouncement(true);
      }, 1500);
    })
    .on('broadcast', { event: 'pick_animation_complete' }, (payload) => {
      // Close popup
      setPickInProgress(false);
      setShowPickAnnouncement(false);
    })
    .subscribe();
  
  return () => channel.unsubscribe();
}, [league_id]);
```

### Pick Announcement Popup

The popup displays pick announcements in two phases with animations. See [COMPONENTS.md — Pick Announcement Popup](COMPONENTS.md#pick-announcement-popup) for component code, styling, and animation details.

### Activity Feed Integration

When the pick announcement popup is showing, the activity feed is also updated:

```javascript
// After pickup is confirmed
const addPickToActivityFeed = async (league_id, pick_data) => {
  await supabase
    .from('chat_messages')
    .insert({
      league_id,
      message_type: 'pick',
      content: `${pick_data.team_name} selected ${pick_data.player_name}`,
      pick_id: pick_data.pick_id,
      sender_id: pick_data.team_owner_id,
      created_at: now()
    });
};
```

Players can immediately react to the pick in the activity feed with emoji reactions while the animation is still playing.

---

## Notification Preferences & Settings

Players should have full control over which announcements they see. Some players may find popups distracting, while others enjoy them. A settings area allows players to customize their announcement experience.

### User Preferences Schema

```javascript
// Each user has notification preferences stored in a user_preferences table
user_preferences
├── user_id (UUID, PK)
├── league_id (UUID, PK) -- League-specific preferences
├── show_pick_announcements (BOOLEAN) -- Show pick popup/chime
├── show_trade_announcements (BOOLEAN) -- Show trade popup
├── auto_dismiss_announcements (BOOLEAN) -- Auto-close popups after 3.5s
├── auto_dismiss_delay_ms (INTEGER) -- Customizable dismiss delay (default: 3500)
├── enable_announcement_sound (BOOLEAN) -- Play draft chime/notification sounds
├── announcement_volume (FLOAT) -- Volume level 0.0 - 1.0 (default: 0.6)
├── show_in_activity_feed (BOOLEAN) -- Show picks/trades in activity feed
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Notification Preferences Settings

See [COMPONENTS.md — Notification Preferences Settings](COMPONENTS.md#notification-preferences-settings) for the complete NotificationPreferencesModal component implementation and styling.

### Checking Preferences Before Showing Popups

When a pick or trade announcement is about to be displayed, check the user's preferences:

```javascript
// When pick_in_progress event is received
const handlePickAnnouncement = async (payload, user_id, league_id) => {
  // Fetch user's preferences
  const prefs = await getUserPreferences(user_id, league_id);
  
  // Check if user wants to see pick announcements
  if (!prefs.show_pick_announcements) {
    console.log('Pick announcements disabled by user');
    return; // Don't show popup
  }
  
  // Show popup
  setPickInProgress(true);
  setPickData(payload);
  
  // Play chime only if enabled
  if (prefs.enable_announcement_sound) {
    playDraftChime(prefs.announcement_volume);
  }
  
  // Auto-dismiss if enabled
  if (prefs.auto_dismiss_announcements) {
    setTimeout(() => {
      setPickInProgress(false);
    }, prefs.auto_dismiss_delay_ms);
  }
};

// Same for trade announcements
const handleTradeAnnouncement = async (payload, user_id, league_id) => {
  const prefs = await getUserPreferences(user_id, league_id);
  
  if (!prefs.show_trade_announcements) {
    console.log('Trade announcements disabled by user');
    return; // Don't show popup
  }
  
  // Show popup, play sound, etc.
  displayTradePopup(payload, prefs);
};
```

### Settings Access

Players can access notification preferences from:

1. **Settings Icon** in the draft room header
2. **User Profile Menu** → Notification Settings
3. **During Draft** → Settings button (top-right corner)

Each league has its own preference set, so players can customize differently for different leagues.

