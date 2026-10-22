/** The badge beside a name in a channel — the web thread's labels and colors. */
export function roleBadge(role: string | undefined): { label: string; className: string } | null {
  if (!role) return null;
  switch (role) {
    case 'head_coach':
    case 'assistant_coach':
    case 'athletic_director':
      return { label: 'Coach', className: 'bg-green-100 text-green-700' };
    case 'player':
      return { label: 'Player', className: 'bg-blue-100 text-blue-700' };
    case 'parent':
      return { label: 'Parent', className: 'bg-purple-100 text-purple-700' };
    default:
      return { label: 'Staff', className: 'bg-gray-100 text-gray-600' };
  }
}
