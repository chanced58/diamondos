import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import type { Feature, MeLeagueRole } from '@baseball/shared';
import { getSupabaseClient } from '../lib/supabase';
import { isApiError } from '../lib/api-client';
import {
  mapMeMemberships,
  mapTeamMemberships,
  type TeamMemberRow,
  type TeamMembership,
} from '../features/teams/team-memberships';
import { fetchMe, readCachedMe, writeCachedMe } from '../features/teams/me';
import { can, isLeagueAdmin as hasLeagueAdminRole, type Capability } from '../features/teams/capabilities';
import { subscribeToTeamMembershipChanges } from '../sync/team-backfill';
import { useAuth } from './AuthProvider';

export type { TeamMembership, TeamRole } from '../features/teams/team-memberships';
export type { Capability } from '../features/teams/capabilities';

const ACTIVE_TEAM_KEY = 'diamondos.activeTeamId';
const NO_FEATURES: Feature[] = [];

interface RoleContextValue {
  loading: boolean;
  memberships: TeamMembership[];
  activeTeam: TeamMembership | null;
  setActiveTeamId: (id: string) => Promise<void>;
  isCoachSomewhere: boolean;
  /** Tier features of the active team (empty when unknown). */
  features: Feature[];
  /** The user's active league staff roles, from `/me`. */
  leagueRoles: MeLeagueRole[];
  isLeagueAdmin: boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

/**
 * Who the user is on each team, and what they may do.
 *
 * Source order, so the app starts offline and still degrades on an older web
 * deploy:
 * 1. the `/api/m/v1/me` payload cached on the device — shown at once on a
 *    cold start;
 * 2. a fresh `/me` (memberships, tier features, league roles), which replaces
 *    it and is cached for next time;
 * 3. if `/me` fails with nothing cached, a direct `team_members` read through
 *    RLS (no tier features or league roles: gating fails closed).
 */
export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [leagueRoles, setLeagueRoles] = useState<MeLeagueRole[]>([]);
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);
  // Bumped when the sync engine sees the user join or leave a team, so the
  // list reloads without waiting for the next sign-in.
  const [membershipVersion, setMembershipVersion] = useState(0);
  // The user whose teams are already published; a reload for the same user
  // refreshes in place instead of putting the tabs back on their spinner.
  const hydratedUserIdRef = useRef<string | null>(null);
  // Where the published teams came from: `/me` data (fresh or cached) is
  // kept over a failed refresh; the direct fallback read re-runs instead.
  const sourceRef = useRef<'me' | 'direct' | null>(null);

  useEffect(
    () => subscribeToTeamMembershipChanges(() => setMembershipVersion((version) => version + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    function clear() {
      sourceRef.current = null;
      setMemberships([]);
      setLeagueRoles([]);
      setActiveTeamIdState(null);
      setLoading(false);
    }

    async function readStoredActiveTeamId(): Promise<string | null> {
      try {
        return await SecureStore.getItemAsync(ACTIVE_TEAM_KEY);
      } catch (err) {
        console.warn('RoleProvider: could not read the saved active team', err);
        return null;
      }
    }

    async function hydrate() {
      if (!user) {
        hydratedUserIdRef.current = null;
        clear();
        return;
      }

      const isRefresh = hydratedUserIdRef.current === user.id;
      if (!isRefresh) setLoading(true);
      const storedActiveId = await readStoredActiveTeamId();
      if (cancelled) return;

      // Whether `/me` teams are on screen for this user (from a previous
      // hydrate or the cache below) — a failed fetch then keeps them.
      let published = isRefresh;
      let publishedFromMe = isRefresh && sourceRef.current === 'me';
      const publish = (mapped: TeamMembership[], roles: MeLeagueRole[]) => {
        const keepCurrent = published;
        hydratedUserIdRef.current = user.id;
        sourceRef.current = 'me';
        published = true;
        publishedFromMe = true;
        setMemberships(mapped);
        setLeagueRoles(roles);
        // A reload keeps the team the user is looking at, if they still have it.
        setActiveTeamIdState((current) =>
          mapped.find((m) => m.teamId === (keepCurrent ? current : null))?.teamId
          ?? mapped.find((m) => m.teamId === storedActiveId)?.teamId
          ?? mapped[0]?.teamId
          ?? null);
        setLoading(false);
      };

      if (!isRefresh) {
        const cached = await readCachedMe(user.id);
        if (cancelled) return;
        if (cached) publish(mapMeMemberships(cached.memberships), cached.leagueRoles);
      }

      try {
        const me = await fetchMe();
        if (cancelled) return;
        publish(mapMeMemberships(me.memberships), me.leagueRoles);
        void writeCachedMe(me);
        return;
      } catch (err) {
        if (cancelled) return;
        const kind = isApiError(err) ? err.kind : 'unknown';
        // Offline with teams on screen is the expected offline start.
        if (!(publishedFromMe && (kind === 'offline' || kind === 'timeout'))) {
          console.warn(`RoleProvider: /me failed (${kind}); ${publishedFromMe ? 'keeping current teams' : 'reading teams directly'}`, err);
        }
        if (publishedFromMe) return;
      }

      await hydrateFromTeamMembers(user.id, storedActiveId);
    }

    // The direct read used before `/me` existed, kept for when it can't be
    // reached and nothing is cached.
    async function hydrateFromTeamMembers(userId: string, storedActiveId: string | null) {
      const supabase = getSupabaseClient();
      const [membershipsResult, playersResult] = await Promise.all([
        supabase
          .from('team_members')
          .select('team_id, role, teams(name)')
          .eq('user_id', userId)
          .eq('is_active', true),
        supabase.from('players').select('id, team_id').eq('user_id', userId),
      ]);

      if (cancelled) return;

      const isRefresh = hydratedUserIdRef.current === userId;
      if (membershipsResult.error) {
        console.warn('RoleProvider: team_members fetch failed', membershipsResult.error);
        // A failed reload keeps the teams already shown.
        if (isRefresh) return;
        clear();
        return;
      }

      const playerIdByTeam = new Map<string, string>();
      for (const p of (playersResult.data ?? []) as Array<{ id: string; team_id: string }>) {
        playerIdByTeam.set(p.team_id, p.id);
      }

      const rows = (membershipsResult.data ?? []) as unknown as TeamMemberRow[];
      const mapped = mapTeamMemberships(rows, playerIdByTeam, new Set());

      const pickActive = (current: string | null) =>
        mapped.find((m) => m.teamId === current)?.teamId
        ?? mapped.find((m) => m.teamId === storedActiveId)?.teamId
        ?? mapped[0]?.teamId
        ?? null;

      hydratedUserIdRef.current = userId;
      sourceRef.current = 'direct';
      // A reload carries the tags already known so the pills don't flicker
      // off while the tag lookup below runs again.
      setMemberships((current) => isRefresh
        ? mapTeamMemberships(rows, playerIdByTeam, new Set(current.filter((m) => m.isTournamentTeam).map((m) => m.teamId)))
        : mapped);
      setLeagueRoles([]);
      setActiveTeamIdState((current) => pickActive(isRefresh ? current : null));
      setLoading(false);

      if (rows.length > 0) {
        void applyTournamentTeamTags(rows, playerIdByTeam);
      }
    }

    // Tournament-only teams get a "Tournament" tag in the team switcher.
    // Fetched after the teams are published so a slow or failed lookup never
    // holds the Games and Schedule tabs on their loading state; on failure the
    // teams simply stay untagged. (`/me` carries the tag itself.)
    async function applyTournamentTeamTags(rows: TeamMemberRow[], playerIdByTeam: Map<string, string>) {
      try {
        const { data, error } = await getSupabaseClient()
          .from('tournament_teams')
          .select('team_id')
          .eq('is_tournament_only', true)
          .in('team_id', rows.map((r) => r.team_id));
        if (error) {
          console.warn('RoleProvider: tournament_teams fetch failed', error);
          return;
        }
        const tournamentOnlyTeamIds = new Set(((data ?? []) as Array<{ team_id: string }>).map((t) => t.team_id));
        if (cancelled || tournamentOnlyTeamIds.size === 0) return;
        setMemberships(mapTeamMemberships(rows, playerIdByTeam, tournamentOnlyTeamIds));
      } catch (err) {
        console.warn('RoleProvider: tournament_teams fetch threw', err);
      }
    }

    hydrate().catch((err) => {
      if (cancelled) return;
      console.warn('RoleProvider: hydrate failed', err);
      if (user && hydratedUserIdRef.current === user.id) return;
      clear();
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, membershipVersion]);

  // Switch immediately; persisting the choice is best-effort so a SecureStore
  // failure never strands the user on the previous team.
  const setActiveTeamId = useCallback(async (id: string) => {
    setActiveTeamIdState(id);
    try {
      await SecureStore.setItemAsync(ACTIVE_TEAM_KEY, id);
    } catch (err) {
      console.warn('RoleProvider: could not save active team', err);
    }
  }, []);

  const activeTeam = useMemo(
    () => memberships.find((m) => m.teamId === activeTeamId) ?? null,
    [memberships, activeTeamId],
  );

  const isCoachSomewhere = memberships.some((m) => m.isCoach);
  const isLeagueAdmin = hasLeagueAdminRole(leagueRoles);
  const features = activeTeam?.features ?? NO_FEATURES;

  const value = useMemo<RoleContextValue>(
    () => ({
      loading,
      memberships,
      activeTeam,
      setActiveTeamId,
      isCoachSomewhere,
      features,
      leagueRoles,
      isLeagueAdmin,
    }),
    [loading, memberships, activeTeam, setActiveTeamId, isCoachSomewhere, features, leagueRoles, isLeagueAdmin],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}

/** UI gating for a capability on the active team / the user's leagues. Cosmetic only. */
export function useCan(capability: Capability): boolean {
  const { activeTeam, leagueRoles } = useRole();
  return can(capability, { activeTeam, leagueRoles });
}
