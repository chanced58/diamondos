'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import type { ManualResultInput } from '@baseball/shared';
import type { ManualResultRoster, ManualRosterPlayer } from '@/lib/services/league-games/manual-result';
import { addRosterPlayerAction, saveManualResultAction } from './actions';

type Kind = ManualResultInput['kind'];
interface TeamRef {
  teamId: string;
  name: string;
}
interface Props {
  leagueGameId: string;
  home: TeamRef;
  away: TeamRef;
  rosters: ManualResultRoster[];
  initial: ManualResultInput | null;
  /** The league's regulation innings: the fewest inning cells shown. */
  minInnings: number;
  canEdit: boolean;
}

const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'final', label: 'Final score' },
  { kind: 'box', label: 'Box score' },
  { kind: 'batting', label: 'Batting stats' },
  { kind: 'forfeit', label: 'Forfeit' },
];
const STATS = ['ab', 'r', 'h', 'doubles', 'triples', 'hr', 'rbi', 'bb', 'so', 'hbp', 'sf', 'sb'] as const;
type Stat = (typeof STATS)[number];
const STAT_LABELS: Record<Stat, string> = {
  ab: 'AB', r: 'R', h: 'H', doubles: '2B', triples: '3B', hr: 'HR', rbi: 'RBI', bb: 'BB', so: 'SO', hbp: 'HBP', sf: 'SF', sb: 'SB',
};

interface LineDraft {
  key: number;
  playerId: string;
  stats: Record<Stat, string>;
}

const CELL = 'w-12 text-sm text-center rounded-md border border-gray-200 bg-white px-1 py-1 disabled:bg-gray-50';
const INPUT = 'text-sm rounded-md border border-gray-200 bg-white px-2 py-1 disabled:bg-gray-50';
const BUTTON = 'text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50';
const PRIMARY = 'text-sm font-medium px-4 py-2 rounded-md bg-brand-700 text-white hover:bg-brand-600 disabled:opacity-50';

const toNumber = (value: string): number => (value.trim() === '' ? 0 : Number(value));
const emptyStats = (): Record<Stat, string> => Object.fromEntries(STATS.map((stat) => [stat, ''])) as Record<Stat, string>;

function initialInnings(initial: ManualResultInput | null, side: 'home' | 'away', minInnings: number): string[] {
  const saved = initial && (initial.kind === 'box' || initial.kind === 'batting')
    ? (side === 'home' ? initial.homeInningRuns : initial.awayInningRuns)
    : [];
  return Array.from({ length: Math.max(minInnings, saved.length) }, (_, index) => (saved[index] === undefined ? '' : String(saved[index])));
}

function initialLines(initial: ManualResultInput | null, teamId: string): LineDraft[] {
  if (initial?.kind !== 'batting') return [];
  return initial.lines
    .filter((line) => line.teamId === teamId)
    .map((line, index) => ({
      key: index,
      playerId: line.playerId,
      stats: Object.fromEntries(STATS.map((stat) => [stat, String(line[stat])])) as Record<Stat, string>,
    }));
}

function NumberCell({ value, onChange, label, disabled }: { value: string; onChange: (value: string) => void; label: string; disabled: boolean }): JSX.Element {
  return (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      aria-label={label}
      className={CELL}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function ManualResultForm({ leagueGameId, home, away, rosters, initial, minInnings, canEdit }: Props): JSX.Element {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initial?.kind ?? 'final');
  const [homeRuns, setHomeRuns] = useState(initial?.kind === 'final' ? String(initial.homeRuns) : '');
  const [awayRuns, setAwayRuns] = useState(initial?.kind === 'final' ? String(initial.awayRuns) : '');
  const [winnerTeamId, setWinnerTeamId] = useState(initial?.kind === 'forfeit' ? initial.winnerTeamId : home.teamId);
  const [innings, setInnings] = useState({
    home: initialInnings(initial, 'home', minInnings),
    away: initialInnings(initial, 'away', minInnings),
  });
  const hasBox = initial?.kind === 'box' || initial?.kind === 'batting';
  const [totals, setTotals] = useState({
    homeHits: hasBox ? String(initial.homeHits) : '',
    awayHits: hasBox ? String(initial.awayHits) : '',
    homeErrors: hasBox ? String(initial.homeErrors) : '',
    awayErrors: hasBox ? String(initial.awayErrors) : '',
  });
  const [lines, setLines] = useState<Record<string, LineDraft[]>>({
    [home.teamId]: initialLines(initial, home.teamId),
    [away.teamId]: initialLines(initial, away.teamId),
  });
  const [players, setPlayers] = useState<Record<string, ManualRosterPlayer[]>>(
    Object.fromEntries(rosters.map((roster) => [roster.teamId, roster.players])),
  );
  const [nextKey, setNextKey] = useState(1000);
  const [adding, setAdding] = useState<{ teamId: string; firstName: string; lastName: string; jersey: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const locked = !canEdit || pending;

  function setInning(side: 'home' | 'away', index: number, value: string): void {
    setInnings((current) => ({ ...current, [side]: current[side].map((cell, i) => (i === index ? value : cell)) }));
  }

  function addInning(): void {
    setInnings((current) => ({ home: [...current.home, ''], away: [...current.away, ''] }));
  }

  function updateLine(teamId: string, key: number, change: (line: LineDraft) => LineDraft): void {
    setLines((current) => ({ ...current, [teamId]: current[teamId].map((line) => (line.key === key ? change(line) : line)) }));
  }

  function addLine(teamId: string): void {
    setLines((current) => ({ ...current, [teamId]: [...current[teamId], { key: nextKey, playerId: '', stats: emptyStats() }] }));
    setNextKey((key) => key + 1);
  }

  function removeLine(teamId: string, key: number): void {
    setLines((current) => ({ ...current, [teamId]: current[teamId].filter((line) => line.key !== key) }));
  }

  async function submitNewPlayer(): Promise<void> {
    if (!adding) return;
    const jersey = adding.jersey.trim() === '' ? null : Number(adding.jersey);
    if (jersey !== null && !Number.isInteger(jersey)) {
      setError('Jersey number must be a whole number.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const outcome = await addRosterPlayerAction(leagueGameId, adding.teamId, adding.firstName, adding.lastName, jersey);
      if ('error' in outcome) {
        setError(outcome.error);
        return;
      }
      setPlayers((current) => ({
        ...current,
        [adding.teamId]: [...(current[adding.teamId] ?? []), { id: outcome.playerId, name: outcome.name, jersey: outcome.jersey }],
      }));
      const teamId = adding.teamId;
      setLines((current) => ({ ...current, [teamId]: [...current[teamId], { key: nextKey, playerId: outcome.playerId, stats: emptyStats() }] }));
      setNextKey((key) => key + 1);
      setAdding(null);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  function buildPayload(): ManualResultInput {
    if (kind === 'final') return { kind, leagueGameId, homeRuns: toNumber(homeRuns), awayRuns: toNumber(awayRuns) };
    if (kind === 'forfeit') return { kind, leagueGameId, winnerTeamId };
    const box = {
      leagueGameId,
      homeInningRuns: innings.home.map(toNumber),
      awayInningRuns: innings.away.map(toNumber),
      homeHits: toNumber(totals.homeHits),
      awayHits: toNumber(totals.awayHits),
      homeErrors: toNumber(totals.homeErrors),
      awayErrors: toNumber(totals.awayErrors),
    };
    if (kind === 'box') return { kind, ...box };
    const batting = [home.teamId, away.teamId].flatMap((teamId) =>
      (lines[teamId] ?? [])
        .filter((line) => line.playerId)
        .map((line) => ({
          teamId,
          playerId: line.playerId,
          ab: toNumber(line.stats.ab), r: toNumber(line.stats.r), h: toNumber(line.stats.h),
          doubles: toNumber(line.stats.doubles), triples: toNumber(line.stats.triples), hr: toNumber(line.stats.hr),
          rbi: toNumber(line.stats.rbi), bb: toNumber(line.stats.bb), so: toNumber(line.stats.so),
          hbp: toNumber(line.stats.hbp), sf: toNumber(line.stats.sf), sb: toNumber(line.stats.sb),
        })),
    );
    return { kind, ...box, lines: batting };
  }

  async function save(): Promise<void> {
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const message = await saveManualResultAction(buildPayload());
      if (message) setError(message);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  const sides = [
    { side: 'away' as const, team: away, hitsKey: 'awayHits' as const, errorsKey: 'awayErrors' as const },
    { side: 'home' as const, team: home, hitsKey: 'homeHits' as const, errorsKey: 'homeErrors' as const },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kind of result">
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            role="tab"
            aria-selected={kind === option.kind}
            disabled={locked}
            onClick={() => setKind(option.kind)}
            className={`text-sm font-medium px-3 py-1.5 rounded-md border ${
              kind === option.kind ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            } disabled:opacity-50`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {kind === 'final' && (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          {sides.map(({ side, team }) => (
            <label key={side} className="text-sm text-gray-700 space-y-1">
              <span className="block">{team.name} runs</span>
              <NumberCell
                label={`${team.name} runs`}
                value={side === 'home' ? homeRuns : awayRuns}
                onChange={side === 'home' ? setHomeRuns : setAwayRuns}
                disabled={locked}
              />
            </label>
          ))}
        </div>
      )}

      {kind === 'forfeit' && (
        <label className="text-sm text-gray-700 space-y-1 block">
          <span className="block">Winner</span>
          <select className={INPUT} value={winnerTeamId} disabled={locked} onChange={(event) => setWinnerTeamId(event.target.value)}>
            <option value={home.teamId}>{home.name}</option>
            <option value={away.teamId}>{away.name}</option>
          </select>
        </label>
      )}

      {(kind === 'box' || kind === 'batting') && (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="text-left pr-3 font-medium">Team</th>
                  {innings.home.map((_, index) => (
                    <th key={index} className="font-medium">{index + 1}</th>
                  ))}
                  <th className="font-medium pl-2">H</th>
                  <th className="font-medium">E</th>
                </tr>
              </thead>
              <tbody>
                {sides.map(({ side, team, hitsKey, errorsKey }) => (
                  <tr key={side}>
                    <td className="pr-3 text-gray-900">{team.name}</td>
                    {innings[side].map((cell, index) => (
                      <td key={index} className="px-0.5 py-0.5">
                        <NumberCell label={`${team.name} inning ${index + 1}`} value={cell} onChange={(value) => setInning(side, index, value)} disabled={locked} />
                      </td>
                    ))}
                    <td className="pl-2 px-0.5">
                      <NumberCell label={`${team.name} hits`} value={totals[hitsKey]} onChange={(value) => setTotals((t) => ({ ...t, [hitsKey]: value }))} disabled={locked} />
                    </td>
                    <td className="px-0.5">
                      <NumberCell label={`${team.name} errors`} value={totals[errorsKey]} onChange={(value) => setTotals((t) => ({ ...t, [errorsKey]: value }))} disabled={locked} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={BUTTON} disabled={locked} onClick={addInning}>
            Add inning
          </button>
        </div>
      )}

      {kind === 'batting' &&
        sides.map(({ team }) => (
          <section key={team.teamId} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">{team.name} batting</h2>
            {(lines[team.teamId] ?? []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="text-left font-medium pr-2">Player</th>
                      {STATS.map((stat) => (
                        <th key={stat} className="font-medium">{STAT_LABELS[stat]}</th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lines[team.teamId].map((line) => (
                      <tr key={line.key}>
                        <td className="pr-2 py-0.5">
                          <select
                            className={INPUT}
                            aria-label={`${team.name} player`}
                            value={line.playerId}
                            disabled={locked}
                            onChange={(event) => updateLine(team.teamId, line.key, (current) => ({ ...current, playerId: event.target.value }))}
                          >
                            <option value="">Choose player</option>
                            {(players[team.teamId] ?? []).map((player) => (
                              <option key={player.id} value={player.id}>
                                {player.jersey === null ? '' : `#${player.jersey} `}{player.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        {STATS.map((stat) => (
                          <td key={stat} className="px-0.5">
                            <NumberCell
                              label={`${STAT_LABELS[stat]}`}
                              value={line.stats[stat]}
                              disabled={locked}
                              onChange={(value) => updateLine(team.teamId, line.key, (current) => ({ ...current, stats: { ...current.stats, [stat]: value } }))}
                            />
                          </td>
                        ))}
                        <td>
                          <button type="button" className={BUTTON} disabled={locked} onClick={() => removeLine(team.teamId, line.key)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={BUTTON} disabled={locked} onClick={() => addLine(team.teamId)}>
                Add batter
              </button>
              <button
                type="button"
                className={BUTTON}
                disabled={locked}
                onClick={() => setAdding({ teamId: team.teamId, firstName: '', lastName: '', jersey: '' })}
              >
                Add player
              </button>
            </div>
            {adding?.teamId === team.teamId && (
              <div className="flex flex-wrap items-center gap-2">
                <input className={INPUT} placeholder="First name" aria-label="First name" value={adding.firstName} onChange={(event) => setAdding({ ...adding, firstName: event.target.value })} />
                <input className={INPUT} placeholder="Last name" aria-label="Last name" value={adding.lastName} onChange={(event) => setAdding({ ...adding, lastName: event.target.value })} />
                <input className={`${INPUT} w-20`} placeholder="Jersey #" aria-label="Jersey number" inputMode="numeric" value={adding.jersey} onChange={(event) => setAdding({ ...adding, jersey: event.target.value })} />
                <button type="button" className={BUTTON} disabled={locked} onClick={() => void submitNewPlayer()}>
                  Add to roster
                </button>
                <button type="button" className={BUTTON} onClick={() => setAdding(null)}>
                  Cancel
                </button>
              </div>
            )}
          </section>
        ))}

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-green-700">Result saved.</p>}
      {canEdit && (
        <button type="button" className={PRIMARY} disabled={pending} onClick={() => void save()}>
          {pending ? 'Saving…' : 'Save result'}
        </button>
      )}
    </div>
  );
}
