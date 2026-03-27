import { synchronize, type SyncPullArgs, type SyncPushArgs } from '@nozbe/watermelondb/sync';
import { database } from '../db';
import { getSupabaseClient } from '../lib/supabase';

/**
 * Syncs the local WatermelonDB with Supabase.
 *
 * PULL: Fetches all records changed since the last sync from Supabase.
 * PUSH: Sends locally-created game_events (and any offline messages) to Supabase.
 *
 * Game events are immutable (append-only). Use upsert with ignoreDuplicates=true
 * so replays of the same event from offline devices are safe.
 */
export async function syncWithSupabase(): Promise<void> {
  const supabase = getSupabaseClient();

  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt }: SyncPullArgs) => {
      const since = lastPulledAt
        ? new Date(lastPulledAt).toISOString()
        : new Date(0).toISOString();

      const [gamesResult, eventsResult, playersResult, channelsResult, messagesResult] =
        await Promise.all([
          supabase.from('games').select('*').gte('updated_at', since),
          supabase.from('game_events').select('*').gte('synced_at', since),
          supabase.from('players').select('*').gte('updated_at', since),
          supabase
            .from('channels')
            .select('*, channel_members!inner(user_id, can_post)')
            .gte('updated_at', since),
          supabase.from('messages').select('*, user_profiles!sender_id(first_name, last_name)').gte('created_at', since),
        ]);

      return {
        changes: {
          games: {
            created: (gamesResult.data ?? []).map(mapGame),
            updated: [],
            deleted: [],
          },
          game_events: {
            created: (eventsResult.data ?? []).map(mapGameEvent),
            updated: [],
            deleted: [],
          },
          players: {
            created: (playersResult.data ?? []).map(mapPlayer),
            updated: [],
            deleted: [],
          },
          channels: {
            created: (channelsResult.data ?? []).map(mapChannel),
            updated: [],
            deleted: [],
          },
          messages: {
            created: (messagesResult.data ?? []).map(mapMessage),
            updated: [],
            deleted: [],
          },
        },
        timestamp: Date.now(),
      };
    },

    pushChanges: async ({ changes }: SyncPushArgs) => {
      // Push locally-created game events (the main offline use case)
      const createdEvents = changes.game_events?.created ?? [];
      if (createdEvents.length > 0) {
        const { error } = await supabase.from('game_events').upsert(
          createdEvents.map((e) => ({
            id: e.remote_id as string,
            game_id: e.game_remote_id as string,
            sequence_number: e.sequence_number as number,
            event_type: e.event_type as string,
            inning: e.inning as number,
            is_top_of_inning: e.is_top_of_inning as boolean,
            payload: JSON.parse(e.payload as string),
            occurred_at: new Date(e.occurred_at as number).toISOString(),
            created_by: e.created_by as string,
            device_id: e.device_id as string,
          })),
          { onConflict: 'id', ignoreDuplicates: true },
        );

        if (error) {
          // Sequence number conflict — the sync engine will retry on next sync
          if (error.code === '23505') {
            console.warn('Sequence number conflict detected; will retry on next sync');
          } else {
            throw error;
          }
        }
      }

      // Push locally-created messages
      const createdMessages = changes.messages?.created ?? [];
      if (createdMessages.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('messages').insert(
          createdMessages.map((m) => ({
            channel_id: m.channel_remote_id as string,
            sender_id: user?.id ?? '',
            body: m.body as string,
            parent_id: m.parent_id as string | undefined,
          })),
        );
        if (error) throw error;
      }
    },

    sendCreatedAsUpdated: false,
    migrationsEnabledAtVersion: 1,
  });
}

// ─── mapping helpers ─────────────────────────────────────────────────────────

function mapGame(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    season_id: r.season_id,
    team_id: r.team_id,
    opponent_name: r.opponent_name,
    scheduled_at: new Date(r.scheduled_at as string).getTime(),
    location_type: r.location_type,
    neutral_home_team: r.neutral_home_team ?? null,
    venue_name: r.venue_name ?? null,
    status: r.status,
    home_score: r.home_score,
    away_score: r.away_score,
    current_inning: r.current_inning,
    is_top_of_inning: r.is_top_of_inning,
    outs: r.outs,
    synced_at: Date.now(),
  };
}

function mapGameEvent(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    game_id: null,       // Will be resolved by WDB join on game_remote_id
    game_remote_id: r.game_id,
    sequence_number: r.sequence_number,
    event_type: r.event_type,
    inning: r.inning,
    is_top_of_inning: r.is_top_of_inning,
    payload: JSON.stringify(r.payload),
    occurred_at: new Date(r.occurred_at as string).getTime(),
    created_by: r.created_by,
    device_id: r.device_id,
    synced_at: Date.now(),
  };
}

function mapPlayer(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    team_id: r.team_id,
    first_name: r.first_name,
    last_name: r.last_name,
    jersey_number: r.jersey_number ?? null,
    primary_position: r.primary_position ?? null,
    bats: r.bats ?? null,
    throws: r.throws ?? null,
    is_active: r.is_active,
    synced_at: Date.now(),
  };
}

function mapChannel(r: Record<string, unknown>) {
  const members = (r.channel_members as Array<{ can_post: boolean }>) ?? [];
  return {
    id: r.id,
    remote_id: r.id,
    team_id: r.team_id,
    channel_type: r.channel_type,
    name: r.name ?? null,
    description: r.description ?? null,
    can_post: members[0]?.can_post ?? false,
    synced_at: Date.now(),
  };
}

function mapMessage(r: Record<string, unknown>) {
  const profile = r.user_profiles as { first_name: string; last_name: string } | null;
  return {
    id: r.id,
    remote_id: r.id,
    channel_id: null,   // Resolved by WDB join on channel_remote_id
    channel_remote_id: r.channel_id,
    sender_id: r.sender_id,
    sender_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
    body: r.body,
    parent_id: r.parent_id ?? null,
    is_pinned: r.is_pinned,
    created_at: new Date(r.created_at as string).getTime(),
    synced_at: Date.now(),
  };
}
