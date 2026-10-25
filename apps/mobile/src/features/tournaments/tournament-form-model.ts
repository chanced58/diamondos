import { createTournamentSchema, type CreateTournamentInput } from '@baseball/shared';

/**
 * The New Tournament form (the web's /tournaments/new) and its translation to
 * the `create_tournament` input, validated with the shared schema.
 */

export type TournamentTeamType = 'existing' | 'new';

export interface TournamentFormValues {
  name: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  endDate: string;
  teamType: TournamentTeamType;
  /** The picked team, for an existing team. */
  teamId: string;
  /** For a new tournament team. */
  teamName: string;
  organization: string;
  stateCode: string;
  allowExpanded: boolean;
  /** 10–30 when expanded lineups are on. */
  maxBatters: number;
  allowMidGameChanges: boolean;
}

/** The web form's defaults: today, an existing team when the user heads one, 12 batters when expanded. */
export function emptyTournamentFormValues(today: string, firstTeamId: string | null): TournamentFormValues {
  return {
    name: '',
    startDate: today,
    endDate: today,
    teamType: firstTeamId ? 'existing' : 'new',
    teamId: firstTeamId ?? '',
    teamName: '',
    organization: '',
    stateCode: '',
    allowExpanded: false,
    maxBatters: 12,
    allowMidGameChanges: false,
  };
}

/** The RPC input; `requestId` makes a retried submit create the tournament once. */
export function tournamentInput(values: TournamentFormValues, requestId: string): CreateTournamentInput {
  const team: CreateTournamentInput['team'] =
    values.teamType === 'existing'
      ? { type: 'existing', teamId: values.teamId }
      : {
          type: 'new',
          name: values.teamName.trim(),
          organization: values.organization.trim() || undefined,
          stateCode: values.stateCode.trim() || undefined,
        };
  return {
    name: values.name.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
    requestId,
    team,
    lineup: {
      allowExpanded: values.allowExpanded,
      maxBatters: values.allowExpanded ? values.maxBatters : undefined,
      allowMidGameChanges: values.allowMidGameChanges,
    },
  };
}

/** The validated input, or the first problem in words. */
export function parseTournamentForm(
  values: TournamentFormValues,
  requestId: string,
): { ok: true; input: CreateTournamentInput } | { ok: false; error: string } {
  if (values.teamType === 'existing' && !values.teamId) return { ok: false, error: 'Pick a team.' };
  if (values.teamType === 'new' && values.stateCode.trim() && values.stateCode.trim().length !== 2) {
    return { ok: false, error: 'State must be a two-letter code.' };
  }
  const parsed = createTournamentSchema.safeParse(tournamentInput(values, requestId));
  if (parsed.success) return { ok: true, input: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the tournament details and try again.' };
}

/** What the lineup rules come to, as the web review panel words them. */
export function lineupSummary(values: Pick<TournamentFormValues, 'allowExpanded' | 'maxBatters' | 'allowMidGameChanges'>): string {
  const batters = `Up to ${values.allowExpanded ? values.maxBatters : 9} batters`;
  return values.allowMidGameChanges ? `${batters} · expansion and contraction allowed` : batters;
}
