import type { PracticeDrill } from '@baseball/shared';

export function formatDrillCatalog(drills: PracticeDrill[]): string {
  if (drills.length === 0) {
    return 'DRILL CATALOG: (empty — team library has no drills; use drillId: null for every block)';
  }
  const lines = drills.map((d) => {
    const parts: string[] = [
      `id=${d.id}`,
      `name="${d.name}"`,
      `categories=[${d.skillCategories.join(',')}]`,
    ];
    parts.push(`positions=[${d.positions.join(',') || 'any'}]`);
    parts.push(`fieldSpaces=[${d.fieldSpaces.join(',') || 'any'}]`);
    if (d.defaultDurationMinutes) parts.push(`duration=${d.defaultDurationMinutes}min`);
    if (d.minPlayers) parts.push(`minPlayers=${d.minPlayers}`);
    if (d.maxPlayers) parts.push(`maxPlayers=${d.maxPlayers}`);
    if (d.tags.length > 0) parts.push(`tags=[${d.tags.join(',')}]`);
    if (d.description) parts.push(`desc="${d.description.slice(0, 120)}"`);
    return `- ${parts.join(' ')}`;
  });
  return `DRILL CATALOG (reference by id only — do not invent drills):\n${lines.join('\n')}`;
}
