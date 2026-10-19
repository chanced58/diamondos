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
import { getSupabaseClient } from '../lib/supabase';
import {
  mapTeamMemberships,
  type TeamMemberRow,
  type TeamMembership,
} from '../features/teams/team-memberships';
import { subscribeToTeamMembershipChanges } from '../sync/team-backfill';
import { useAuth } from './AuthProvider';

export type { TeamMembership, TeamRole } from '../features/teams/team-memberships';

const ACTIVE_TEAM_KEY = 'diamondos.activeTeamId';

interface RoleContextValue {
  loading: boolean;
  memberships: TeamMembership[];
  activeTeam: TeamMembership | null;
  setActiveTeamId: (id: string) => Promise<void>;
  isCoachSomewhere: boolean;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);
  // Bumped when the sync engine sees the user join or leave a team, so the
  // list reloads without waiting for the next sign-in.
  const [membershipVersion, setMembershipVersion] = useState(0);
  // The user whose teams are already published; a reload for the same user
  // refreshes in place instead of putting the tabs back on their spinner.
  const hydratedUserIdRef = useRef<string | null>(null);

  useEffect(
    () => subscribeToTeamMembershipChanges(() => setMembershipVersion((version) => version + 1)),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!user) {
        hydratedUserIdRef.current = null;
        setMemberships([]);
        setActiveTeamIdState(null);
        setLoading(false);
        return;
      }

      const isRefresh = hydratedUserIdRef.current === user.id;
      if (!isRefresh) setLoading(true);
      const supabase = getSupabaseClient();

      const [membershipsResult, playersResult, storedActiveId] = await Promise.all([
        supabase
          .from('team_members')
          .select('team_id, role, teams(name)')
          .eq('user_id', user.id)
          .eq('is_active', true),
        supabase.from('players').select('id, team_id').eq('user_id', user.id),
        SecureStore.getItemAsync(ACTIVE_TEAM_KEY),
      ]);

      if (cancelled) return;

      if (membershipsResult.error) {
        console.warn('RoleProvider: team_members fetch failed', membershipsResult.error);
        // A failed reload keeps the teams already shown.
        if (isRefresh) return;
        setMemberships([]);
        setActiveTeamIdState(null);
        setLoading(false);
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

      hydratedUserIdRef.current = user.id;
      // A reload carries the tags already known so the pills don't flicker
      // off while the tag lookup below runs again.
      setMemberships((current) => isRefresh
        ? mapTeamMemberships(rows, playerIdByTeam, new Set(current.filter((m) => m.isTournamentTeam).map((m) => m.teamId)))
        : mapped);
      // A reload keeps the team the user is looking at, if they still have it.
      setActiveTeamIdState((current) => pickActive(isRefresh ? current : null));
      setLoading(false);

      if (rows.length > 0) {
        void applyTournamentTeamTags(rows, playerIdByTeam);
      }
    }

    // Tournament-only teams get a "Tournament" tag in the team switcher.
    // Fetched after the teams are published so a slow or failed lookup never
    // holds the Games and Schedule tabs on their loading state; on failure the
    // teams simply stay untagged.
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
      setMemberships([]);
      setActiveTeamIdState(null);
      setLoading(false);
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

  const value = useMemo<RoleContextValue>(
    () => ({ loading, memberships, activeTeam, setActiveTeamId, isCoachSomewhere }),
    [loading, memberships, activeTeam, setActiveTeamId, isCoachSomewhere],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
