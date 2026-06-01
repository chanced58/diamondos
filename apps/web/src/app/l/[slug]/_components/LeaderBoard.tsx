import type { RankedLeaderRow, StatDef } from '@baseball/shared';

type StatFormat = StatDef['format'];

export function LeaderBoard({
  title,
  rows,
  format,
}: {
  title: string;
  rows: RankedLeaderRow[];
  format: StatFormat;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No qualified leaders yet.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between text-sm">
              <span>
                <span className="inline-block w-6 text-slate-400">{r.rank}</span>
                {r.name}
                {r.teamName ? <span className="ml-1 text-slate-400">· {r.teamName}</span> : null}
              </span>
              <span className="font-mono font-semibold">{formatStat(r.value, format)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function formatStat(v: number, format: StatFormat): string {
  switch (format) {
    case 'avg3':
      return v.toFixed(3).replace(/^0/, '');
    case 'pct1':
      return `${(v * 100).toFixed(1)}%`;
    case 'ratio2':
      return v.toFixed(2);
    case 'ip': {
      // value is whole outs; render as innings.thirds (e.g. 19 outs -> 6.1)
      const whole = Math.floor(v / 3);
      const thirds = Math.round(v % 3);
      return `${whole}.${thirds}`;
    }
    case 'int':
      return String(Math.round(v));
    default:
      return String(v);
  }
}
