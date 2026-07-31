import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(true);

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
        const { data } = await supabase
          .from('players')
          .select('id, first_name, last_name')
          .eq('id', activeTeam.playerId)
          .maybeSingle();
        if (data) {
          players.push({ playerId: data.id, playerName: `${data.first_name} ${data.last_name}` });
        }
      }

      const { data: links } = await supabase
        .from('parent_player_links')
        .select('player_id, players(id, first_name, last_name, team_id, is_active)')
        .eq('parent_user_id', user.id);

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
        setRsvpByKey(new Map(rows.map((r) => [`${r.gameId}:${r.playerId}`, r.status])));
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
      const previous = rsvpByKey;
      setRsvpByKey((m) => new Map(m).set(key, status));
      try {
        await upsertGameRsvp(getSupabaseClient(), {
          gameId,
          playerId,
          status,
          respondedBy: user.id,
        });
      } catch (err) {
        console.warn('useGameRsvps: upsert failed', err);
        setRsvpByKey(previous);
      }
    },
    [rsvpByKey, user],
  );

  return { myPlayers, rsvpByKey, setRsvp, loading };
}
