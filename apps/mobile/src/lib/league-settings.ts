import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  defaultLeagueScoringSettings,
  mergeWithDefaults,
  type LeagueScoringSettings,
} from '@baseball/shared';
import { getSupabaseClient } from './supabase';

const CACHE_KEY_PREFIX = 'league_scoring_settings_v1__';
const LEAGUE_ID_CACHE_KEY_PREFIX = 'league_id_v1__';

function cacheKey(teamId: string): string {
  return `${CACHE_KEY_PREFIX}${teamId}`;
}

function leagueIdCacheKey(teamId: string): string {
  return `${LEAGUE_ID_CACHE_KEY_PREFIX}${teamId}`;
}

/**
 * The team's league id from the SecureStore cache, without a network call.
 * Returns null when the team has no league or the lookup has never succeeded
 * online for this team ('' is cached for "no league").
 */
async function getCachedLeagueId(teamId: string): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(leagueIdCacheKey(teamId));
    return raw ? raw : null;
  } catch (err) {
    console.warn(
      `[league-settings] getCachedLeagueId failed team=${teamId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function writeLeagueIdCache(teamId: string, leagueId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(leagueIdCacheKey(teamId), leagueId);
  } catch (err) {
    console.warn(
      `[league-settings] writeLeagueIdCache failed team=${teamId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function readCache(teamId: string): Promise<LeagueScoringSettings | null> {
  try {
    const raw = await SecureStore.getItemAsync(cacheKey(teamId));
    if (!raw) return null;
    return mergeWithDefaults(JSON.parse(raw));
  } catch (err) {
    console.warn(
      `[league-settings] readCache failed team=${teamId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function writeCache(teamId: string, settings: LeagueScoringSettings): Promise<void> {
  try {
    await SecureStore.setItemAsync(cacheKey(teamId), JSON.stringify(settings));
  } catch (err) {
    // best-effort: a cache miss next launch is acceptable but worth logging
    console.warn(
      `[league-settings] writeCache failed team=${teamId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface LeagueContext {
  settings: LeagueScoringSettings;
  /** Active league id for the team; null when unknown or the team has no league. */
  leagueId: string | null;
}

/**
 * Resolve the active league settings and league id for a team, with
 * SecureStore-backed offline caching (the league id is needed offline by the
 * guest flow to register new guests in the league pool).
 *
 * On mount we (a) seed from any cached values so scoring respects the league
 * gates immediately even with no network, then (b) refresh from Supabase in
 * the background and update both state and cache when the fetch returns.
 *
 * This keeps the offline-first promise of the mobile scoring app without
 * having to add a full WatermelonDB table for what is effectively a small
 * per-team JSON blob.
 */
export function useLeagueContext(teamId: string | undefined): LeagueContext {
  const [settings, setSettings] = useState<LeagueScoringSettings>(defaultLeagueScoringSettings);
  const [leagueId, setLeagueId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) {
      setSettings(defaultLeagueScoringSettings());
      setLeagueId(null);
      return;
    }
    let cancelled = false;

    // (a) seed from cache immediately
    void readCache(teamId).then((cached) => {
      if (!cancelled && cached) setSettings(cached);
    });
    void getCachedLeagueId(teamId).then((cached) => {
      if (!cancelled && cached) setLeagueId(cached);
    });

    // (b) refresh in the background
    (async () => {
      const supabase = getSupabaseClient();
      const { data: membership, error: membershipErr } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (membershipErr) {
        console.warn(
          `[league-settings] league_members lookup failed team=${teamId}: ${membershipErr.message}`,
        );
        return; // keep cached values
      }
      if (!membership?.league_id) {
        const defaults = defaultLeagueScoringSettings();
        if (!cancelled) {
          setSettings(defaults);
          setLeagueId(null);
        }
        await writeCache(teamId, defaults);
        await writeLeagueIdCache(teamId, ''); // '' = confirmed no league
        return;
      }

      if (!cancelled) setLeagueId(membership.league_id);
      await writeLeagueIdCache(teamId, membership.league_id);

      const { data: leagueRow, error: leagueErr } = await supabase
        .from('leagues')
        .select('scoring_settings')
        .eq('id', membership.league_id)
        .maybeSingle();
      if (leagueErr) {
        console.warn(
          `[league-settings] leagues.scoring_settings lookup failed team=${teamId} league=${membership.league_id}: ${leagueErr.message}`,
        );
        return;
      }

      const next = mergeWithDefaults(leagueRow?.scoring_settings ?? {});
      if (!cancelled) setSettings(next);
      await writeCache(teamId, next);
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return { settings, leagueId };
}
