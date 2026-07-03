import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database, GameLineup, LeaguePlayer, Player } from '../../db';
import {
  addExistingGuestToLineup,
  createLocalGuest,
} from '../lineup/local-guest';
import { useSyncContext } from '../../providers/SyncProvider';

interface GuestPlayerModalProps {
  visible: boolean;
  gameId: string;
  teamId: string;
  /** Active league id (from useLeagueContext); null skips pool registration and hides the pool tab. */
  leagueId: string | null;
  defaultCountTowardStats: boolean;
  /** Cap from the league's lineup.maxBatters (or 9 if expanded lineups are off). */
  maxBatters: number;
  onClose: () => void;
}

interface PoolCandidate {
  playerRemoteId: string;
  name: string;
  jerseyNumber: number | undefined;
  isGuestOnly: boolean;
}

/**
 * Offline-first guest-player flow. Two tabs:
 *  - "New guest": creates a guest-only identity + lineup row + league-pool
 *    registration locally (createLocalGuest); the sync engine pushes them
 *    when connectivity returns.
 *  - "League pool": picks from the locally synced league_players registry
 *    (players from any team who have appeared in the league).
 */
export function GuestPlayerModal({
  visible,
  gameId,
  teamId,
  leagueId,
  defaultCountTowardStats,
  maxBatters,
  onClose,
}: GuestPlayerModalProps) {
  const { triggerSync } = useSyncContext();
  const [tab, setTab] = useState<'new' | 'pool'>('new');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [countTowardStats, setCountTowardStats] = useState(defaultCountTowardStats);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [poolSearch, setPoolSearch] = useState('');
  const [poolCandidates, setPoolCandidates] = useState<PoolCandidate[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);

  function reset() {
    setTab('new');
    setFirstName('');
    setLastName('');
    setJerseyNumber('');
    setCountTowardStats(defaultCountTowardStats);
    setError(null);
    setSubmitting(false);
    setPoolSearch('');
  }

  // Load the league guest pool from local data lazily, on first switch to
  // the pool tab (most opens never leave the new-guest form): league_players
  // joined (in JS) to players, minus the coach's own roster and anyone
  // already in this game's lineup.
  useEffect(() => {
    if (!visible || tab !== 'pool' || !leagueId) {
      setPoolCandidates([]);
      return;
    }
    let cancelled = false;
    setPoolLoading(true);
    (async () => {
      try {
        const registrations = await database
          .get<LeaguePlayer>('league_players')
          .query(Q.where('league_id', leagueId))
          .fetch();
        if (registrations.length === 0) {
          if (!cancelled) setPoolCandidates([]);
          return;
        }
        const registeredIds = registrations.map((r) => r.playerRemoteId);
        const [players, lineupRows] = await Promise.all([
          database
            .get<Player>('players')
            .query(Q.where('remote_id', Q.oneOf(registeredIds)), Q.where('is_active', true))
            .fetch(),
          database
            .get<GameLineup>('game_lineups')
            .query(Q.where('game_remote_id', gameId))
            .fetch(),
        ]);
        const inLineup = new Set(lineupRows.map((row) => row.playerRemoteId));
        if (cancelled) return;
        setPoolCandidates(
          players
            .filter((p) => p.teamId !== teamId && !inLineup.has(p.remoteId))
            .map((p) => ({
              playerRemoteId: p.remoteId,
              name: p.fullName,
              jerseyNumber: p.jerseyNumber,
              isGuestOnly: p.isGuestOnly,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, tab, leagueId, gameId, teamId]);

  async function handleAddNew() {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError('First and last name are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const parsedJersey = jerseyNumber.trim() === '' ? null : Number.parseInt(jerseyNumber, 10);
      const result = await createLocalGuest({
        gameRemoteId: gameId,
        leagueId,
        firstName: trimmedFirst,
        lastName: trimmedLast,
        jerseyNumber: Number.isFinite(parsedJersey ?? NaN) ? parsedJersey : null,
        countTowardStats,
        maxBatters,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      triggerSync().catch(console.warn);
      reset();
      onClose();
    } catch (err) {
      console.warn(`[guest-modal] local guest create failed game=${gameId} team=${teamId}:`, err);
      setError('Could not save the guest on this device. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddExisting(candidate: PoolCandidate) {
    setSubmitting(true);
    setError(null);
    try {
      const result = await addExistingGuestToLineup({
        gameRemoteId: gameId,
        playerRemoteId: candidate.playerRemoteId,
        countTowardStats,
        maxBatters,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      triggerSync().catch(console.warn);
      reset();
      onClose();
    } catch (err) {
      console.warn(
        `[guest-modal] pool guest add failed game=${gameId} player=${candidate.playerRemoteId}:`,
        err,
      );
      setError('Could not add the guest on this device. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const normalizedPoolSearch = poolSearch.trim().toLowerCase();
  const filteredPool = normalizedPoolSearch
    ? poolCandidates.filter((c) => c.name.toLowerCase().includes(normalizedPoolSearch))
    : poolCandidates;

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
          <Text className="text-sm text-gray-500 mb-3">
            Adds a non-roster batter to the end of the order. Saved offline and
            synced when you're back online.
          </Text>

          {leagueId && (
            <View className="flex-row mb-4 bg-gray-100 rounded-lg p-1">
              <TouchableOpacity
                onPress={() => setTab('new')}
                disabled={submitting}
                className={`flex-1 rounded-md py-1.5 items-center ${tab === 'new' ? 'bg-white' : ''}`}
              >
                <Text className={`text-sm font-semibold ${tab === 'new' ? 'text-gray-900' : 'text-gray-500'}`}>
                  New guest
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTab('pool')}
                disabled={submitting}
                className={`flex-1 rounded-md py-1.5 items-center ${tab === 'pool' ? 'bg-white' : ''}`}
              >
                <Text className={`text-sm font-semibold ${tab === 'pool' ? 'text-gray-900' : 'text-gray-500'}`}>
                  League pool
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView keyboardShouldPersistTaps="handled">
            {error && (
              <View className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <Text className="text-sm text-red-700">{error}</Text>
              </View>
            )}

            {tab === 'new' ? (
              <>
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
              </>
            ) : (
              <>
                <TextInput
                  value={poolSearch}
                  onChangeText={setPoolSearch}
                  placeholder="Search league players…"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 mb-3"
                  editable={!submitting}
                />
                {poolLoading ? (
                  <Text className="text-sm text-gray-500 mb-4">Loading league players…</Text>
                ) : filteredPool.length === 0 ? (
                  <Text className="text-sm text-gray-500 mb-4">
                    {poolCandidates.length === 0
                      ? 'No league players synced yet.'
                      : 'No matches.'}
                  </Text>
                ) : (
                  <View className="mb-4" style={{ maxHeight: 240 }}>
                    <ScrollView nestedScrollEnabled>
                      {filteredPool.map((candidate) => (
                        <TouchableOpacity
                          key={candidate.playerRemoteId}
                          onPress={() => handleAddExisting(candidate)}
                          disabled={submitting}
                          className="flex-row items-center justify-between border-b border-gray-100 py-2.5"
                        >
                          <Text className="text-sm text-gray-900">
                            {candidate.name}
                            {candidate.jerseyNumber != null ? `  #${candidate.jerseyNumber}` : ''}
                          </Text>
                          <Text className="text-xs text-gray-400">
                            {candidate.isGuestOnly ? 'Guest pool' : 'Other team'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

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
              {tab === 'new' && (
                <TouchableOpacity
                  onPress={handleAddNew}
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
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
