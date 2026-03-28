'use client';

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { weAreHome as weAreHomeFn } from '@baseball/shared';
import type { BattingStats, PitchingStats, OppBattingRow } from '@baseball/shared';
import { formatBattingRate, formatInningsPitched } from '@baseball/shared';

// ── Shared types (imported by page.tsx) ─────────────────────────────────────

export type FieldingStatRow = {
  playerId: string;
  playerName: string;
  position: string;
  putouts: number;
  assists: number;
  errors: number;
};

export type LineScoreData = {
  awayRunsByInning: number[];
  homeRunsByInning: number[];
  awayRuns: number;
  homeRuns: number;
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
};

export type PlayerInfo = {
  id: string;
  name: string;
  jerseyNumber: number | string | null;
  isOpponent: boolean;
  battingOrder?: number;
  position?: string;
};

export type { OppBattingRow } from '@baseball/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawGameEvent = Record<string, any>;

export type { StatTier } from '@baseball/shared';

export interface GameStatsClientProps {
  game: {
    id: string;
    opponentName: string;
    locationType: string;
    neutralHomeTeam: string | null;
    status: string;
    teamName: string;
  };
  ourBatting: BattingStats[];
  oppBatting: OppBattingRow[];
  ourPitching: PitchingStats[];
  oppPitching: PitchingStats[];
  ourFielding: FieldingStatRow[];
  oppFielding: FieldingStatRow[];
  lineScore: LineScoreData;
  baserunning: Record<string, { sb: number; cs: number }>;
}

// ── Display helpers ──────────────────────────────────────────────────────────

function fmtRate(v: number): string { return formatBattingRate(v); }
function fmtEra(v: number): string { return isFinite(v) ? v.toFixed(2) : '---'; }
function fmtPct(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '---';
  return `${(v * 100).toFixed(1)}%`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = `section-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div id={contentId}>{children}</div>}
    </div>
  );
}

function LineScoreTable({
  lineScore, usLabel, oppLabel, weAreHome,
}: {
  lineScore: LineScoreData; usLabel: string; oppLabel: string; weAreHome: boolean;
}) {
  const maxInnings = Math.max(lineScore.awayRunsByInning.length, lineScore.homeRunsByInning.length, 9);
  const inningNums = Array.from({ length: maxInnings }, (_, i) => i + 1);

  const ourRuns = weAreHome ? lineScore.homeRunsByInning : lineScore.awayRunsByInning;
  const oppRuns = weAreHome ? lineScore.awayRunsByInning : lineScore.homeRunsByInning;
  const ourTotal = weAreHome ? lineScore.homeRuns : lineScore.awayRuns;
  const oppTotal = weAreHome ? lineScore.awayRuns : lineScore.homeRuns;
  const ourHits = weAreHome ? lineScore.homeHits : lineScore.awayHits;
  const oppHits = weAreHome ? lineScore.awayHits : lineScore.homeHits;
  const ourErrors = weAreHome ? lineScore.homeErrors : lineScore.awayErrors;
  const oppErrors = weAreHome ? lineScore.awayErrors : lineScore.homeErrors;

  const cell = 'text-center text-sm font-mono px-2 py-2 border-l border-gray-200';
  const label = 'text-sm font-semibold text-gray-700 px-3 py-2 w-28 truncate';
  const summary = `${cell} font-bold`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-gray-200 rounded-lg overflow-hidden text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className={`${label} text-left`} />
            {inningNums.map((n) => (
              <th key={n} className={`${cell} text-xs text-gray-500 font-semibold`}>{n}</th>
            ))}
            <th className={`${summary} text-xs text-gray-700`}>R</th>
            <th className={`${summary} text-xs text-gray-700`}>H</th>
            <th className={`${summary} text-xs text-gray-700`}>E</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="bg-white">
            <td className={label}>{oppLabel}</td>
            {inningNums.map((_, i) => <td key={i} className={cell}>{oppRuns[i] ?? '·'}</td>)}
            <td className={summary}>{oppTotal}</td>
            <td className={summary}>{oppHits}</td>
            <td className={summary}>{oppErrors}</td>
          </tr>
          <tr className="bg-white">
            <td className={label}>{usLabel}</td>
            {inningNums.map((_, i) => <td key={i} className={cell}>{ourRuns[i] ?? '·'}</td>)}
            <td className={summary}>{ourTotal}</td>
            <td className={summary}>{ourHits}</td>
            <td className={summary}>{ourErrors}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BattingSummary({ rows, baserunning }: { rows: BattingStats[]; baserunning: Record<string, { sb: number; cs: number }> }) {
  const sorted = [...rows].sort((a, b) => b.plateAppearances - a.plateAppearances);
  if (sorted.length === 0) return <p className="text-sm text-gray-400 px-5 py-4">No batting data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Player', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'SB', 'AVG'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => {
            const br = baserunning[s.playerId] ?? { sb: 0, cs: 0 };
            return (
              <tr key={s.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                <td className="px-3 py-2 text-center">{s.atBats}</td>
                <td className="px-3 py-2 text-center">{s.runs}</td>
                <td className="px-3 py-2 text-center">{s.hits}</td>
                <td className="px-3 py-2 text-center">{s.doubles}</td>
                <td className="px-3 py-2 text-center">{s.triples}</td>
                <td className="px-3 py-2 text-center">{s.homeRuns}</td>
                <td className="px-3 py-2 text-center">{s.rbi}</td>
                <td className="px-3 py-2 text-center">{s.walks}</td>
                <td className="px-3 py-2 text-center">{s.strikeouts}</td>
                <td className="px-3 py-2 text-center">{br.sb}</td>
                <td className="px-3 py-2 text-center font-mono">{fmtRate(s.avg)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t border-gray-300 font-semibold text-gray-900">
            {(() => {
              const t = sorted.reduce((acc, s) => {
                const br = baserunning[s.playerId] ?? { sb: 0, cs: 0 };
                return {
                  ab: acc.ab + s.atBats, r: acc.r + s.runs, h: acc.h + s.hits,
                  d: acc.d + s.doubles, tr: acc.tr + s.triples, hr: acc.hr + s.homeRuns,
                  rbi: acc.rbi + s.rbi, bb: acc.bb + s.walks, k: acc.k + s.strikeouts, sb: acc.sb + br.sb,
                };
              }, { ab: 0, r: 0, h: 0, d: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0 });
              const avg = t.ab > 0 ? t.h / t.ab : NaN;
              return (
                <>
                  <td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-center">{t.ab}</td>
                  <td className="px-3 py-2 text-center">{t.r}</td>
                  <td className="px-3 py-2 text-center">{t.h}</td>
                  <td className="px-3 py-2 text-center">{t.d}</td>
                  <td className="px-3 py-2 text-center">{t.tr}</td>
                  <td className="px-3 py-2 text-center">{t.hr}</td>
                  <td className="px-3 py-2 text-center">{t.rbi}</td>
                  <td className="px-3 py-2 text-center">{t.bb}</td>
                  <td className="px-3 py-2 text-center">{t.k}</td>
                  <td className="px-3 py-2 text-center">{t.sb}</td>
                  <td className="px-3 py-2 text-center font-mono">{fmtRate(avg)}</td>
                </>
              );
            })()}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function OppBattingSummary({ rows }: { rows: OppBattingRow[] }) {
  const sorted = [...rows].sort((a, b) => b.pa - a.pa);
  if (sorted.length === 0) return <p className="text-sm text-gray-400 px-5 py-4">No batting data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Player', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'K', 'AVG'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center">{s.ab}</td>
              <td className="px-3 py-2 text-center">{s.r}</td>
              <td className="px-3 py-2 text-center">{s.h}</td>
              <td className="px-3 py-2 text-center">{s.doubles}</td>
              <td className="px-3 py-2 text-center">{s.triples}</td>
              <td className="px-3 py-2 text-center">{s.hr}</td>
              <td className="px-3 py-2 text-center">{s.rbi}</td>
              <td className="px-3 py-2 text-center">{s.bb}</td>
              <td className="px-3 py-2 text-center">{s.k}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtRate(s.avg)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t border-gray-300 font-semibold text-gray-900">
            {(() => {
              const t = sorted.reduce((acc, s) => ({
                ab: acc.ab + s.ab, r: acc.r + s.r, h: acc.h + s.h,
                d: acc.d + s.doubles, tr: acc.tr + s.triples, hr: acc.hr + s.hr,
                rbi: acc.rbi + s.rbi, bb: acc.bb + s.bb, k: acc.k + s.k,
              }), { ab: 0, r: 0, h: 0, d: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
              const avg = t.ab > 0 ? t.h / t.ab : NaN;
              return (
                <>
                  <td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-center">{t.ab}</td>
                  <td className="px-3 py-2 text-center">{t.r}</td>
                  <td className="px-3 py-2 text-center">{t.h}</td>
                  <td className="px-3 py-2 text-center">{t.d}</td>
                  <td className="px-3 py-2 text-center">{t.tr}</td>
                  <td className="px-3 py-2 text-center">{t.hr}</td>
                  <td className="px-3 py-2 text-center">{t.rbi}</td>
                  <td className="px-3 py-2 text-center">{t.bb}</td>
                  <td className="px-3 py-2 text-center">{t.k}</td>
                  <td className="px-3 py-2 text-center font-mono">{fmtRate(avg)}</td>
                </>
              );
            })()}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PitchingSummary({ rows }: { rows: PitchingStats[] }) {
  const sorted = [...rows].sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);
  if (sorted.length === 0) return <p className="text-sm text-gray-400 px-5 py-4">No pitching data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Pitcher', 'IP', 'H', 'R', 'BB', 'K', 'HBP', 'WP', 'PC', 'Strike%', '30CNT', 'ERA'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Pitcher' ? 'text-left' : 'text-center'}`}
                title={h === '30CNT' ? 'At-bats starting with 3 straight balls' : undefined}
              >{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => (
            <tr key={s.playerId} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
              <td className="px-3 py-2 text-center font-mono">{formatInningsPitched(s.inningsPitchedOuts)}</td>
              <td className="px-3 py-2 text-center">{s.hitsAllowed}</td>
              <td className="px-3 py-2 text-center">{s.runsAllowed}</td>
              <td className="px-3 py-2 text-center">{s.walksAllowed}</td>
              <td className="px-3 py-2 text-center">{s.strikeouts}</td>
              <td className="px-3 py-2 text-center">{s.hitBatters}</td>
              <td className="px-3 py-2 text-center">{s.wildPitches}</td>
              <td className="px-3 py-2 text-center">{s.totalPitches}</td>
              <td className="px-3 py-2 text-center">{fmtPct(s.strikePercentage)}</td>
              <td className="px-3 py-2 text-center">{s.threeZeroCountPAs}</td>
              <td className="px-3 py-2 text-center font-mono">{fmtEra(s.era)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t border-gray-300 font-semibold text-gray-900">
            {(() => {
              const t = sorted.reduce((acc, s) => ({
                ip: acc.ip + s.inningsPitchedOuts, h: acc.h + s.hitsAllowed,
                r: acc.r + s.runsAllowed, bb: acc.bb + s.walksAllowed,
                k: acc.k + s.strikeouts, hbp: acc.hbp + s.hitBatters,
                wp: acc.wp + s.wildPitches, pc: acc.pc + s.totalPitches,
                str: acc.str + s.strikes, cnt30: acc.cnt30 + s.threeZeroCountPAs,
              }), { ip: 0, h: 0, r: 0, bb: 0, k: 0, hbp: 0, wp: 0, pc: 0, str: 0, cnt30: 0 });
              const ipDec = t.ip / 3;
              const era = ipDec > 0 ? (t.r * 7) / ipDec : NaN;
              const strPct = t.pc > 0 ? t.str / t.pc : NaN;
              return (
                <>
                  <td className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-center font-mono">{formatInningsPitched(t.ip)}</td>
                  <td className="px-3 py-2 text-center">{t.h}</td>
                  <td className="px-3 py-2 text-center">{t.r}</td>
                  <td className="px-3 py-2 text-center">{t.bb}</td>
                  <td className="px-3 py-2 text-center">{t.k}</td>
                  <td className="px-3 py-2 text-center">{t.hbp}</td>
                  <td className="px-3 py-2 text-center">{t.wp}</td>
                  <td className="px-3 py-2 text-center">{t.pc}</td>
                  <td className="px-3 py-2 text-center">{fmtPct(strPct)}</td>
                  <td className="px-3 py-2 text-center">{t.cnt30}</td>
                  <td className="px-3 py-2 text-center font-mono">{fmtEra(era)}</td>
                </>
              );
            })()}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FieldingSummary({ rows }: { rows: FieldingStatRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-400 px-5 py-4">No fielding data.</p>;
  const sorted = [...rows].sort((a, b) => (b.putouts + b.assists) - (a.putouts + a.assists));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {['Player', 'Pos', 'PO', 'A', 'E', 'TC', 'FPCT'].map((h) => (
              <th key={h} className={`px-3 py-2 font-semibold text-gray-600 ${h === 'Player' ? 'text-left' : 'text-center'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((s) => {
            const tc = s.putouts + s.assists + s.errors;
            const fpct = tc > 0 ? (s.putouts + s.assists) / tc : NaN;
            return (
              <tr key={s.playerId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{s.playerName}</td>
                <td className="px-3 py-2 text-center text-gray-500">{s.position || '—'}</td>
                <td className="px-3 py-2 text-center">{s.putouts}</td>
                <td className="px-3 py-2 text-center">{s.assists}</td>
                <td className={`px-3 py-2 text-center ${s.errors > 0 ? 'text-red-600 font-semibold' : ''}`}>{s.errors}</td>
                <td className="px-3 py-2 text-center">{tc}</td>
                <td className="px-3 py-2 text-center font-mono">{isNaN(fpct) ? '---' : fpct.toFixed(3).replace(/^0(?=\.)/, '')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component — simple box score layout ────────────────────────────────

export function GameStatsClient({
  game, ourBatting, oppBatting, ourPitching, oppPitching,
  ourFielding, oppFielding, lineScore, baserunning,
}: GameStatsClientProps): JSX.Element {
  const weAreHome = weAreHomeFn(game.locationType, game.neutralHomeTeam);
  const ourLabel = game.teamName;
  const oppLabel = game.opponentName;

  return (
    <div className="p-4 space-y-4 max-w-5xl">
      {/* Line Score */}
      <LineScoreTable lineScore={lineScore} usLabel={ourLabel} oppLabel={oppLabel} weAreHome={weAreHome} />

      {/* Batting */}
      <Section title={`Batting — ${ourLabel}`}>
        <BattingSummary rows={ourBatting} baserunning={baserunning} />
      </Section>

      <Section title={`Batting — ${oppLabel}`} defaultOpen={false}>
        <OppBattingSummary rows={oppBatting} />
      </Section>

      {/* Pitching */}
      <Section title={`Pitching — ${ourLabel}`}>
        <PitchingSummary rows={ourPitching} />
      </Section>

      <Section title={`Pitching — ${oppLabel}`} defaultOpen={false}>
        <PitchingSummary rows={oppPitching} />
      </Section>

      {/* Fielding */}
      <Section title={`Fielding — ${ourLabel}`} defaultOpen={false}>
        <FieldingSummary rows={ourFielding} />
      </Section>

      <Section title={`Fielding — ${oppLabel}`} defaultOpen={false}>
        <FieldingSummary rows={oppFielding} />
      </Section>
    </div>
  );
}
