/**
 * The add and edit player forms' fields, raw: the roster service validates them
 * with `rosterPlayerFieldsSchema`. Blank fields stay blank.
 */
export function playerFieldsFromForm(formData: FormData): Record<string, unknown> {
  const text = (name: string) => (formData.get(name) as string | null) ?? '';
  const number = (name: string) => (text(name) ? Number(text(name)) : null);
  return {
    firstName: text('firstName'),
    lastName: text('lastName'),
    jerseyNumber: number('jerseyNumber'),
    primaryPosition: text('primaryPosition'),
    secondaryPositions: formData.getAll('secondaryPositions'),
    bats: text('bats'),
    throws: text('throws'),
    graduationYear: number('graduationYear'),
    email: text('email'),
    phone: text('phone'),
  };
}
