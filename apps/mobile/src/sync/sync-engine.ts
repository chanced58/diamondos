import { synchronize, type SyncPullArgs, type SyncPushArgs } from '@nozbe/watermelondb/sync';
import { database } from '../db';
import type { GameEvent } from '../db/models/GameEvent';
import { getSupabaseClient } from '../lib/supabase';


/**
 * Safely parse a payload stored as JSON in WatermelonDB. If the column is
 * corrupt (should not happen on records this client created, but may
 * happen for records pulled from a malformed server row or hand-edited
 * local DB), we return null so the caller can skip that row rather than
 * abort the whole sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParsePayload(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('sync: skipping event with unparseable payload', err);
    return null;
  }
}

/**
 * After a sequence-number collision (pg error 23505 on the game_events
 * unique(game_id, sequence_number) constraint), shift the local WDB
 * records' sequence numbers so they start above the server's current
 * max. Next sync cycle will push them successfully.
 *
 * `failedEvents` comes from WatermelonDB's changes.created array — each
 * entry is a raw record shape whose `id` field is the WDB internal id.
 */
async function reconcileSequenceNumbers(
  failedEvents: ReadonlyArray<Record<string, unknown>>,
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<void> {
  const byGame = new Map<string, Array<Record<string, unknown>>>();
  for (const e of failedEvents) {
    const gameRemoteId = e.game_remote_id as string | undefined;
    if (!gameRemoteId) continue;
    const list = byGame.get(gameRemoteId) ?? [];
    list.push(e);
    byGame.set(gameRemoteId, list);
  }

  const renumbers: Array<{ wdbId: string; newSeq: number }> = [];

  for (const [gameRemoteId, events] of byGame) {
    const { data, error } = await supabase
      .from('game_events')
      .select('sequence_number')
      .eq('game_id', gameRemoteId)
      .order('sequence_number', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('sync: could not fetch server max seq for reconciliation', error);
      continue;
    }

    const serverMax = (data?.[0]?.sequence_number as number | undefined) ?? 0;

    events.sort((a, b) => (a.sequence_number as number) - (b.sequence_number as number));
    let nextSeq = serverMax + 1;
    for (const e of events) {
      const currentSeq = e.sequence_number as number;
      if (currentSeq <= serverMax) {
        renumbers.push({ wdbId: e.id as string, newSeq: nextSeq });
        nextSeq += 1;
      } else {
        nextSeq = Math.max(nextSeq, currentSeq + 1);
      }
    }
  }

  if (renumbers.length === 0) return;

  await database.write(async () => {
    const collection = database.get<GameEvent>('game_events');
    for (const { wdbId, newSeq } of renumbers) {
      const record = await collection.find(wdbId);
      await record.update((r) => {
        r.sequenceNumber = newSeq;
      });
    }
  });
}

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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error('Cannot sync: user is not authenticated');
      }
      const userId = user.id;

      const [gamesResult, eventsResult, playersResult, channelsResult, messagesResult] =
        await Promise.all([
          supabase.from('games').select('*').gte('updated_at', since),
          supabase.from('game_events').select('*').gte('synced_at', since),
          supabase.from('players').select('*').gte('updated_at', since),
          supabase
            .from('channels')
            .select('*, channel_members!inner(user_id, can_post)')
            .eq('channel_members.user_id', userId)
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
      // Push locally-created game events (the main offline use case).
      // SyncDatabaseChangeSet in this codebase's @nozbe/watermelondb types
      // does not declare game_events / messages, so we cast through unknown.
      const createdEvents = (
        (changes as unknown as { game_events?: { created?: Array<Record<string, unknown>> } })
          .game_events?.created ?? []
      );
      if (createdEvents.length > 0) {
        // Skip events whose payload can't be parsed rather than aborting the
        // whole sync. Offenders stay in WatermelonDB with synced_at=null and
        // are surfaced by SyncProvider's pendingEventsCount so the scorer
        // knows something is stuck.
        const pushablePayloads = createdEvents
          .map((e) => {
            const payload = safeParsePayload(e.payload as string);
            if (payload === null) return null;
            return {
              id: e.remote_id as string,
              game_id: e.game_remote_id as string,
              sequence_number: e.sequence_number as number,
              event_type: e.event_type as string,
              inning: e.inning as number,
              is_top_of_inning: e.is_top_of_inning as boolean,
              payload,
              occurred_at: new Date(e.occurred_at as number).toISOString(),
              created_by: e.created_by as string,
              device_id: e.device_id as string,
            };
          })
          .filter((p) => p !== null);

        if (pushablePayloads.length > 0) {
          const { error } = await supabase.from('game_events').upsert(
            pushablePayloads,
            { onConflict: 'id', ignoreDuplicates: true },
          );

          if (error) {
            // Sequence number collision — another device already used these
            // sequence numbers for the same game. Renumber the local WDB
            // records so they start above the server's current max, then
            // throw so WatermelonDB leaves them in the unsynced queue; the
            // next sync cycle will push the renumbered events.
            if (error.code === '23505') {
              await reconcileSequenceNumbers(createdEvents, supabase);
              throw new Error('sync: seq-num collision; renumbered locally, will retry');
            }
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
  // channel_members is filtered to the current user in the pull query
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
