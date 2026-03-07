'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'Bench'];
const BATTING_ORDERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Bench'];
const DEFAULT_OPPONENT_POSITIONS = ['P', 'SS', 'CF', '1B', 'LF', 'C', '3B', 'RF', '2B'];

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  primaryPosition: string;
};

type OurLineupRow = {
  order: string;
  position: string;
};

type OpponentRow = {
  order: string;
  name: string;
  jersey: string;
  position: string;
};

type Tab = 'our' | 'opponent';

export function DemoLineupBuilder({ players }: { players: Player[] }): JSX.Element | null {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('our');
  const [submitted, setSubmitted] = useState(false);

  // Our team lineup
  const [ourRows, setOurRows] = useState<Record<string, OurLineupRow>>(() =>
    Object.fromEntries(
      players.map((p, i) => [
        p.id,
        { order: String(i + 1), position: p.primaryPosition },
      ]),
    ),
  );

  // Opponent lineup — 9 editable rows
  const [opponentRows, setOpponentRows] = useState<OpponentRow[]>(() =>
    Array.from({ length: 9 }, (_, i) => ({
      order: String(i + 1),
      name: `Batter ${i + 1}`,
      jersey: String(i + 1),
      position: DEFAULT_OPPONENT_POSITIONS[i] ?? 'Bench',
    })),
  );

  // Duplicate batting order check for our team
  const ourOrderCounts: Record<string, number> = {};
  for (const { order } of Object.values(ourRows)) {
    if (order !== 'Bench') ourOrderCounts[order] = (ourOrderCounts[order] ?? 0) + 1;
  }
  const ourHasDuplicates = Object.values(ourOrderCounts).some((n) => n > 1);

  // Duplicate check for opponent
  const oppOrderCounts: Record<string, number> = {};
  for (const { order } of opponentRows) {
    if (order !== 'Bench') oppOrderCounts[order] = (oppOrderCounts[order] ?? 0) + 1;
  }
  const oppHasDuplicates = Object.values(oppOrderCounts).some((n) => n > 1);

  function setOurOrder(playerId: string, order: string) {
    setOurRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], order } }));
  }
  function setOurPosition(playerId: string, position: string) {
    setOurRows((prev) => ({ ...prev, [playerId]: { ...prev[playerId], position } }));
  }

  function setOppField(index: number, field: keyof OpponentRow, value: string) {
    setOpponentRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  function handleSave() {
    setSubmitted(true);
    router.push('/games/demo');
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <Link href="/games/demo" className="text-sm text-brand-700 hover:underline">
        ← Skip to scoring
      </Link>

      <div className="mt-4 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Set Lineup</h1>
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
            Demo
          </span>
        </div>
        <p className="text-gray-500 text-sm">
          Practice filling out a game lineup. Set batting order and positions for both teams, then save to continue to the scoring board.
        </p>
      </div>

      {/* Demo notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-sm text-amber-800">
        <span className="font-semibold">Practice mode</span> — no data is saved. This shows you exactly what the real lineup form looks like.
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('our')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
            activeTab === 'our'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Our Lineup
          {ourHasDuplicates && (
            <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500 align-middle" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('opponent')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
            activeTab === 'opponent'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Opponent Lineup
          {oppHasDuplicates && (
            <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-red-500 align-middle" />
          )}
        </button>
      </div>

      {/* ── Our Lineup tab ─────────────────────────────────────── */}
      {activeTab === 'our' && (
        <>
          {ourHasDuplicates && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              Duplicate batting order numbers detected — each slot (1–9) can only be assigned once.
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Player</div>
              <div className="col-span-3">Batting</div>
              <div className="col-span-3">Position</div>
            </div>
            <div className="divide-y divide-gray-100">
              {players.map((player) => {
                const row = ourRows[player.id] ?? { order: 'Bench', position: 'Bench' };
                const isDuplicate = row.order !== 'Bench' && (ourOrderCounts[row.order] ?? 0) > 1;
                return (
                  <div
                    key={player.id}
                    className={`px-5 py-3 grid grid-cols-12 gap-3 items-center ${isDuplicate ? 'bg-red-50' : ''}`}
                  >
                    <div className="col-span-1">
                      <span className="text-xs font-bold text-gray-400">#{player.jerseyNumber}</span>
                    </div>
                    <div className="col-span-5">
                      <p className="text-sm font-medium text-gray-900">
                        {player.lastName}, {player.firstName}
                      </p>
                      <p className="text-xs text-gray-400">{player.primaryPosition}</p>
                    </div>
                    <div className="col-span-3">
                      <select
                        value={row.order}
                        onChange={(e) => setOurOrder(player.id, e.target.value)}
                        className={`w-full text-sm rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                          isDuplicate ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {BATTING_ORDERS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <select
                        value={row.position}
                        onChange={(e) => setOurPosition(player.id, e.target.value)}
                        className="w-full text-sm rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Opponent Lineup tab ────────────────────────────────── */}
      {activeTab === 'opponent' && (
        <>
          {oppHasDuplicates && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
              Duplicate batting order numbers detected — each slot (1–9) can only be assigned once.
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-12 gap-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-1">#</div>
              <div className="col-span-4">Name</div>
              <div className="col-span-2">Jersey</div>
              <div className="col-span-2">Batting</div>
              <div className="col-span-3">Position</div>
            </div>
            <div className="divide-y divide-gray-100">
              {opponentRows.map((row, i) => {
                const isDuplicate = row.order !== 'Bench' && (oppOrderCounts[row.order] ?? 0) > 1;
                return (
                  <div
                    key={i}
                    className={`px-5 py-2.5 grid grid-cols-12 gap-3 items-center ${isDuplicate ? 'bg-red-50' : ''}`}
                  >
                    {/* Row number */}
                    <div className="col-span-1">
                      <span className="text-xs font-bold text-gray-400">{i + 1}</span>
                    </div>
                    {/* Name */}
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => setOppField(i, 'name', e.target.value)}
                        placeholder="Player name"
                        className="w-full text-sm rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>
                    {/* Jersey */}
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={row.jersey}
                        onChange={(e) => setOppField(i, 'jersey', e.target.value)}
                        placeholder="#"
                        className="w-full text-sm rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>
                    {/* Batting order */}
                    <div className="col-span-2">
                      <select
                        value={row.order}
                        onChange={(e) => setOppField(i, 'order', e.target.value)}
                        className={`w-full text-sm rounded-lg border px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                          isDuplicate ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {BATTING_ORDERS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    {/* Position */}
                    <div className="col-span-3">
                      <select
                        value={row.position}
                        onChange={(e) => setOppField(i, 'position', e.target.value)}
                        className="w-full text-sm rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Save / cancel */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={submitted}
          className="bg-brand-700 text-white font-semibold px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors text-sm"
        >
          {submitted ? 'Saving…' : 'Save Lineup & Continue →'}
        </button>
        <Link href="/games/demo" className="text-sm text-gray-500 hover:text-gray-700">
          Skip
        </Link>
      </div>
    </div>
  );
}
