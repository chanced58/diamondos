import type { StatDef } from '@baseball/shared';

export type StatFormat = StatDef['format'];

/** Format a numeric stat value for display per its catalog `format`. */
export function formatStat(v: number, format: StatFormat): string {
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
