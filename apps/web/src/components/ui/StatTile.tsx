import type { JSX, ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: 'up' | 'down' | null;
}

export function StatTile({ label, value, delta, trend }: StatTileProps): JSX.Element {
  return (
    <div className="stat-tile">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {delta && (
        <div className="d">
          {trend && (
            <span className={`trend ${trend === 'up' ? 'trend-up' : 'trend-dn'}`}>
              {trend === 'up' ? '▲' : '▼'}{' '}
            </span>
          )}
          {delta}
        </div>
      )}
    </div>
  );
}
