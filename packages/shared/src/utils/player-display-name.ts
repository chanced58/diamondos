export interface NameParts { firstName: string; lastName: string; }

export function memberDisplayName(p: NameParts): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function publicDisplayName(p: NameParts): string {
  const initial = p.lastName?.trim()?.[0];
  return initial ? `${p.firstName} ${initial}.` : p.firstName;
}
