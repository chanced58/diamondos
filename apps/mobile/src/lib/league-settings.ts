import { useEffect, useState } from 'react';
import {
  defaultLeagueScoringSettings,
  mergeWithDefaults,
  type LeagueScoringSettings,
} from '@baseball/shared';
import { getSupabaseClient } from './supabase';

/**
 * Fetch the active league settings for a team, online via Supabase.
 *
 * v1 mobile path. Slice 7 will replace this with a WatermelonDB-backed
 * lookup so scoring respects league flags fully offline. In the meantime
 * a missing network (or a team not in any league) falls back to platform
 * defaults — preserving today's behavior.
 */
export function useLeagueSettings(teamId: string | undefined): LeagueScoringSettings {
  const [settings, setSettings] = useState<LeagueScoringSettings>(defaultLeagueScoringSettings);

  useEffect(() => {
    if (!teamId) {
      setSettings(defaultLeagueScoringSettings());
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      const { data: membership } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!membership?.league_id) {
        if (!cancelled) setSettings(defaultLeagueScoringSettings());
        return;
      }

      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('scoring_settings')
        .eq('id', membership.league_id)
        .maybeSingle();

      if (cancelled) return;
      setSettings(mergeWithDefaults(leagueRow?.scoring_settings ?? {}));
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return settings;
}
