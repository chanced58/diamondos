import { useCallback, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';
import {
  resolveTournamentGameSettingsCache,
  TOURNAMENT_SCORING_RULES_VERSION,
  type LeagueScoringSettings,
} from '@baseball/shared';
import { database } from '../db';
import type { Game } from '../db/models/Game';
import { getSupabaseClient } from './supabase';

export interface GameScoringSettingsState {
  status: 'loading' | 'ready' | 'error';
  isTournament: boolean | null;
  tournamentId: string | null;
  settings: LeagueScoringSettings | null;
  error: string | null;
  retry: () => void;
}

type SettingsStateWithoutRetry = Omit<GameScoringSettingsState, 'retry'>;

const EMPTY_STATE: SettingsStateWithoutRetry = {
  status: 'loading',
  isTournament: null,
  tournamentId: null,
  settings: null,
  error: null,
};

async function findLocalGame(gameId: string): Promise<Game | null> {
  const games = await database.get<Game>('games').query(Q.where('remote_id', gameId)).fetch();
  return games[0] ?? null;
}

function readTournamentCache(game: Game): LeagueScoringSettings {
  let scoringSettings: unknown;
  try {
    scoringSettings = game.tournamentScoringSettings
      ? JSON.parse(game.tournamentScoringSettings)
      : null;
  } catch {
    scoringSettings = null;
  }
  return resolveTournamentGameSettingsCache({
    tournamentId: game.tournamentId,
    rulesVersion: game.tournamentRulesVersion,
    scoringSettings,
  });
}

async function persistTournamentCache(
  gameId: string,
  teamId: string,
  gameRow: Record<string, unknown>,
  tournamentId: string,
  scoringSettings: unknown,
): Promise<void> {
  const settingsJson = JSON.stringify(scoringSettings);
  const collection = database.get<Game>('games');
  const localGame = await findLocalGame(gameId);

  if (localGame) {
    await database.write(async () => {
      await localGame.update((record) => {
        record.tournamentId = tournamentId;
        record.tournamentScoringSettings = settingsJson;
        record.tournamentRulesVersion = TOURNAMENT_SCORING_RULES_VERSION;
      });
    });
    return;
  }

  await database.write(async () => {
    await collection.create((record) => {
      record._raw.id = gameId;
      record.remoteId = gameId;
      record.seasonId = String(gameRow.season_id ?? '');
      record.teamId = teamId;
      record.opponentName = String(gameRow.opponent_name ?? '');
      record.scheduledAt = new Date(String(gameRow.scheduled_at)).getTime();
      record.timeZone = typeof gameRow.time_zone === 'string' ? gameRow.time_zone : undefined;
      record.locationType = String(gameRow.location_type ?? 'home');
      record.neutralHomeTeam =
        gameRow.neutral_home_team == null ? undefined : String(gameRow.neutral_home_team);
      record.venueName = gameRow.venue_name == null ? undefined : String(gameRow.venue_name);
      record.status = String(gameRow.status ?? 'scheduled');
      record.homeScore = Number(gameRow.home_score ?? 0);
      record.awayScore = Number(gameRow.away_score ?? 0);
      record.currentInning = Number(gameRow.current_inning ?? 1);
      record.isTopOfInning = Boolean(gameRow.is_top_of_inning ?? true);
      record.outs = Number(gameRow.outs ?? 0);
      record.syncedAt = Date.now();
      record.tournamentId = tournamentId;
      record.tournamentScoringSettings = settingsJson;
      record.tournamentRulesVersion = TOURNAMENT_SCORING_RULES_VERSION;
    });
  });
}

/** Loads rules for one game and uses only that game's durable tournament cache offline. */
export function useGameScoringSettings(gameId: string | undefined): GameScoringSettingsState {
  const [resolved, setResolved] = useState<{ gameId: string | undefined; state: SettingsStateWithoutRetry }>({
    gameId: undefined, state: EMPTY_STATE,
  });
  const state = resolved.gameId === gameId ? resolved.state : EMPTY_STATE;
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    const setState = (nextState: SettingsStateWithoutRetry) => setResolved({ gameId, state: nextState });
    if (!gameId) {
      setState({
        status: 'error',
        isTournament: null,
        tournamentId: null,
        settings: null,
        error: 'Game details are missing. Reopen this game to load its scoring rules.',
      });
      return;
    }
    const currentGameId = gameId;
    let cancelled = false;
    let cacheRevision = 0;
    let observedCache = false;
    setState(EMPTY_STATE);

    // A start/reconnect can pull a newer frozen snapshot while this screen is
    // still open. Observe only rule columns so ordinary pitches do not reload it.
    const cacheSubscription = database.get<Game>('games').query(Q.where('remote_id', currentGameId))
      .observeWithColumns(['tournament_id', 'tournament_scoring_settings', 'tournament_rules_version'])
      .subscribe({
        next: (games) => {
          if (cancelled || !games[0]?.tournamentId) return;
          if (observedCache) cacheRevision += 1;
          observedCache = true;
          try {
            setState({ status: 'ready', isTournament: true, tournamentId: games[0].tournamentId,
              settings: readTournamentCache(games[0]), error: null });
          } catch (error) {
            setState({ status: 'error', isTournament: true, tournamentId: games[0].tournamentId,
              settings: null, error: error instanceof Error ? error.message : 'Downloaded tournament rules are invalid.' });
          }
        },
        error: (error) => {
          console.warn(`Could not observe game rules game=${currentGameId}:`, error);
        },
      });

    async function load() {
      const revisionAtLoad = cacheRevision;
      let localGame: Game | null = null;
      try {
        localGame = await findLocalGame(currentGameId);
        const connection = await NetInfo.fetch();
        const offline =
          connection.isConnected === false || connection.isInternetReachable === false;
        if (offline) {
          if (localGame?.tournamentId) {
            const settings = readTournamentCache(localGame);
            if (!cancelled)
              setState({
                status: 'ready',
                isTournament: true,
                tournamentId: localGame.tournamentId,
                settings,
                error: null,
              });
          } else if (localGame) {
            if (!cancelled)
              setState({
                status: 'ready',
                isTournament: false,
                tournamentId: null,
                settings: null,
                error: null,
              });
          } else {
            throw new Error(
              'This game has not been downloaded to this device. Connect and sync it before scoring offline.',
            );
          }
          return;
        }

        const supabase = getSupabaseClient();
        const { data: gameRow, error: gameError } = await supabase
          .from('games')
          .select(
            'id, team_id, season_id, opponent_name, scheduled_at, time_zone, location_type, neutral_home_team, venue_name, status, home_score, away_score, current_inning, is_top_of_inning, outs, tournament_id, scoring_settings_snapshot',
          )
          .eq('id', currentGameId)
          .maybeSingle();

        if (gameError) throw gameError;
        if (!gameRow) throw new Error('Game was not found. Refresh the schedule and try again.');
        const tournamentId = gameRow.tournament_id;
        if (!tournamentId) {
          if (!cancelled)
            setState({
              status: 'ready',
              isTournament: false,
              tournamentId: null,
              settings: null,
              error: null,
            });
          return;
        }

        let scoringSettings: unknown = gameRow.scoring_settings_snapshot;
        if (scoringSettings == null) {
          const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('scoring_settings')
            .eq('id', tournamentId)
            .maybeSingle();
          if (tournamentError) throw tournamentError;
          scoringSettings = tournament?.scoring_settings ?? null;
        }
        const settings = resolveTournamentGameSettingsCache({
          tournamentId,
          rulesVersion: TOURNAMENT_SCORING_RULES_VERSION,
          scoringSettings,
        });
        // The sync observer has a newer snapshot; do not overwrite it with
        // the response from a request begun before that pull finished.
        if (cacheRevision !== revisionAtLoad) return;
        await persistTournamentCache(
          currentGameId,
          gameRow.team_id,
          gameRow as Record<string, unknown>,
          tournamentId,
          scoringSettings,
        );
        if (!cancelled)
          setState({
            status: 'ready',
            isTournament: true,
            tournamentId,
            settings,
            error: null,
          });
      } catch (error) {
        if (!cancelled && localGame?.tournamentId) {
          try {
            const settings = readTournamentCache(localGame);
            setState({
              status: 'ready',
              isTournament: true,
              tournamentId: localGame.tournamentId,
              settings,
              error: null,
            });
            return;
          } catch {
            // Report the online error below when no valid downloaded copy exists.
          }
        }
        if (!cancelled && localGame && !localGame.tournamentId) {
          setState({
            status: 'ready',
            isTournament: false,
            tournamentId: null,
            settings: null,
            error: null,
          });
          return;
        }
        if (!cancelled) {
          setState({
            status: 'error',
            isTournament: localGame?.tournamentId ? true : null,
            tournamentId: localGame?.tournamentId ?? null,
            settings: null,
            error: error instanceof Error ? error.message : 'Tournament rules could not be loaded.',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      cacheSubscription.unsubscribe();
    };
  }, [gameId, attempt]);

  return { ...state, retry };
}
