import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { isCoachRole } from '@baseball/shared';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from './AuthProvider';

const ACTIVE_TEAM_KEY = 'diamondos.activeTeamId';

export type TeamRole =
  | 'head_coach'
  | 'assistant_coach'
  | 'player'
  | 'parent'
  | 'athletic_director';

export interface TeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
  playerId?: string;
  isCoach: boolean;
}

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

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!user) {
        setMemberships([]);
        setActiveTeamIdState(null);
        setLoading(false);
        return;
      }

      setLoading(true);
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
        setMemberships([]);
        setActiveTeamIdState(null);
        setLoading(false);
        return;
      }

      const playerIdByTeam = new Map<string, string>();
      for (const p of (playersResult.data ?? []) as Array<{ id: string; team_id: string }>) {
        playerIdByTeam.set(p.team_id, p.id);
      }

      const rows = (membershipsResult.data ?? []) as unknown as Array<{
        team_id: string;
        role: string;
        teams: { name: string } | { name: string }[] | null;
      }>;

      const mapped: TeamMembership[] = rows.map((r) => {
        const team = Array.isArray(r.teams) ? r.teams[0] ?? null : r.teams;
        return {
          teamId: r.team_id,
          teamName: team?.name ?? 'Team',
          role: r.role as TeamRole,
          playerId: playerIdByTeam.get(r.team_id),
          isCoach: isCoachRole(r.role),
        };
      });

      const initialActive =
        mapped.find((m) => m.teamId === storedActiveId)?.teamId ?? mapped[0]?.teamId ?? null;

      setMemberships(mapped);
      setActiveTeamIdState(initialActive);
      setLoading(false);
    }

    hydrate().catch((err) => {
      if (cancelled) return;
      console.warn('RoleProvider: hydrate failed', err);
      setMemberships([]);
      setActiveTeamIdState(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setActiveTeamId = useCallback(async (id: string) => {
    await SecureStore.setItemAsync(ACTIVE_TEAM_KEY, id);
    setActiveTeamIdState(id);
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
