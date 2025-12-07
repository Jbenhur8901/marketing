# Supabase Realtime Integration Guide

This guide explains how to use Supabase Realtime for real-time updates in the WhatsApp Chatbot Platform.

## Overview

Supabase Realtime enables real-time subscriptions to database changes via WebSockets. This allows your frontend to receive instant notifications when:

- New messages arrive in conversations
- Message statuses change (delivered, read, failed)
- Broadcast campaign stats update
- Bulk verification jobs progress
- Conversation status changes

## Prerequisites

1. **Enable Realtime in Supabase Dashboard:**
   - Go to your Supabase project
   - Navigate to Database > Replication
   - Enable replication for the tables you want to listen to:
     - `messages`
     - `conversations`
     - `broadcast_campaigns`
     - `broadcast_messages`
     - `bulk_verification_jobs`
     - `conversation_contexts`

2. **Update Row Level Security (RLS) for Realtime:**
   - Realtime respects RLS policies
   - Users will only receive updates for data they have access to

## Client Setup

### Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Initialize Supabase Client

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
);
```

## Common Use Cases

### 1. Listen for New Messages in a Conversation

```javascript
// Subscribe to new messages in a specific conversation
const subscription = supabase
  .channel('conversation-messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      console.log('New message received:', payload.new);

      // Update UI with new message
      addMessageToChat(payload.new);
    }
  )
  .subscribe();

// Later, unsubscribe when component unmounts
subscription.unsubscribe();
```

### 2. Listen for Message Status Updates

```javascript
// Track when messages are delivered or read
const subscription = supabase
  .channel('message-statuses')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      console.log('Message status updated:', payload.new);

      const { id, status, whatsapp_message_id } = payload.new;

      // Update message checkmarks in UI
      updateMessageStatus(id, status);
    }
  )
  .subscribe();
```

### 3. Listen for All Conversations in a Workspace

```javascript
// Get notified when new conversations are created or updated
const subscription = supabase
  .channel('workspace-conversations')
  .on(
    'postgres_changes',
    {
      event: '*', // Listen to INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'conversations',
      filter: `workspace_id=eq.${workspaceId}`,
    },
    (payload) => {
      if (payload.eventType === 'INSERT') {
        console.log('New conversation:', payload.new);
        addConversationToList(payload.new);
      } else if (payload.eventType === 'UPDATE') {
        console.log('Conversation updated:', payload.new);
        updateConversationInList(payload.new);
      } else if (payload.eventType === 'DELETE') {
        console.log('Conversation deleted:', payload.old);
        removeConversationFromList(payload.old.id);
      }
    }
  )
  .subscribe();
```

### 4. Monitor Broadcast Campaign Progress

```javascript
// Track real-time broadcast campaign stats
const subscription = supabase
  .channel('broadcast-campaign-stats')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'broadcast_campaigns',
      filter: `id=eq.${campaignId}`,
    },
    (payload) => {
      const { sent_count, delivered_count, read_count, failed_count, status } = payload.new;

      console.log('Campaign stats updated:', {
        sent: sent_count,
        delivered: delivered_count,
        read: read_count,
        failed: failed_count,
        status,
      });

      // Update progress bars and stats in UI
      updateCampaignStats(payload.new);
    }
  )
  .subscribe();
```

### 5. Track Bulk Verification Job Progress

```javascript
// Monitor verification job progress
const subscription = supabase
  .channel('verification-job-progress')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'bulk_verification_jobs',
      filter: `id=eq.${jobId}`,
    },
    (payload) => {
      const { processed_count, total_numbers, verified_count, status } = payload.new;

      const progress = (processed_count / total_numbers) * 100;

      console.log('Verification progress:', {
        progress: `${progress.toFixed(2)}%`,
        processed: processed_count,
        total: total_numbers,
        verified: verified_count,
        status,
      });

      // Update progress bar
      updateProgressBar(progress);

      if (status === 'completed') {
        showCompletionNotification();
      }
    }
  )
  .subscribe();
```

### 6. Listen for Bot Conversation Context Changes

```javascript
// Track when bot flow variables change
const subscription = supabase
  .channel('bot-context-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'conversation_contexts',
      filter: `conversation_id=eq.${conversationId}`,
    },
    (payload) => {
      const { current_node_id, waiting_for, variables } = payload.new;

      console.log('Bot context updated:', {
        currentNode: current_node_id,
        waitingFor: waiting_for,
        variables,
      });

      // Update UI to show bot is waiting for user input
      if (waiting_for) {
        showBotTypingIndicator();
      }
    }
  )
  .subscribe();
```

### 7. Multi-Channel Subscription (Inbox App Example)

```javascript
// Subscribe to multiple channels for a complete inbox experience
const channels = [];

// 1. New messages across all conversations
channels.push(
  supabase
    .channel('all-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        // Check if message belongs to this workspace
        // Update unread count, show notification
        handleNewMessage(payload.new);
      }
    )
    .subscribe()
);

// 2. Conversation status changes
channels.push(
  supabase
    .channel('conversation-status')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        handleConversationUpdate(payload.new);
      }
    )
    .subscribe()
);

// 3. Message status updates (for read receipts)
channels.push(
  supabase
    .channel('message-read-receipts')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        updateReadReceipts(payload.new);
      }
    )
    .subscribe()
);

// Cleanup on unmount
const cleanup = () => {
  channels.forEach(ch => ch.unsubscribe());
};
```

## React Hooks Examples

### useRealtimeMessages Hook

```javascript
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export function useRealtimeMessages(conversationId) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Fetch initial messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true });

      setMessages(data || []);
    };

    fetchMessages();

    // Subscribe to new messages
    const subscription = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages(prev =>
            prev.map(msg => msg.id === payload.new.id ? payload.new : msg)
          );
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [conversationId]);

  return messages;
}
```

### useBroadcastStats Hook

```javascript
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export function useBroadcastStats(campaignId) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Fetch initial stats
    const fetchStats = async () => {
      const { data } = await supabase
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      setStats(data);
    };

    fetchStats();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`campaign-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'broadcast_campaigns',
          filter: `id=eq.${campaignId}`,
        },
        (payload) => {
          setStats(payload.new);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [campaignId]);

  return stats;
}
```

## Presence (Online Users)

Track which agents are online and viewing conversations:

```javascript
const channel = supabase.channel('workspace-presence');

// Track your own presence
channel
  .on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    console.log('Online users:', Object.values(state));
  })
  .on('presence', { event: 'join' }, ({ newPresences }) => {
    console.log('User joined:', newPresences);
  })
  .on('presence', { event: 'leave' }, ({ leftPresences }) => {
    console.log('User left:', leftPresences);
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        user_id: userId,
        online_at: new Date().toISOString(),
      });
    }
  });
```

## Broadcast (Custom Events)

Send custom events between clients:

```javascript
const channel = supabase.channel('workspace-events');

// Client A: Send typing indicator
channel
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          user_id: userId,
          conversation_id: conversationId,
        },
      });
    }
  });

// Client B: Receive typing indicator
channel
  .on('broadcast', { event: 'typing' }, (payload) => {
    console.log('User is typing:', payload);
    showTypingIndicator(payload.conversation_id, payload.user_id);
  })
  .subscribe();
```

## Performance Best Practices

### 1. Use Specific Filters

```javascript
// Bad - subscribes to ALL messages
.filter('')

// Good - only messages for specific conversation
.filter(`conversation_id=eq.${conversationId}`)
```

### 2. Unsubscribe When Done

```javascript
useEffect(() => {
  const subscription = supabase
    .channel('my-channel')
    .on(...)
    .subscribe();

  // Always cleanup
  return () => {
    subscription.unsubscribe();
  };
}, [dependencies]);
```

### 3. Batch Updates

```javascript
// If receiving many rapid updates, debounce UI updates
import { debounce } from 'lodash';

const debouncedUpdate = debounce((data) => {
  updateUI(data);
}, 300);

subscription.on('postgres_changes', ..., (payload) => {
  debouncedUpdate(payload.new);
});
```

### 4. Use Channel Groups

```javascript
// Group related subscriptions in one channel
const channel = supabase.channel('workspace-data');

channel
  .on('postgres_changes', { ... table: 'messages' }, handleMessage)
  .on('postgres_changes', { ... table: 'conversations' }, handleConversation)
  .on('presence', { event: 'sync' }, handlePresence)
  .subscribe();
```

## Security Considerations

1. **Row Level Security (RLS) is enforced** - Users only receive updates for data they can access
2. **Filter by workspace_id** - Always filter by workspace to prevent cross-workspace leaks
3. **Validate payloads** - Always validate realtime payloads before using them
4. **Rate limiting** - Supabase has built-in rate limiting for Realtime connections

## Troubleshooting

### No Updates Received

1. Check if Realtime is enabled for the table in Supabase Dashboard
2. Verify RLS policies allow SELECT on the table
3. Check filter syntax matches exactly
4. Ensure subscription status is 'SUBSCRIBED'

### Too Many Connections

- Supabase has a connection limit per project
- Reuse channels instead of creating new ones
- Unsubscribe from unused channels
- Consider upgrading Supabase plan for more connections

### Debug Mode

```javascript
// Enable debug logging
const supabase = createClient(url, key, {
  realtime: {
    log_level: 'debug',
  },
});
```

## Complete Example: Inbox Component

```javascript
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

function InboxComponent({ workspaceId }) {
  const [conversations, setConversations] = useState([]);
  const [onlineAgents, setOnlineAgents] = useState([]);

  useEffect(() => {
    // Fetch initial data
    const fetchConversations = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('*, contact:contacts(*), messages(*)')
        .eq('workspace_id', workspaceId)
        .neq('status', 'closed')
        .order('last_message_at', { ascending: false });

      setConversations(data || []);
    };

    fetchConversations();

    // Setup realtime channel
    const channel = supabase.channel(`workspace-${workspaceId}`);

    // Subscribe to conversation changes
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setConversations(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setConversations(prev =>
              prev.map(c => c.id === payload.new.id ? payload.new : c)
            );
          } else if (payload.eventType === 'DELETE') {
            setConversations(prev =>
              prev.filter(c => c.id !== payload.old.id)
            );
          }
        }
      )
      // Track presence
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineAgents(Object.values(state));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: 'current-user-id',
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [workspaceId]);

  return (
    <div>
      <h2>Conversations ({conversations.length})</h2>
      <div>Online: {onlineAgents.length} agents</div>

      {conversations.map(conv => (
        <ConversationCard key={conv.id} conversation={conv} />
      ))}
    </div>
  );
}
```

## Resources

- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Presence](https://supabase.com/docs/guides/realtime/presence)
- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)
