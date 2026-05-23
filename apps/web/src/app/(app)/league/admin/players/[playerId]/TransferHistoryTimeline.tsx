import type { JSX } from 'react';
import type { PlayerTransferRow } from '@baseball/database';

type Props = { transfers: PlayerTransferRow[] };

const TYPE_LABEL: Record<NonNullable<PlayerTransferRow['transfer_type']>, string> = {
  initial_assignment: 'Initial assignment',
  trade: 'Trade',
  release: 'Release',
  reassignment: 'Season move',
};

export function TransferHistoryTimeline({ transfers }: Props): JSX.Element {
  if (transfers.length === 0) {
    return <p className="text-sm text-gray-400">No transfers recorded.</p>;
  }

  return (
    <ol className="space-y-3">
      {transfers.map((t) => {
        const label = t.transfer_type ? TYPE_LABEL[t.transfer_type] : 'Transfer';
        return (
          <li key={t.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-baseline gap-3">
              <div className="text-sm font-medium text-gray-900">
                {label}: {t.from_team?.name ?? '—'} →{' '}
                {t.to_team?.name ?? <span className="text-amber-700">Free agent</span>}
              </div>
              <time className="text-xs text-gray-500 shrink-0">
                {new Date(t.transferred_at).toLocaleDateString()}
              </time>
            </div>
            {t.reason && <p className="mt-2 text-sm text-gray-700">{t.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}
