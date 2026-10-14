import { createTournamentSchema } from '@baseball/shared';
import type { TournamentTeamOption } from '@baseball/database';

export function getTournamentReview(formData: FormData, teams: TournamentTeamOption[]) {
  const isNewTeam = formData.get('teamType') === 'new';
  const teamName = String(formData.get('teamName') ?? '').trim();
  const selectedTeam = teams.find((team) => team.id === formData.get('teamId'));
  const maxBatters = formData.get('allowExpanded') === 'on'
    ? Number(formData.get('maxBatters') || 12)
    : 9;
  return {
    team: isNewTeam
      ? `${teamName || 'Enter a team name'} (new tournament team)`
      : selectedTeam?.name ?? 'Select a team',
    battingOrder: `Up to ${maxBatters} batters`,
    midGameChanges: formData.get('allowMidGameChanges') === 'on'
      ? 'Expansion and contraction allowed'
      : 'Not allowed',
  };
}

export function parseTournamentFormData(formData: FormData) {
  const teamType = formData.get('teamType');
  const allowExpanded = formData.get('allowExpanded') === 'on';
  const team = teamType === 'existing'
    ? { type: teamType, teamId: formData.get('teamId') }
    : {
        type: teamType,
        name: formData.get('teamName'),
        organization: formData.get('organization') || undefined,
        stateCode: formData.get('stateCode') || undefined,
      };

  return createTournamentSchema.safeParse({
    name: formData.get('name'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    requestId: formData.get('requestId'),
    team,
    lineup: {
      allowExpanded,
      maxBatters: allowExpanded ? Number(formData.get('maxBatters')) : undefined,
      allowMidGameChanges: formData.get('allowMidGameChanges') === 'on',
    },
  });
}
