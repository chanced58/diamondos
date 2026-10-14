import { createTournamentSchema } from '@baseball/shared';

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
