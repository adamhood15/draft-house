# Draft House Components

This document describes all React components, styling, and UI implementation details for Draft House popups, notifications, and interactive elements.

---

## Pick Announcement Popup

### Component: PickAnnouncementPopup

Displays the pick announcement in two phases with animations.

```javascript
const PickAnnouncementPopup = ({ pick_data, show_announcement }) => {
  return (
    <div className="pick-popup-overlay">
      <div className="pick-popup-card">
        
        {/* Phase 1: "The pick is in" */}
        {!show_announcement && (
          <div className="pick-phase-1">
            <div className="pick-in-message">THE PICK IS IN</div>
          </div>
        )}
        
        {/* Phase 2: Full announcement with player card */}
        {show_announcement && (
          <div className="pick-phase-2">
            
            {/* Announcement text */}
            <div className="pick-announcement-text">
              With the <span className="pick-number">{pick_data.pick_number}</span> pick 
              of the <span className="pick-year">{pick_data.league_season}</span> {pick_data.league_name} draft,
              <span className="team-name">{pick_data.team_name}</span> selects...
            </div>
            
            {/* Player card with animation */}
            <div className="player-selection-card">
              
              {/* Player image with scale animation */}
              <div className="player-image-container">
                <img
                  src={pick_data.player_image_url}
                  alt={pick_data.player_name}
                  className="player-image"
                />
              </div>
              
              {/* Player details with slide-in animation */}
              <div className="player-details">
                <h2 className="player-name">{pick_data.player_name}</h2>
                <p className="player-position">{pick_data.player_position}</p>
                <p className="player-nfl-team">{pick_data.player_nfl_team}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Styling: Pick Popup CSS

```css
.pick-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease-in;
}

.pick-popup-card {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.5),
              0 0 60px rgba(59, 130, 246, 0.3);
  max-width: 700px;
  padding: 48px;
  text-align: center;
  border: 2px solid rgba(59, 130, 246, 0.3);
}

/* Phase 1: "The Pick Is In" */
.pick-phase-1 {
  animation: fadeIn 0.3s ease-in;
}

.pick-in-message {
  font-size: 48px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 3px;
  text-transform: uppercase;
  animation: scaleUp 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
}

/* Phase 2: Full Announcement */
.pick-phase-2 {
  animation: fadeIn 0.5s ease-in;
}

.pick-announcement-text {
  font-size: 18px;
  color: #ccc;
  margin-bottom: 30px;
  line-height: 1.6;
  animation: slideUp 0.6s ease-out;
}

.pick-number {
  font-size: 32px;
  font-weight: bold;
  color: #3b82f6;
  text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.pick-year {
  font-weight: bold;
  color: #f59e0b;
}

.team-name {
  display: block;
  font-size: 24px;
  font-weight: 900;
  color: #fff;
  margin-top: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Player Card */
.player-selection-card {
  margin-top: 40px;
  animation: slideUp 0.8s ease-out 0.3s both;
}

.player-image-container {
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.1);
}

.player-image {
  width: 100%;
  max-width: 300px;
  height: 400px;
  object-fit: cover;
  display: block;
  margin: 0 auto;
  animation: imageZoomIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.player-details {
  animation: slideInUp 0.6s ease-out 0.5s both;
}

.player-name {
  font-size: 36px;
  font-weight: 900;
  color: #fff;
  margin: 0 0 8px 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

.player-position {
  font-size: 20px;
  font-weight: bold;
  color: #3b82f6;
  margin: 4px 0;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.player-nfl-team {
  font-size: 16px;
  color: #aaa;
  margin: 8px 0 0 0;
}
```

---

## Trade Announcement Popup

### Component: TradePopup

Displays trade details in two phases with a two-card layout.

```javascript
const TradePopup = ({ trade_data, show_details, onClose }) => {
  return (
    <div className="trade-popup-overlay">
      <div className="trade-popup-card">
        
        {/* PHASE 1: "A Trade Has Been Made" */}
        {!show_details && (
          <div className="trade-phase-1">
            <div className="trade-made-message">A TRADE HAS BEEN MADE</div>
          </div>
        )}
        
        {/* PHASE 2: Trade Details with Two Cards */}
        {show_details && (
          <div className="trade-phase-2">
            <div className="trade-popup-header">
              <h2>🔄 Trade Details</h2>
              <button onClick={onClose} className="close-btn">×</button>
            </div>
            
            {/* Trade Details Container */}
            <div className="trade-popup-content">
              
              {/* CARD A: Team A receives assets from Team B */}
              <div className="trade-card team-a-receives">
                <div className="card-header">
                  <h3>{trade_data.proposing_team_name}</h3>
                  <span className="card-label">receives</span>
                </div>
                
                <div className="card-assets">
                  {trade_data.items_received.map((item) => (
                    <div key={`received-${item.type}-${item.name || item.display}`} className="asset-item">
                      {item.type === 'player' ? (
                        <>
                          <span className="asset-name">{item.name}</span>
                          <span className="asset-meta">{item.position} • {item.team}</span>
                        </>
                      ) : (
                        <>
                          <span className="asset-name">Pick {item.display}</span>
                          <span className="asset-meta">Round {item.round}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* CARD B: Team B receives assets from Team A */}
              <div className="trade-card team-b-receives">
                <div className="card-header">
                  <h3>{trade_data.receiving_team_name}</h3>
                  <span className="card-label">receives</span>
                </div>
                
                <div className="card-assets">
                  {trade_data.items_given.map((item) => (
                    <div key={`given-${item.type}-${item.name || item.display}`} className="asset-item">
                      {item.type === 'player' ? (
                        <>
                          <span className="asset-name">{item.name}</span>
                          <span className="asset-meta">{item.position} • {item.team}</span>
                        </>
                      ) : (
                        <>
                          <span className="asset-name">Pick {item.display}</span>
                          <span className="asset-meta">Round {item.round}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="trade-popup-footer">
              <button onClick={onClose} className="btn-close">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Styling: Trade Popup CSS

```css
.trade-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-in;
}

.trade-popup-card {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border-radius: 16px;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.5),
              0 0 60px rgba(59, 130, 246, 0.3);
  max-width: 900px;
  padding: 48px;
  border: 2px solid rgba(59, 130, 246, 0.3);
}

/* Phase 1: "A Trade Has Been Made" */
.trade-phase-1 {
  animation: fadeIn 0.3s ease-in;
  text-align: center;
}

.trade-made-message {
  font-size: 48px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 3px;
  text-transform: uppercase;
  animation: scaleUp 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
}

/* Phase 2: Trade Details */
.trade-phase-2 {
  animation: fadeIn 0.5s ease-in;
}

.trade-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 2px solid rgba(59, 130, 246, 0.3);
}

.trade-popup-header h2 {
  margin: 0;
  font-size: 28px;
  font-weight: 900;
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  font-size: 32px;
  cursor: pointer;
  color: #aaa;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #fff;
}

.trade-popup-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin: 24px 0;
}

.trade-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  animation: slideUp 0.6s ease-out 0.2s both;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.card-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 900;
  color: #fff;
  text-transform: uppercase;
}

.card-label {
  font-size: 12px;
  color: #3b82f6;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.card-assets {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.asset-item {
  background: rgba(59, 130, 246, 0.1);
  padding: 12px;
  border-radius: 8px;
  border-left: 3px solid #3b82f6;
  animation: slideInUp 0.5s ease-out 0.4s both;
}

.asset-name {
  display: block;
  font-weight: 600;
  font-size: 14px;
  color: #fff;
}

.asset-meta {
  display: block;
  font-size: 12px;
  color: #aaa;
  margin-top: 4px;
}

.trade-popup-footer {
  border-top: 2px solid rgba(59, 130, 246, 0.3);
  padding-top: 24px;
  display: flex;
  justify-content: flex-end;
}

.btn-close {
  padding: 12px 32px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.5);
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s;
}

.btn-close:hover {
  background: rgba(59, 130, 246, 0.4);
  border-color: rgba(59, 130, 246, 0.8);
}
```

---

## Notification Preferences Settings

### Component: NotificationPreferencesModal

Allows users to customize which announcements they see and how they behave.

```javascript
const NotificationPreferencesModal = ({ league_id, user_id, onClose }) => {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch user's current preferences
    const fetchPreferences = async () => {
      const prefs = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user_id)
        .eq('league_id', league_id)
        .single();
      
      setPreferences(prefs.data || getDefaultPreferences());
      setLoading(false);
    };
    
    fetchPreferences();
  }, [league_id, user_id]);
  
  const handleToggle = async (key, value) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    
    // Save to database
    await supabase
      .from('user_preferences')
      .upsert({
        user_id,
        league_id,
        [key]: value,
        updated_at: now()
      })
      .eq('user_id', user_id);
  };
  
  if (loading) return <div className="settings-loading">Loading...</div>;
  
  return (
    <div className="notification-preferences-modal">
      <div className="modal-overlay" onClick={onClose} />
      
      <div className="modal-content">
        <div className="modal-header">
          <h2>Notification Preferences</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="preferences-list">
          
          {/* Pick Announcements */}
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={preferences.show_pick_announcements}
                onChange={(e) => handleToggle('show_pick_announcements', e.target.checked)}
              />
              <span>Show pick announcements</span>
            </label>
            <p className="preference-desc">Display popup when picks are made</p>
          </div>
          
          {/* Trade Announcements */}
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={preferences.show_trade_announcements}
                onChange={(e) => handleToggle('show_trade_announcements', e.target.checked)}
              />
              <span>Show trade announcements</span>
            </label>
            <p className="preference-desc">Display popup when trades are completed</p>
          </div>
          
          {/* Auto-Dismiss */}
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={preferences.auto_dismiss_announcements}
                onChange={(e) => handleToggle('auto_dismiss_announcements', e.target.checked)}
              />
              <span>Auto-dismiss popups</span>
            </label>
            <p className="preference-desc">Automatically close popups after animation</p>
          </div>
          
          {/* Announcement Sound */}
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={preferences.enable_announcement_sound}
                onChange={(e) => handleToggle('enable_announcement_sound', e.target.checked)}
              />
              <span>Enable announcement sounds</span>
            </label>
            <p className="preference-desc">Play chime when picks/trades happen</p>
          </div>
          
          {/* Volume Control */}
          <div className="preference-item">
            <label>Volume Level</label>
            <div className="volume-control">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={preferences.announcement_volume}
                onChange={(e) => handleToggle('announcement_volume', parseFloat(e.target.value))}
              />
              <span>{Math.round(preferences.announcement_volume * 100)}%</span>
            </div>
          </div>
          
          {/* Activity Feed */}
          <div className="preference-item">
            <label>
              <input
                type="checkbox"
                checked={preferences.show_in_activity_feed}
                onChange={(e) => handleToggle('show_in_activity_feed', e.target.checked)}
              />
              <span>Show in activity feed</span>
            </label>
            <p className="preference-desc">Display picks and trades in the activity stream</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="btn-done">Done</button>
        </div>
      </div>
    </div>
  );
};
```

### Styling: Notification Preferences CSS

```css
.notification-preferences-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  cursor: pointer;
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease-out;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid #f0f0f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 22px;
  font-weight: bold;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #999;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.preferences-list {
  padding: 24px;
}

.preference-item {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.preference-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.preference-item label {
  display: flex;
  align-items: center;
  font-weight: 600;
  color: #333;
  cursor: pointer;
}

.preference-item input[type="checkbox"] {
  margin-right: 12px;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.preference-desc {
  margin: 8px 0 0 30px;
  font-size: 13px;
  color: #999;
  font-weight: normal;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  margin-left: 30px;
}

.volume-control input[type="range"] {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: #ddd;
  outline: none;
  -webkit-appearance: none;
}

.volume-control input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #007bff;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.volume-control input[type="range"]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #007bff;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  border: none;
}

.volume-control span {
  min-width: 45px;
  text-align: right;
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 20px 24px;
  border-top: 1px solid #f0f0f0;
  background: #f9f9f9;
}

.btn-done {
  padding: 10px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-done:hover {
  background: #0056b3;
}
```

---

## Audio Utilities

### Draft Chime Function

Import the chime; do not re-implement it.

```javascript
// src/lib/audio.ts (TBD — not yet created)
import { playDraftChime } from '@/lib/audio';
```

[AUDIO.md — Draft Chime](AUDIO.md#draft-chime) is authoritative for the chime: its volume, its
`soundsMuted` gate, and the shared `<audio>` element it plays through.

> **Removed:** this section previously carried a second `playDraftChime` definition at
> `volume = 0.6` with **no mute check**, diverging from AUDIO.md's `volume = 0.8` gated on
> `soundsMuted`. Two agents reading the two files would have built two different behaviours,
> and the muted-user bug would have reproduced only for whoever happened to read this file.
> The chime has one definition, and it lives in the audio module.

---

## Shared Animations

All popups use these CSS animations:

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleUp {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideInUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes imageZoomIn {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
```

---

## See Also

- [NOTIFICATIONS.md](NOTIFICATIONS.md) — Spec for the pick announcement sequence and preferences
- [TRADES.md](TRADES.md) — Spec for trade announcements and trade lifecycle
- [AUDIO.md](AUDIO.md) — Authoritative definition of the draft chime
- [DESIGN.md](DESIGN.md) — Visual design system and brand guidelines
- [REALTIME.md](REALTIME.md) — Real-time event broadcasting
- [AGENTS.md](../AGENTS.md) — Project overview
