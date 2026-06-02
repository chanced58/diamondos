export interface NameParts { firstName: string; lastName: string; }

export function memberDisplayName(p: NameParts): string {
  const first = (p.firstName ?? '').trim();
  const last = (p.lastName ?? '').trim();
  return `${first} ${last}`.trim();
}

export function publicDisplayName(p: NameParts): string {
  const first = (p.firstName ?? '').trim();
  const initial = (p.lastName ?? '').trim()[0];
  return initial ? `${first} ${initial}.` : first;
}
