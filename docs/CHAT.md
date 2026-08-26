# Chat & Activity

This document describes the messaging and activity feed system in Draft House.

## Overview

Draft House has two messaging systems:

1. **Public Activity Feed**: All draft activity (picks, reactions, messages) visible to everyone in the league
2. **Direct Messages**: Private conversations between two players for trade negotiations

---

## Public Activity Feed

### Purpose

The activity feed is the social heartbeat of the draft room. It shows:
- Every pick made
- Chat messages from players
- Emoji reactions to picks
- System notifications (draft paused, etc.)

### Display

```
┌────────────────────────────────────────┐
│ 🏈 Adam drafted Bijan Robinson         │
│                                        │
│ 😂 😂 😂 🔥 (reactions)               │
│                                        │
│ Mike: "WHAT ARE YOU DOING?"           │
│ Sarah: "Absolutely criminal"          │
│ Dad: "Reach"                          │
├────────────────────────────────────────┤
│ 🏈 Sarah drafted Garrett Wilson       │
│                                        │
│ 🔥 🔥 ❤️                               │
├────────────────────────────────────────┤
│ [System] Draft paused by commissioner │
└────────────────────────────────────────┘
```

### Data Model

All activity is stored in the `chat_messages` table:

```sql
chat_messages
├── id (UUID)
├── league_id (UUID)
├── sender_id (UUID, nullable for system messages)
├── message_type (VARCHAR)
│   ├── "pick"      → Auto-generated pick announcement
│   ├── "message"   → User-sent chat message
│   └── "system"    → System notification
├── content (TEXT)
├── pick_id (UUID, nullable)  → FK to picks table
├── created_at (TIMESTAMP)
└── deleted_at (TIMESTAMP, nullable)
```

### Message Types

#### 1. Pick Announcements (Auto-Generated)

```json
{
  "message_type": "pick",
  "content": "Adam drafted Bijan Robinson (RB, ATL)",
  "pick_id": "pick_456",
  "created_at": "2025-09-04T14:32:15Z"
}
```

**Automatically created** when a pick is inserted:

```javascript
// Trigger in database (PostgreSQL) or
// Application code after inserting pick
const createPickAnnouncement = async (pick) => {
  await supabase.from('chat_messages').insert({
    league_id: pick.league_id,
    sender_id: null,  // System message, no sender
    message_type: 'pick',
    content: `${getTeamName(pick.team_id)} drafted ${pick.player_name}`,
    pick_id: pick.id
  });
};
```

#### 2. User Chat Messages

```json
{
  "message_type": "message",
  "content": "Great pick! He's going to tear it up",
  "sender_id": "user_456",
  "created_at": "2025-09-04T14:33:00Z"
}
```

**User-submitted** during draft:

```javascript
const sendChatMessage = async (league_id, content) => {
  await supabase.from('chat_messages').insert({
    league_id,
    sender_id: currentUser.id,
    message_type: 'message',
    content
  });
};
```

#### 3. System Notifications

```json
{
  "message_type": "system",
  "content": "Draft paused by commissioner",
  "sender_id": null,
  "created_at": "2025-09-04T14:34:00Z"
}
```

**System-generated** for important events:

```javascript
const createSystemNotification = async (league_id, message) => {
  await supabase.from('chat_messages').insert({
    league_id,
    sender_id: null,
    message_type: 'system',
    content: message
  });
};

// Usage examples:
createSystemNotification(league_id, 'Draft paused by commissioner');
createSystemNotification(league_id, 'Draft resumed by commissioner');
createSystemNotification(league_id, `${team_name} auto-drafted ${player_name}`);
```

### Reactions to Picks

Emoji reactions are stored separately in the `reactions` table:

```sql
reactions
├── id (UUID)
├── pick_id (UUID) → Links to a specific pick
├── user_id (UUID)
├── emoji (VARCHAR) → "😂", "🔥", "🤡", etc.
└── created_at (TIMESTAMP)
```

**Display**: Grouped under the pick announcement

```
🏈 Adam drafted Bijan Robinson
  😂 7    🔥 3    🤡 5
```

**Add a Reaction**:

```javascript
const addReaction = async (pick_id, emoji) => {
  await supabase.from('reactions').insert({
    pick_id,
    user_id: currentUser.id,
    emoji
  });
};
```

**Remove a Reaction**:

```javascript
const removeReaction = async (pick_id, emoji) => {
  await supabase
    .from('reactions')
    .delete()
    .eq('pick_id', pick_id)
    .eq('user_id', currentUser.id)
    .eq('emoji', emoji);
};
```

### Real-Time Updates

Activity feed is updated in real-time via Supabase subscriptions:

```javascript
// Subscribe to new messages
supabase
  .channel(`chat:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'chat_messages',
      filter: `league_id=eq.${league_id}`
    },
    (payload) => {
      addActivityFeedItem(payload.new);
    }
  )
  .subscribe();

// Subscribe to reactions
supabase
  .channel(`reactions:${league_id}`)
  .on(
    'postgres_changes',
    { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'reactions'
    },
    (payload) => {
      addReactionToPick(payload.new.pick_id, payload.new.emoji);
    }
  )
  .subscribe();
```

### Pagination / History

The feed loads recent messages, then allows scrolling for history:

```javascript
// Load recent 50 messages
const loadActivityFeed = async (league_id) => {
  const messages = await supabase
    .from('chat_messages')
    .select('*')
    .eq('league_id', league_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  return messages.reverse();  // Oldest first
};

// Load older messages (infinite scroll)
const loadOlderMessages = async (league_id, beforeTimestamp) => {
  const messages = await supabase
    .from('chat_messages')
    .select('*')
    .eq('league_id', league_id)
    .is('deleted_at', null)
    .lt('created_at', beforeTimestamp)
    .order('created_at', { ascending: false })
    .limit(50);

  return messages.reverse();
};
```

---

## Direct Messages

### Purpose

Players can privately message each other to negotiate trades (e.g., trading draft picks).

**Example conversation**:
```
Adam → Mike
"Would you trade me your 4th for my 6th?"

Mike → Adam
"Let me think about it. Who are you targeting?"

Adam → Mike
"I have my eye on QB in the 3rd, but I'd rather not burn a high pick."
```

### Data Model

Two tables:

#### 1. Conversations

```sql
direct_message_conversations
├── id (UUID, primary key)
├── league_id (UUID)
├── user_a_id (UUID) -- alphabetically first
├── user_b_id (UUID) -- alphabetically second
├── last_message_at (TIMESTAMP)
└── created_at (TIMESTAMP)
```

**Uniqueness constraint**:
```sql
UNIQUE(league_id, user_a_id, user_b_id)
```

This ensures only one conversation per pair per league.

#### 2. Messages

```sql
direct_messages
├── id (UUID)
├── conversation_id (UUID) → FK to conversations
├── sender_id (UUID)
├── content (TEXT)
├── read_at (TIMESTAMP, nullable)
└── created_at (TIMESTAMP)
```

### API Workflow

#### 1. Start a Conversation

```javascript
const startConversation = async (league_id, other_user_id) => {
  const userId = currentUser.id;
  
  // Ensure user_a_id < user_b_id for consistency
  const [user_a_id, user_b_id] = 
    userId < other_user_id 
      ? [userId, other_user_id]
      : [other_user_id, userId];

  // Insert or get existing conversation
  const { data, error } = await supabase
    .from('direct_message_conversations')
    .upsert({
      league_id,
      user_a_id,
      user_b_id,
      last_message_at: new Date()
    }, {
      onConflict: 'league_id,user_a_id,user_b_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
};
```

#### 2. Send a Message

```javascript
const sendDirectMessage = async (conversation_id, content) => {
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      conversation_id,
      sender_id: currentUser.id,
      content,
      read_at: null
    })
    .select()
    .single();

  if (error) throw error;

  // Update last_message_at on conversation
  await supabase
    .from('direct_message_conversations')
    .update({ last_message_at: new Date() })
    .eq('id', conversation_id);

  return data;
};
```

#### 3. Load Conversation History

```javascript
const loadConversation = async (conversation_id) => {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
};
```

#### 4. Mark as Read

```javascript
const markAsRead = async (message_ids) => {
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date() })
    .in('id', message_ids)
    .is('read_at', null);  // Only update unread messages
};
```

### Unread Count

```javascript
const getUnreadCount = async (user_id, league_id) => {
  const { count } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact' })
    .neq('sender_id', user_id)
    .is('read_at', null)
    .in('conversation_id', 
      // Get all conversations for this user in this league
      (await supabase
        .from('direct_message_conversations')
        .select('id')
        .eq('league_id', league_id)
        .or(`user_a_id.eq.${user_id},user_b_id.eq.${user_id}`)
      ).data.map(c => c.id)
    );

  return count;
};
```

### Real-Time Updates

```javascript
const subscribeToConversation = (conversation_id) => {
  supabase
    .channel(`dm:${conversation_id}`)
    .on(
      'postgres_changes',
      { 
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversation_id}`
      },
      (payload) => {
        addMessageToConversation(payload.new);
      }
    )
    .subscribe();
};
```

---

## UI Components

### Activity Feed Component

```javascript
const ActivityFeed = ({ league_id }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial messages
    loadActivityFeed(league_id).then(setMessages);

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${league_id}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `league_id=eq.${league_id}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [league_id]);

  return (
    <div className="activity-feed">
      {messages.map(msg => (
        <ActivityMessage key={msg.id} message={msg} />
      ))}
    </div>
  );
};

const ActivityMessage = ({ message }) => {
  if (message.message_type === 'pick') {
    return (
      <div className="pick-announcement">
        <p>🏈 {message.content}</p>
        <ReactionsList pick_id={message.pick_id} />
      </div>
    );
  } else if (message.message_type === 'message') {
    return (
      <div className="chat-message">
        <strong>{getUserName(message.sender_id)}:</strong>
        <p>{message.content}</p>
      </div>
    );
  } else if (message.message_type === 'system') {
    return (
      <div className="system-notification">
        <em>{message.content}</em>
      </div>
    );
  }
};
```

### Direct Message Interface

```javascript
const DirectMessageConversation = ({ conversation_id }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    loadConversation(conversation_id).then(setMessages);

    const channel = supabase
      .channel(`dm:${conversation_id}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversation_id}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
          markAsRead([payload.new.id]);  // Auto-mark as read
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conversation_id]);

  const handleSend = async () => {
    if (!input.trim()) return;

    await sendDirectMessage(conversation_id, input);
    setInput('');
  };

  return (
    <div className="dm-conversation">
      <div className="message-list">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`}>
            {msg.content}
          </div>
        ))}
      </div>
      <div className="message-input">
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button onClick={handleSend}>Send</button>
      </div>
    </div>
  );
};
```

---

## Direct Message Notifications

### Overview

When someone sends a player a direct message, they should be notified immediately so they don't miss trade discussions during the draft.

### Notification Types

#### 1. Toast Notification (In-App)

When a new DM arrives, show a brief toast at the top of the screen:

```
┌─────────────────────────────────┐
│ 💬 Mike: "Would you trade...?"  │
│                       [Dismiss] │
└─────────────────────────────────┘
```

This appears for 5 seconds then disappears (unless user hovers).

#### 2. Unread Badge

Show an unread message count on the chat icon:

```
┌──────────┐
│ 💬  [3]  │  ← Badge shows 3 unread messages
└──────────┘
```

#### 3. Conversation Badge

In the conversations list, highlight unread conversations:

```
Conversations

Mike           [1]  ← Has 1 unread message
Sarah          [2]  ← Has 2 unread messages
Dad            
```

### Implementation

#### Data for Notifications

The `direct_messages` table has a `read_at` field:

```sql
direct_messages
├── id (UUID)
├── conversation_id (UUID)
├── sender_id (UUID)
├── content (TEXT)
├── read_at (TIMESTAMP, nullable)  ← NULL = unread
└── created_at (TIMESTAMP)
```

#### Toast Notification Component

```javascript
// hooks/useDirectMessageNotification.js
import { useEffect, useState } from 'react';
import { useToast } from './useToast';

export const useDirectMessageNotification = (league_id, user_id) => {
  const { showToast } = useToast();

  useEffect(() => {
    // Subscribe to new direct messages
    const channel = supabase
      .channel(`dm_notifications:${user_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${user_id}`
        },
        async (payload) => {
          // Fetch sender name
          const { data: user } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', payload.new.sender_id)
            .single();

          // Show toast with sender and message preview
          const preview = payload.new.content.substring(0, 50);
          showToast({
            type: 'info',
            message: `💬 ${user.display_name}: "${preview}..."`,
            duration: 5000,
            onClick: () => navigateToConversation(payload.new.conversation_id)
          });

          // Play notification sound (optional)
          playNotificationSound();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user_id]);
};

// Usage in DraftRoom component
const DraftRoom = ({ league_id }) => {
  useDirectMessageNotification(league_id, currentUser.id);
  // ... rest of component
};
```

#### Unread Count Badge

```javascript
// hooks/useUnreadMessageCount.js
export const useUnreadMessageCount = (user_id) => {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Get initial unread count
    const loadUnreadCount = async () => {
      const { count } = await supabase
        .from('direct_messages')
        .select('*', { count: 'exact' })
        .eq('recipient_id', user_id)
        .is('read_at', null);

      setUnreadCount(count || 0);
    };

    loadUnreadCount();

    // Subscribe to new unread messages
    const channel = supabase
      .channel(`unread_count:${user_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${user_id}`
        },
        () => {
          // Increment unread count
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${user_id}`
        },
        (payload) => {
          // If message was marked as read
          if (payload.new.read_at && !payload.old.read_at) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user_id]);

  return unreadCount;
};

// Usage in header/nav
const Header = () => {
  const unreadCount = useUnreadMessageCount(currentUser.id);

  return (
    <header>
      <nav>
        <button>
          💬 Messages
          {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </button>
      </nav>
    </header>
  );
};
```

#### Highlighting Unread Conversations

```javascript
// components/ConversationsList.js
const ConversationsList = ({ conversations, user_id }) => {
  const [unreadByConversation, setUnreadByConversation] = useState({});

  useEffect(() => {
    // Load unread count per conversation
    const loadUnreadCounts = async () => {
      const unread = {};
      
      for (const conv of conversations) {
        const { count } = await supabase
          .from('direct_messages')
          .select('*', { count: 'exact' })
          .eq('conversation_id', conv.id)
          .eq('recipient_id', user_id)
          .is('read_at', null);

        unread[conv.id] = count || 0;
      }
      
      setUnreadByConversation(unread);
    };

    loadUnreadCounts();
  }, [conversations, user_id]);

  return (
    <div className="conversations-list">
      {conversations.map(conv => {
        const otherUserId = conv.user_a_id === user_id ? conv.user_b_id : conv.user_a_id;
        const unreadCount = unreadByConversation[conv.id] || 0;

        return (
          <div
            key={conv.id}
            className={`conversation-item ${unreadCount > 0 ? 'unread' : ''}`}
          >
            <span>{getDisplayName(otherUserId)}</span>
            {unreadCount > 0 && (
              <span className="unread-badge">{unreadCount}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
```

### CSS for Notifications

```css
/* Badge styling */
.badge {
  display: inline-block;
  background-color: #ff4444;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  margin-left: 8px;
}

/* Unread conversation highlighting */
.conversation-item.unread {
  background-color: #f0f0f0;
  border-left: 3px solid #007bff;
  font-weight: 600;
}

.unread-badge {
  display: inline-block;
  background-color: #007bff;
  color: white;
  border-radius: 10px;
  padding: 2px 8px;
  font-size: 12px;
  margin-left: auto;
}

/* Toast notification */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: white;
  border-left: 4px solid #007bff;
  border-radius: 4px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  animation: slideIn 0.3s ease-in-out;
  cursor: pointer;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

### Marking Messages as Read

Messages are automatically marked as read when the user opens the conversation:

```javascript
const DirectMessageConversation = ({ conversation_id }) => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Load all messages in conversation
    loadConversation(conversation_id).then(setMessages);

    // Mark unread messages as read
    const markUnread = async () => {
      await supabase
        .from('direct_messages')
        .update({ read_at: new Date() })
        .eq('conversation_id', conversation_id)
        .is('read_at', null);  // Only unread
    };

    markUnread();

    // Subscribe to new messages
    const channel = supabase
      .channel(`dm:${conversation_id}`)
      .on('postgres_changes', {...}, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        // Auto-mark new messages as read since conversation is open
        markAsRead([payload.new.id]);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conversation_id]);

  // ... render conversation
};
```

### Optional: Sound Notification

If you want a subtle notification sound when a message arrives (like the draft chime):

```javascript
const playNotificationSound = () => {
  const audio = new Audio('/sounds/notification.mp3');
  audio.volume = 0.5;
  audio.play().catch(err => {
    console.warn('Notification sound blocked by browser');
  });
};

// Use in the toast notification hook
useDirectMessageNotification(league_id, user_id);
  // ... in subscription handler:
  playNotificationSound();
```

### Database Query Performance

To keep notifications responsive, ensure these indexes exist:

```sql
-- Indexes for unread message queries
CREATE INDEX idx_direct_messages_recipient_read 
  ON direct_messages(recipient_id, read_at);

CREATE INDEX idx_direct_messages_conversation_read 
  ON direct_messages(conversation_id, read_at);
```

---

## Moderation (Future)

### Soft Deletes

Currently, messages are soft-deleted (marked with `deleted_at`):

```javascript
const deleteMessage = async (message_id) => {
  await supabase
    .from('chat_messages')
    .update({ deleted_at: new Date() })
    .eq('id', message_id);
};
```

### Query Undeleted Only

```javascript
// When fetching messages, always filter:
const messages = await supabase
  .from('chat_messages')
  .select('*')
  .eq('league_id', league_id)
  .is('deleted_at', null)  // Only undeleted
  .order('created_at', { ascending: false });
```

### Future Features (Post-MVP)

- Commissioner can delete messages
- Report message for moderation
- Mute/block other players
- Content filter (automatic or manual review)

---

## Emoji Reactions

### Available Emoji

Default set (TBD, can be customized):
```
😂  🔥  🤡  💀  😭  👀
😍  ❤️  👏  🙌  🤯  🔮
```

### Emoji Picker

```javascript
const EmojiPicker = ({ onEmojiSelect }) => {
  const emojis = ['😂', '🔥', '🤡', '💀', '😭', '👀', '😍', '❤️', '👏', '🙌', '🤯', '🔮'];

  return (
    <div className="emoji-picker">
      {emojis.map(emoji => (
        <button
          key={emoji}
          onClick={() => onEmojiSelect(emoji)}
          className="emoji-button"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
```

### Display Reactions

```javascript
const ReactionsList = ({ pick_id }) => {
  const [reactions, setReactions] = useState({});

  useEffect(() => {
    // Load reactions for this pick
    loadReactionsForPick(pick_id).then(data => {
      // Group by emoji and count
      const grouped = data.reduce((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
      }, {});
      setReactions(grouped);
    });

    // Subscribe to new reactions
    supabase
      .channel(`reactions:${pick_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reactions' },
        (payload) => {
          setReactions(prev => ({
            ...prev,
            [payload.new.emoji]: (prev[payload.new.emoji] || 0) + 1
          }));
        }
      )
      .subscribe();
  }, [pick_id]);

  return (
    <div className="reactions">
      {Object.entries(reactions).map(([emoji, count]) => (
        <span key={emoji} className="reaction-badge">
          {emoji} {count}
        </span>
      ))}
    </div>
  );
};
```

---

## Search & Filtering (Future)

Currently not implemented, but could add:
- Search chat by keyword
- Filter by sender
- Filter by message type (picks only, chat only, etc.)
- Export draft transcript

---

## Performance

### Message Limits

- Pagination: Load 50 messages at a time
- Don't load entire chat history on page load
- Lazy-load older messages on scroll up

### Reaction Aggregation

- Calculate reaction counts in database (or cache)
- Don't send all individual reactions to client
- Send: "😂: 7, 🔥: 3" instead of 10 separate reaction records

---

## Analytics (Future)

Track engagement:
```javascript
logEvent('chat_message_sent', { league_id, message_length: content.length });
logEvent('emoji_reaction', { league_id, emoji });
logEvent('dm_conversation_started', { league_id });
```

---

## See Also

- [DATABASE.md](DATABASE.md) — `chat_messages`, `reactions`, `direct_messages` tables
- [REALTIME.md](REALTIME.md) — Real-time subscription implementation
- [DESIGN.md](DESIGN.md) — Chat UI layout in draft room
- [AGENTS.md](../AGENTS.md) — Project overview
