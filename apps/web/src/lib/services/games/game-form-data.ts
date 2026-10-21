/**
 * The web game forms' fields (AddGameForm / EditGameForm, including
 * AddressAutocomplete's hidden `venue_*` inputs) as the shared game form input.
 */
export function gameFormFieldsFromFormData(formData: FormData) {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const number = (name: string) => {
    const value = text(name);
    return value === null ? null : Number.parseFloat(value);
  };

  const venueName = text('venue');
  return {
    opponentTbd: formData.get('opponentTbd') === 'on',
    opponentName: text('opponent'),
    opponentTeamId: text('opponentTeamId'),
    date: text('date') ?? '',
    time: text('time') ?? undefined,
    locationType: text('locationType') ?? undefined,
    neutralHomeTeam: text('neutralHomeTeam'),
    venue: venueName
      ? {
          name: venueName,
          address: text('venue_address'),
          latitude: number('venue_latitude'),
          longitude: number('venue_longitude'),
          placeId: text('venue_place_id'),
        }
      : null,
    notes: text('notes'),
    deviceTimeZone: text('browserTimeZone'),
  };
}
