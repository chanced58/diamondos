import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  defaultLeagueScoringSettings,
  mergeWithDefaults,
  type LeagueScoringSettings,
} from '@baseball/shared';
import { getSupabaseClient } from './supabase';

const CACHE_KEY_PREFIX = 'league_scoring_settings_v1__';

function cacheKey(teamId: string): string {
  return `${CACHE_KEY_PREFIX}${teamId}`;
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

/**
 * Resolve the active league settings for a team, with SecureStore-backed
 * offline caching.
 *
 * On mount we (a) seed from any cached value so scoring respects the league
 * gates immediately even with no network, then (b) refresh from Supabase in
 * the background and update both state and cache when the fetch returns.
 *
 * This keeps the offline-first promise of the mobile scoring app without
 * having to add a full WatermelonDB table for what is effectively a small
 * per-team JSON blob.
 */
export function useLeagueSettings(teamId: string | undefined): LeagueScoringSettings {
  const [settings, setSettings] = useState<LeagueScoringSettings>(defaultLeagueScoringSettings);

  useEffect(() => {
    if (!teamId) {
      setSettings(defaultLeagueScoringSettings());
      return;
    }
    let cancelled = false;

    // (a) seed from cache immediately
    void readCache(teamId).then((cached) => {
      if (!cancelled && cached) setSettings(cached);
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
        return; // keep cached value
      }
      if (!membership?.league_id) {
        const defaults = defaultLeagueScoringSettings();
        if (!cancelled) setSettings(defaults);
        await writeCache(teamId, defaults);
        return;
      }

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

  return settings;
}
