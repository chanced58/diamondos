'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import type { PitchingStats, OppBattingRow } from '@baseball/shared';
import { formatBattingRate, formatInningsPitched } from '@baseball/shared';

export type OpponentTeamStats = {
  teamId: string;
  teamName: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  batting: OppBattingRow[];
  pitching: PitchingStats[];
};

function fmtRate(v: number): string { return formatBattingRate(v); }
function fmtPct(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '---';
  return `${(v * 100).toFixed(1)}%`;
}
function fmtDec(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '---';
  return v.toFixed(2);
}

function RecordBadge({ wins, losses, ties }: { wins: number; losses: number; ties: number }) {
  const parts = [String(wins), String(losses)];
  if (ties > 0) parts.push(String(ties));
  return (
    <span className="inline-flex items-center text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-0.5">
      {parts.join('-')}
    </span>
  );
}

function OppBattingTable({ rows }: { rows: OppBattingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.pa - a.pa);
  if (sorted.length === 0) return <p className="text-sm text-gray-400 px-5 py-3">No batting data.</p>;

  const cols: { key: string; label: string }[] = [
    { key: 'playerName', label: 'Batter' },
    { key: 'pa', label: 'PA' },
    { key: 'ab', label: 'AB' },
    { key: 'h', label: 'H' },
    { key: 'doubles', label: '2B' },
    { key: 'triples', label: '3B' },
    { key: 'hr', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'bb', label: 'BB' },
    { key: 'k', label: 'K' },
    { key: 'sb', label: 'SB' },
    { key: 'avg', label: 'AVG' },
    { key: 'obp', label: 'OBP' },
    { key: 'slg', label: 'SLG' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`px-3 py-2 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                  c.key === 'playerName' ? 'text-left' : 'text-center'
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.pa}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.ab}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.h}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.doubles}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.triples}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.hr}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.rbi}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.bb}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.k}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.sb}</td>
              <td className="px-3 py-2 text-center tabular-nums font-mono">{fmtRate(s.avg)}</td>
              <td className="px-3 py-2 text-center tabular-nums font-mono">{fmtRate(s.obp)}</td>
              <td className="px-3 py-2 text-center tabular-nums font-mono">{fmtRate(s.slg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OppPitchingTable({ rows }: { rows: PitchingStats[] }) {
  const sorted = [...rows].sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);
  if (sorted.length === 0) return <p className="text-sm text-gray-400 px-5 py-3">No pitching data.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Pitcher', 'IP', 'H', 'R', 'BB', 'K', 'HBP', 'WP', 'PC', 'STR%', 'ERA'].map((h) => (
              <th
                key={h}
                className={`px-3 py-2 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap ${
                  h === 'Pitcher' ? 'text-left' : 'text-center'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center tabular-nums font-mono">{formatInningsPitched(s.inningsPitchedOuts)}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.hitsAllowed}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.runsAllowed}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.walksAllowed}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.strikeouts}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.hitBatters}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.wildPitches}</td>
              <td className="px-3 py-2 text-center tabular-nums">{s.totalPitches}</td>
              <td className="px-3 py-2 text-center tabular-nums">{fmtPct(s.strikePercentage)}</td>
              <td className="px-3 py-2 text-center tabular-nums font-mono">{fmtDec(s.era)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OpponentsStatsTable({ teams }: { teams: OpponentTeamStats[] }): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(teams.length === 1 ? teams[0]?.teamId ?? null : null);

  if (teams.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
        <p className="text-gray-500 text-sm">No opponent data yet.</p>
        <p className="text-gray-400 text-xs mt-1">
          Stats will appear once games with linked opponent teams have been scored.
        </p>
      </div>
    );
  }

  const sorted = [...teams].sort((a, b) => b.gamesPlayed - a.gamesPlayed);

  return (
    <div className="space-y-3">
      {sorted.map((team) => {
        const isExpanded = expandedId === team.teamId;
        return (
          <div key={team.teamId} className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : team.teamId)}
              aria-expanded={isExpanded}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-900">{team.teamName}</span>
                <RecordBadge wins={team.wins} losses={team.losses} ties={team.ties} />
                <span className="text-xs text-gray-500">
                  {team.gamesPlayed} {team.gamesPlayed === 1 ? 'game' : 'games'}
                </span>
              </div>
              <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
              <div className="divide-y divide-gray-200">
                <div>
                  <div className="px-5 pt-3 pb-1">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Batting</h4>
                  </div>
                  <OppBattingTable rows={team.batting} />
                </div>
                <div>
                  <div className="px-5 pt-3 pb-1">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pitching</h4>
                  </div>
                  <OppPitchingTable rows={team.pitching} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
