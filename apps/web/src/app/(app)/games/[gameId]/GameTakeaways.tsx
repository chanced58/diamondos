import type { HydratedWeaknessSignal } from '@baseball/shared';

interface Props {
  weaknesses: HydratedWeaknessSignal[];
  /**
   * True when our team lost this game — drives the severity framing copy.
   * We don't change the detection rules on wins; losses just get a stronger
   * visual treatment.
   */
  lostGame: boolean;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-900',
  medium: 'bg-amber-50 border-amber-200 text-amber-900',
  low: 'bg-gray-50 border-gray-200 text-gray-900',
};

export function GameTakeaways({ weaknesses, lostGame }: Props): JSX.Element | null {
  if (weaknesses.length === 0) return null;

  const top = weaknesses.slice(0, 3);
  const containerClass = lostGame
    ? 'bg-amber-50 border-amber-300'
    : 'bg-white border-gray-200';
  const headline = lostGame ? 'What cost us runs' : 'Takeaways';

  return (
    <section className={`rounded-xl border ${containerClass} p-5 mb-6`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{headline}</h2>
        <span className="text-xs text-gray-500">Top {top.length} signal{top.length === 1 ? '' : 's'}</span>
      </div>

      <ol className="space-y-3">
        {top.map((w) => (
          <li
            key={w.code}
            className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_STYLES[w.severity] ?? SEVERITY_STYLES.low}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{w.label}</div>
              <span className="text-xs opacity-70 font-mono">{w.evidence.metric}</span>
            </div>
            <p className="mt-1 text-xs opacity-90">{w.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
