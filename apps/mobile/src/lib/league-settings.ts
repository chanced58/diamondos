import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  defaultLeagueScoringSettings,
  mergeWithDefaults,
  type LeagueScoringSettings,
  type PitchComplianceRule,
} from '@baseball/shared';
import { getSupabaseClient } from './supabase';

const CACHE_KEY_PREFIX = 'league_scoring_settings_v1__';
const LEAGUE_ID_CACHE_KEY_PREFIX = 'league_id_v1__';
const PITCH_RULE_CACHE_KEY_PREFIX = 'pitch_rule_v1__';

function cacheKey(teamId: string): string {
  return `${CACHE_KEY_PREFIX}${teamId}`;
}

function leagueIdCacheKey(teamId: string): string {
  return `${LEAGUE_ID_CACHE_KEY_PREFIX}${teamId}`;
}

function pitchRuleCacheKey(teamId: string): string {
  return `${PITCH_RULE_CACHE_KEY_PREFIX}${teamId}`;
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

async function readPitchRuleCache(teamId: string): Promise<PitchComplianceRule | null> {
  try {
    const raw = await SecureStore.getItemAsync(pitchRuleCacheKey(teamId));
    if (!raw) return null; // '' = confirmed no rule
    return JSON.parse(raw) as PitchComplianceRule;
  } catch (err) {
    console.warn(
      `[league-settings] readPitchRuleCache failed team=${teamId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function writePitchRuleCache(teamId: string, rule: PitchComplianceRule | null): Promise<void> {
  try {
    await SecureStore.setItemAsync(pitchRuleCacheKey(teamId), rule ? JSON.stringify(rule) : '');
  } catch (err) {
    console.warn(
      `[league-settings] writePitchRuleCache failed team=${teamId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface LeagueContext {
  settings: LeagueScoringSettings;
  /** Active league id for the team; null when unknown or the team has no league. */
  leagueId: string | null;
  /**
   * The league's default pitch compliance rule
   * (settings.compliance.defaultPitchRuleId), cached for offline use.
   * v1 limitation: per-player rule overrides and DOB-based auto-matching
   * stay server-side (resolve_compliance_rule_for_player) — mobile shows
   * the league default only. Null when the league sets no default rule.
   */
  pitchRule: PitchComplianceRule | null;
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
  const [pitchRule, setPitchRule] = useState<PitchComplianceRule | null>(null);

  useEffect(() => {
    if (!teamId) {
      setSettings(defaultLeagueScoringSettings());
      setLeagueId(null);
      setPitchRule(null);
      return;
    }
    // Reset before seeding the new team so a previous team's league can't
    // leak into callers (e.g. guest registration) while the cache resolves.
    setSettings(defaultLeagueScoringSettings());
    setLeagueId(null);
    setPitchRule(null);
    let cancelled = false;
    // Guards the cache seeds against racing the network refresh: SecureStore
    // resolving late must not clobber fresher Supabase-derived state.
    let refreshed = false;

    // (a) seed from cache immediately
    void readCache(teamId).then((cached) => {
      if (!cancelled && !refreshed && cached) setSettings(cached);
    });
    void getCachedLeagueId(teamId).then((cached) => {
      if (!cancelled && !refreshed && cached) setLeagueId(cached);
    });
    void readPitchRuleCache(teamId).then((cached) => {
      if (!cancelled && !refreshed && cached) setPitchRule(cached);
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
      // From here on the network is authoritative — stop late cache seeds.
      refreshed = true;
      if (!membership?.league_id) {
        const defaults = defaultLeagueScoringSettings();
        if (!cancelled) {
          setSettings(defaults);
          setLeagueId(null);
          setPitchRule(null);
        }
        await writeCache(teamId, defaults);
        await writeLeagueIdCache(teamId, ''); // '' = confirmed no league
        await writePitchRuleCache(teamId, null);
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

      // Resolve the league's default pitch compliance rule for offline
      // pitch-count warnings. Failures keep the cached rule (best-effort).
      const ruleId = next.compliance.defaultPitchRuleId;
      if (!ruleId) {
        if (!cancelled) setPitchRule(null);
        await writePitchRuleCache(teamId, null);
        return;
      }
      const { data: ruleRow, error: ruleErr } = await supabase
        .from('pitch_compliance_rules')
        .select('*')
        .eq('id', ruleId)
        .eq('is_active', true)
        .maybeSingle();
      if (ruleErr) {
        console.warn(
          `[league-settings] pitch_compliance_rules lookup failed team=${teamId} rule=${ruleId}: ${ruleErr.message}`,
        );
        return; // keep cached rule
      }
      const rule: PitchComplianceRule | null = ruleRow
        ? {
            id: ruleRow.id,
            teamId: ruleRow.team_id ?? undefined,
            ruleName: ruleRow.rule_name,
            maxPitchesPerDay: ruleRow.max_pitches_per_day,
            restDayThresholds: (ruleRow.rest_day_thresholds ?? {}) as Record<string, number>,
            ageMin: ruleRow.age_min ?? undefined,
            ageMax: ruleRow.age_max ?? undefined,
            appliesFrom: ruleRow.applies_from ?? undefined,
            appliesUntil: ruleRow.applies_until ?? undefined,
            isActive: ruleRow.is_active,
            createdAt: ruleRow.created_at,
          }
        : null;
      if (!cancelled) setPitchRule(rule);
      await writePitchRuleCache(teamId, rule);
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return { settings, leagueId, pitchRule };
}
