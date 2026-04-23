'use client';

import { useEffect, useId, useMemo, useState, type JSX } from 'react';
import {
  PitcherAvailabilityStatus,
  PitcherEligibilitySource,
  type PitcherAvailability,
  type Player,
} from '@baseball/shared';

export interface BullpenCandidate {
  player: Player;
  availability: PitcherAvailability;
  eligibilitySource: PitcherEligibilitySource;
}

interface Props {
  candidates: BullpenCandidate[];
  initialSelectedIds: string[];
  onSave: (playerIds: string[]) => void;
  onClose: () => void;
}

const STATUS_PILL: Record<PitcherAvailabilityStatus, { label: string; cls: string }> = {
  [PitcherAvailabilityStatus.AVAILABLE]: {
    label: 'Available',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  [PitcherAvailabilityStatus.LIMITED]: {
    label: 'Limited',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  [PitcherAvailabilityStatus.UNAVAILABLE]: {
    label: 'Unavailable',
    cls: 'bg-red-50 text-red-800 border-red-200',
  },
};

const ELIGIBILITY_PILL: Record<PitcherEligibilitySource, { label: string; cls: string }> = {
  [PitcherEligibilitySource.PRIMARY]: {
    label: 'Primary',
    cls: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  [PitcherEligibilitySource.SECONDARY]: {
    label: 'Secondary',
    cls: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  [PitcherEligibilitySource.GAME_HISTORY]: {
    label: 'Game history',
    cls: 'bg-violet-50 text-violet-800 border-violet-200',
  },
};

// Sort order: AVAILABLE → LIMITED → UNAVAILABLE. Coaches scan the top first.
const STATUS_RANK: Record<PitcherAvailabilityStatus, number> = {
  [PitcherAvailabilityStatus.AVAILABLE]: 0,
  [PitcherAvailabilityStatus.LIMITED]: 1,
  [PitcherAvailabilityStatus.UNAVAILABLE]: 2,
};

export function BullpenPitcherPicker({
  candidates,
  initialSelectedIds,
  onSave,
  onClose,
}: Props): JSX.Element {
  const headingId = useId();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );

  // Escape key closes.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const sorted = useMemo(() => {
    return candidates.slice().sort((a, b) => {
      const r = STATUS_RANK[a.availability.status] - STATUS_RANK[b.availability.status];
      if (r !== 0) return r;
      return a.player.lastName.localeCompare(b.player.lastName);
    });
  }, [candidates]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    onSave(Array.from(selected));
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 id={headingId} className="font-semibold text-gray-900">
            Assign pitchers
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Availability is advisory — you can still pick an unavailable pitcher if needed.
          </p>
        </div>
        <ul className="overflow-y-auto divide-y divide-gray-100 flex-1">
          {sorted.length === 0 && (
            <li className="p-4 text-center text-gray-400 text-sm">
              No pitchers found for this team. Add players with pitcher as a primary
              or secondary position, or scorekeep a game to include pitchers by game
              history.
            </li>
          )}
          {sorted.map(({ player, availability, eligibilitySource }) => {
            const status = STATUS_PILL[availability.status];
            const elig = ELIGIBILITY_PILL[eligibilitySource];
            const isSelected = selected.has(player.id);
            return (
              <li key={player.id}>
                <label className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(player.id)}
                    className="w-4 h-4 accent-brand-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {player.lastName}, {player.firstName}
                      {player.jerseyNumber !== undefined && (
                        <span className="ml-2 text-xs text-gray-400">
                          #{player.jerseyNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${status.cls}`}
                      >
                        {status.label}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${elig.cls}`}
                      >
                        {elig.label}
                      </span>
                      {availability.pitchesLast7d > 0 && (
                        <span className="text-[10px] text-gray-500">
                          {availability.pitchesLast7d} pitches last 7d
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-sm bg-brand-700 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-brand-800"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
