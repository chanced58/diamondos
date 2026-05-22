import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { getSupabaseClient } from '../../lib/supabase';

interface GuestPlayerModalProps {
  visible: boolean;
  gameId: string;
  teamId: string;
  defaultCountTowardStats: boolean;
  /** Cap from the league's lineup.maxBatters (or 9 if expanded lineups are off). */
  maxBatters: number;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Minimal v1 mobile guest-player flow: ad-hoc new guest only.
 *
 * Creates a `players` row with `team_id=null, is_guest_only=true`, links the
 * player to the team's league via `league_players`, and inserts a guest
 * lineup row at the next available batting-order slot. The search-from-
 * history flow (mirroring the web picker tabs) is intentionally deferred to
 * a follow-up to keep the in-game UX simple.
 */
export function GuestPlayerModal({
  visible,
  gameId,
  teamId,
  defaultCountTowardStats,
  maxBatters,
  onClose,
  onAdded,
}: GuestPlayerModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [countTowardStats, setCountTowardStats] = useState(defaultCountTowardStats);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setFirstName('');
    setLastName('');
    setJerseyNumber('');
    setCountTowardStats(defaultCountTowardStats);
    setError(null);
    setSubmitting(false);
  }

  async function handleAdd() {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError('First and last name are required.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const supabase = getSupabaseClient();

    try {
      // 1. Pick the next batting_order slot and enforce the league cap. We
      //    rely on the (game_id, batting_order) unique constraint as the
      //    final-line race guard: two concurrent adds will both try the
      //    same slot and the second will get a 23505, which we surface
      //    cleanly to the coach.
      const { data: maxRow, error: maxErr } = await supabase
        .from('game_lineups')
        .select('batting_order')
        .eq('game_id', gameId)
        .not('batting_order', 'is', null)
        .order('batting_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr) {
        console.warn(
          `[guest-modal] batting_order lookup failed game=${gameId}: ${maxErr.message}`,
        );
        setError('Could not load current lineup. Try again.');
        return;
      }
      const nextOrder = ((maxRow?.batting_order as number | null) ?? 0) + 1;
      if (nextOrder > maxBatters) {
        setError(`Lineup is already at the league cap (${maxBatters}).`);
        return;
      }

      // 2. Create the guest-only player identity.
      const parsedJersey = jerseyNumber.trim() === '' ? null : Number.parseInt(jerseyNumber, 10);
      const { data: newPlayer, error: playerErr } = await supabase
        .from('players')
        .insert({
          team_id: null,
          first_name: trimmedFirst,
          last_name: trimmedLast,
          jersey_number: Number.isFinite(parsedJersey ?? NaN) ? parsedJersey : null,
          is_guest_only: true,
          is_active: true,
        })
        .select('id')
        .single();
      if (playerErr || !newPlayer) {
        console.warn(
          `[guest-modal] players insert failed game=${gameId} team=${teamId}: ${playerErr?.message ?? 'no row'}`,
        );
        setError(playerErr?.message ?? 'Could not create the guest player.');
        return;
      }

      // 3. Insert the guest lineup row.
      const { error: lineupErr } = await supabase.from('game_lineups').insert({
        game_id: gameId,
        player_id: newPlayer.id,
        batting_order: nextOrder,
        is_guest: true,
        guest_display_name: `${trimmedFirst} ${trimmedLast}`,
        count_toward_stats: countTowardStats,
        is_starter: false,
      });
      if (lineupErr) {
        console.warn(
          `[guest-modal] game_lineups insert failed game=${gameId} player=${newPlayer.id}: ${lineupErr.message}`,
        );
        // Best-effort cleanup of the orphaned player row — log if it fails
        // so we can spot dangling guest identities.
        const { error: cleanupErr } = await supabase
          .from('players')
          .delete()
          .eq('id', newPlayer.id);
        if (cleanupErr) {
          console.warn(
            `[guest-modal] orphan cleanup failed player=${newPlayer.id}: ${cleanupErr.message}`,
          );
        }
        setError(
          lineupErr.code === '23505'
            ? 'Another batter just took that slot — try again.'
            : 'Could not add the guest to the lineup.',
        );
        return;
      }

      // 4. Register the guest in the team's league pool (best-effort).
      const { data: membership, error: membershipErr } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (membershipErr) {
        console.warn(
          `[guest-modal] league_members lookup failed team=${teamId}: ${membershipErr.message}`,
        );
      } else if (membership?.league_id) {
        const { error: upsertErr } = await supabase
          .from('league_players')
          .upsert(
            { league_id: membership.league_id, player_id: newPlayer.id },
            { onConflict: 'league_id,player_id', ignoreDuplicates: true },
          );
        if (upsertErr) {
          console.warn(
            `[guest-modal] league_players upsert failed league=${membership.league_id} player=${newPlayer.id}: ${upsertErr.message}`,
          );
        }
      }

      reset();
      onAdded();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5" style={{ maxHeight: '85%' }}>
          <Text className="text-lg font-bold text-gray-900 mb-1">Add Guest Player</Text>
          <Text className="text-sm text-gray-500 mb-4">
            Adds a non-roster batter to the end of the order. They'll be saved
            to this league's guest pool for next game.
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            {error && (
              <View className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <Text className="text-sm text-red-700">{error}</Text>
              </View>
            )}

            <View className="flex-row gap-3 mb-3">
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-500 mb-1">First name</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  editable={!submitting}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-medium text-gray-500 mb-1">Last name</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  editable={!submitting}
                />
              </View>
            </View>

            <View className="mb-4 w-32">
              <Text className="text-xs font-medium text-gray-500 mb-1">Jersey # (optional)</Text>
              <TextInput
                value={jerseyNumber}
                onChangeText={setJerseyNumber}
                keyboardType="number-pad"
                placeholder="##"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                editable={!submitting}
              />
            </View>

            <TouchableOpacity
              onPress={() => setCountTowardStats((v) => !v)}
              disabled={submitting}
              className="flex-row items-center gap-3 mb-5"
            >
              <View
                className={`h-5 w-5 rounded border ${countTowardStats ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-400'} items-center justify-center`}
              >
                {countTowardStats && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <Text className="text-sm text-gray-700 flex-1">
                Count this appearance toward the player's stats
              </Text>
            </TouchableOpacity>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  reset();
                  onClose();
                }}
                disabled={submitting}
                className="flex-1 rounded-xl px-5 py-3 items-center bg-gray-100"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                disabled={submitting || !firstName.trim() || !lastName.trim()}
                className={`flex-1 rounded-xl px-5 py-3 items-center ${
                  submitting || !firstName.trim() || !lastName.trim()
                    ? 'bg-emerald-300'
                    : 'bg-emerald-600'
                }`}
              >
                <Text className="text-white font-semibold">
                  {submitting ? 'Adding…' : 'Add Guest'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
