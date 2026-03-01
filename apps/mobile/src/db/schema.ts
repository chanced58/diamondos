import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * WatermelonDB schema — the offline SQLite read model on the device.
 * Mirror of the Supabase schema for tables needed during offline play.
 * When adding columns here, also add them to the corresponding Supabase migration
 * and update the sync engine mappings.
 */
export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'games',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'season_id', type: 'string' },
        { name: 'team_id', type: 'string' },
        { name: 'opponent_name', type: 'string' },
        { name: 'scheduled_at', type: 'number' },           // Unix ms timestamp
        { name: 'location_type', type: 'string' },
        { name: 'venue_name', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'home_score', type: 'number' },
        { name: 'away_score', type: 'number' },
        { name: 'current_inning', type: 'number' },
        { name: 'is_top_of_inning', type: 'boolean' },
        { name: 'outs', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'game_events',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'game_id', type: 'string', isIndexed: true },   // WDB local id
        { name: 'game_remote_id', type: 'string', isIndexed: true },
        { name: 'sequence_number', type: 'number' },
        { name: 'event_type', type: 'string' },
        { name: 'inning', type: 'number' },
        { name: 'is_top_of_inning', type: 'boolean' },
        { name: 'payload', type: 'string' },                 // JSON.stringify'd GameEventPayload
        { name: 'occurred_at', type: 'number' },             // Unix ms timestamp
        { name: 'created_by', type: 'string' },              // auth user id
        { name: 'device_id', type: 'string' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'players',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'team_id', type: 'string', isIndexed: true },
        { name: 'first_name', type: 'string' },
        { name: 'last_name', type: 'string' },
        { name: 'jersey_number', type: 'number', isOptional: true },
        { name: 'primary_position', type: 'string', isOptional: true },
        { name: 'bats', type: 'string', isOptional: true },
        { name: 'throws', type: 'string', isOptional: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'channels',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'team_id', type: 'string', isIndexed: true },
        { name: 'channel_type', type: 'string' },
        { name: 'name', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'last_message_at', type: 'number', isOptional: true },
        { name: 'can_post', type: 'boolean' },              // Current user's post permission in this channel
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'channel_id', type: 'string', isIndexed: true },
        { name: 'channel_remote_id', type: 'string', isIndexed: true },
        { name: 'sender_id', type: 'string' },
        { name: 'sender_name', type: 'string', isOptional: true },  // Denormalized for offline display
        { name: 'body', type: 'string' },
        { name: 'parent_id', type: 'string', isOptional: true },
        { name: 'is_pinned', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
