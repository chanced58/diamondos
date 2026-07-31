import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listGameRsvpsForPlayers, upsertGameRsvp } from '@baseball/database';
import type { GameRsvpStatus } from '@baseball/shared';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';
import { useRole } from '../../providers/RoleProvider';

export interface RsvpPlayer {
  playerId: string;
  playerName: string;
}

interface LinkedPlayerRow {
  id: string;
  first_name: string;
  last_name: string;
  team_id: string;
  is_active: boolean;
}

/**
 * Resolves the signed-in user's RSVP-able players on the active team (self,
 * if a player; linked children, if a parent) and loads/updates their RSVPs
 * for a set of games. Online-only — direct Supabase, no WatermelonDB mirror.
 */
export function useGameRsvps(gameIds: string[]) {
  const { user } = useAuth();
  const { activeTeam } = useRole();
  const [myPlayers, setMyPlayers] = useState<RsvpPlayer[]>([]);
  const [rsvpByKey, setRsvpByKey] = useState<Map<string, GameRsvpStatus>>(new Map());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Last server-confirmed status per key — rollback target on a failed write.
  // Not the same as rsvpByKey, which also holds unconfirmed optimistic values.
  const confirmedRef = useRef(new Map<string, GameRsvpStatus>());
  // Per-key promise chain so concurrent taps on the same player/game are sent
  // to the database in tap order, one at a time, instead of racing.
  const queueRef = useRef(new Map<string, Promise<unknown>>());

  useEffect(() => {
    if (!user || !activeTeam) {
      setMyPlayers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      const players: RsvpPlayer[] = [];

      if (activeTeam.playerId) {
        const { data, error: selfErr } = await supabase
          .from('players')
          .select('id, first_name, last_name')
          .eq('id', activeTeam.playerId)
          .eq('team_id', activeTeam.teamId)
          .eq('is_active', true)
          .maybeSingle();
        if (selfErr) console.warn('useGameRsvps: self player lookup failed', selfErr);
        if (data) {
          players.push({ playerId: data.id, playerName: `${data.first_name} ${data.last_name}` });
        }
      }

      const { data: links, error: linksErr } = await supabase
        .from('parent_player_links')
        .select('player_id, players(id, first_name, last_name, team_id, is_active)')
        .eq('parent_user_id', user.id);
      if (linksErr) console.warn('useGameRsvps: linked player lookup failed', linksErr);

      for (const link of links ?? []) {
        const raw = link.players as unknown;
        const p = (Array.isArray(raw) ? raw[0] : raw) as LinkedPlayerRow | null;
        if (
          p &&
          p.team_id === activeTeam.teamId &&
          p.is_active &&
          !players.some((existing) => existing.playerId === p.id)
        ) {
          players.push({ playerId: p.id, playerName: `${p.first_name} ${p.last_name}` });
        }
      }

      if (!cancelled) setMyPlayers(players);
    })().catch((err) => {
      if (!cancelled) console.warn('useGameRsvps: player resolution failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeTeam?.teamId, activeTeam?.playerId]);

  const playerIds = useMemo(() => myPlayers.map((p) => p.playerId), [myPlayers]);
  const gameIdsKey = gameIds.join(',');
  const playerIdsKey = playerIds.join(',');

  useEffect(() => {
    if (playerIds.length === 0 || gameIds.length === 0) {
      setRsvpByKey(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await listGameRsvpsForPlayers(getSupabaseClient(), gameIds, playerIds);
        if (cancelled) return;
        const loaded = new Map(rows.map((r) => [`${r.gameId}:${r.playerId}`, r.status]));
        setRsvpByKey(loaded);
        confirmedRef.current = new Map(loaded);
      } catch (err) {
        console.warn('useGameRsvps: load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameIdsKey, playerIdsKey]);

  const setRsvp = useCallback(
    async (gameId: string, playerId: string, status: GameRsvpStatus) => {
      if (!user) return;
      const key = `${gameId}:${playerId}`;
      setRsvpByKey((m) => new Map(m).set(key, status));
      setSavingKeys((s) => new Set(s).add(key));
      setError(null);

      // Chain onto any write already in flight for this key so a rapid
      // second tap is sent only after the first settles — otherwise the two
      // requests could reach the database out of order and leave a stale
      // status persisted. `.catch(() => {})` lets this mutation start even if
      // the one ahead of it failed.
      const queuedAhead = queueRef.current.get(key) ?? Promise.resolve();
      const thisMutation = queuedAhead.catch(() => {}).then(() =>
        upsertGameRsvp(getSupabaseClient(), { gameId, playerId, status, respondedBy: user.id }),
      );
      queueRef.current.set(key, thisMutation);

      const isLatest = () => queueRef.current.get(key) === thisMutation;

      try {
        await thisMutation;
        confirmedRef.current.set(key, status);
        if (isLatest()) {
          setSavingKeys((s) => {
            const next = new Set(s);
            next.delete(key);
            return next;
          });
        }
      } catch (err) {
        console.warn('useGameRsvps: upsert failed', err);
        // Only the most recently queued mutation for this key may roll back
        // or report an error — an earlier failure settling after a newer,
        // still-in-flight (or already-succeeded) tap must not touch it.
        if (isLatest()) {
          const confirmed = confirmedRef.current.get(key);
          setRsvpByKey((m) => {
            const next = new Map(m);
            if (confirmed === undefined) next.delete(key);
            else next.set(key, confirmed);
            return next;
          });
          setError('Could not save RSVP. Please try again.');
          setSavingKeys((s) => {
            const next = new Set(s);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [user],
  );

  return { myPlayers, rsvpByKey, savingKeys, setRsvp, loading, error };
}
