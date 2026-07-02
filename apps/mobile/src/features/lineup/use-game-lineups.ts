import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../db';
import type { GameLineup } from '../../db/models/GameLineup';

/**
 * Reactive observation of a game's local lineup rows. `loaded` flips once the
 * first emission arrives — always quickly, since it's a local read, but
 * callers must still gate slot math on it so a race can't compute against an
 * unloaded lineup.
 */
export function useGameLineups(gameRemoteId: string): {
  rows: GameLineup[];
  loaded: boolean;
} {
  const [rows, setRows] = useState<GameLineup[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const subscription = database
      .get<GameLineup>('game_lineups')
      .query(Q.where('game_remote_id', gameRemoteId))
      .observe()
      .subscribe((next) => {
        setRows(next);
        setLoaded(true);
      });
    return () => subscription.unsubscribe();
  }, [gameRemoteId]);

  return { rows, loaded };
}
