import type { PracticeDrill } from '@baseball/shared';

/**
 * Collapse whitespace and escape quotes — team-authored drill fields flow
 * straight into a Claude prompt, so we never let a drill's name or description
 * introduce a newline that would confuse the catalog parsing, or an unescaped
 * quote that closes our wrapping double-quote early.
 */
function sanitize(input: string): string {
  return input
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"/g, '\\"')
    .trim();
}

function sanitizeTag(input: string): string {
  // Tags go inside `[a,b,c]`. Strip characters that would break the list shape.
  return input.replace(/[\r\n,[\]]/g, ' ').trim();
}

export function formatDrillCatalog(drills: PracticeDrill[]): string {
  if (drills.length === 0) {
    return 'DRILL CATALOG: (empty — team library has no drills; use drillId: null for every block)';
  }
  const lines = drills.map((drill) => {
    const parts: string[] = [
      `id=${drill.id}`,
      `name="${sanitize(drill.name)}"`,
      `categories=[${drill.skillCategories.map(sanitizeTag).join(',')}]`,
    ];
    parts.push(
      `positions=[${drill.positions.map(sanitizeTag).join(',') || 'any'}]`,
    );
    parts.push(
      `fieldSpaces=[${drill.fieldSpaces.map(sanitizeTag).join(',') || 'any'}]`,
    );
    if (drill.defaultDurationMinutes) {
      parts.push(`duration=${drill.defaultDurationMinutes}min`);
    }
    if (drill.minPlayers) parts.push(`minPlayers=${drill.minPlayers}`);
    if (drill.maxPlayers) parts.push(`maxPlayers=${drill.maxPlayers}`);
    if (drill.tags.length > 0) {
      parts.push(`tags=[${drill.tags.map(sanitizeTag).filter(Boolean).join(',')}]`);
    }
    if (drill.description) {
      parts.push(`desc="${sanitize(drill.description).slice(0, 120)}"`);
    }
    return `- ${parts.join(' ')}`;
  });
  return `DRILL CATALOG (reference by id only — do not invent drills):\n${lines.join('\n')}`;
}
