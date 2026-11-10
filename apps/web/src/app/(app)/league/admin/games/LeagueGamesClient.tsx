'use client';

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate, formatTime, utcToZonedDateTime } from '@baseball/shared';
import type { LeagueGameListItem } from '@/lib/services/league-games/league-games';
import { startGameAction } from '@/app/(app)/games/[gameId]/actions';
import { cancelLeagueGameAction, createLeagueGameAction, updateLeagueGameAction } from './actions';

interface LeagueGamesClientProps {
  leagueId: string;
  season: string | null;
  isLeagueAdmin: boolean;
  teams: { id: string; name: string }[];
  games: LeagueGameListItem[];
  unmatchedCount: number;
}

const INPUT = 'text-sm rounded-md border border-gray-200 bg-white px-2 py-1';
const BUTTON = 'text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50';
const PRIMARY = 'text-sm font-medium px-3 py-1.5 rounded-md bg-brand-700 text-white hover:bg-brand-600 disabled:opacity-50';
const LINK = 'text-xs font-medium text-brand-700 hover:underline';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Final',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
};

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/** Whether a hand-entered result may be offered: the game is not scored in a book. */
function canEnterResult(game: LeagueGameListItem): boolean {
  if (game.status === 'cancelled' || game.status === 'in_progress') return false;
  return game.status !== 'completed' || game.hasManualResult;
}

function scoreLabel(game: LeagueGameListItem): string {
  if (game.homeRuns === null || game.awayRuns === null) return '—';
  return `${game.awayRuns}–${game.homeRuns}`;
}

function StartButton(): JSX.Element {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${LINK} disabled:opacity-50`}>{pending ? 'Starting…' : 'Start scoring'}</button>;
}

/** Starts the home row's book (needs its lineup); lands on the web scorer. */
function StartScoringForm({ gameId }: { gameId: string }): JSX.Element {
  const [error, formAction] = useFormState(startGameAction, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="gameId" value={gameId} />
      <StartButton />
      {error ? <span role="alert" className="ml-2 text-xs text-red-600">{error}</span> : null}
    </form>
  );
}

function AddGameForm({ leagueId, teams, onDone }: { leagueId: string; teams: LeagueGamesClientProps['teams']; onDone: () => void }): JSX.Element {
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [venueName, setVenueName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTimeZone(browserTimeZone()), []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    const message = await createLeagueGameAction({
      leagueId,
      homeTeamId,
      awayTeamId,
      date,
      time,
      timeZone,
      ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
    });
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600 space-y-1 block">
          Home team
          <select required value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)} className={`${INPUT} w-full`}>
            <option value="">Choose a team</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600 space-y-1 block">
          Away team
          <select required value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} className={`${INPUT} w-full`}>
            <option value="">Choose a team</option>
            {teams.filter((team) => team.id !== homeTeamId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600 space-y-1 block">
          Date
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-full`} />
        </label>
        <label className="text-xs text-gray-600 space-y-1 block">
          Start time
          <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${INPUT} w-full`} />
        </label>
        <label className="text-xs text-gray-600 space-y-1 block">
          Time zone
          <input required value={timeZone} onChange={(e) => setTimeZone(e.target.value)} className={`${INPUT} w-full`} />
        </label>
        <label className="text-xs text-gray-600 space-y-1 block">
          Venue (optional)
          <input value={venueName} maxLength={200} onChange={(e) => setVenueName(e.target.value)} className={`${INPUT} w-full`} />
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={PRIMARY}>{pending ? 'Adding…' : 'Add game'}</button>
        <button type="button" onClick={onDone} className={BUTTON}>Close</button>
      </div>
    </form>
  );
}

function EditGameRow({ game, onDone }: { game: LeagueGameListItem; onDone: () => void }): JSX.Element {
  const zone = game.timeZone ?? browserTimeZone();
  const current = utcToZonedDateTime(game.scheduledAt, zone);
  const [date, setDate] = useState(current.date);
  const [time, setTime] = useState(current.time);
  const [venueName, setVenueName] = useState(game.venueName ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setPending(true);
    setError(null);
    const message = await updateLeagueGameAction({
      leagueGameId: game.id,
      date,
      time,
      timeZone: zone,
      ...(venueName.trim() ? { venueName: venueName.trim() } : {}),
    });
    setPending(false);
    if (message) {
      setError(message);
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
      <input type="time" aria-label="Start time" value={time} onChange={(e) => setTime(e.target.value)} className={INPUT} />
      <input aria-label="Venue" placeholder="Venue" value={venueName} maxLength={200} onChange={(e) => setVenueName(e.target.value)} className={INPUT} />
      <button type="button" disabled={pending} onClick={save} className={BUTTON}>{pending ? 'Saving…' : 'Save'}</button>
      <button type="button" onClick={onDone} className={BUTTON}>Close</button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

function GameRow({ game, isLeagueAdmin }: { game: LeagueGameListItem; isLeagueAdmin: boolean }): JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const editable = isLeagueAdmin && game.status !== 'completed' && game.status !== 'cancelled';

  async function cancel(): Promise<void> {
    const label = `${game.away.name} at ${game.home.name}`;
    if (!confirm(`Cancel ${label}? Both teams will see it as cancelled.`)) return;
    setCancelling(true);
    setError(null);
    const message = await cancelLeagueGameAction(game.id);
    setCancelling(false);
    if (message) {
      setError(message);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t border-gray-100 align-top">
      <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
        {formatDate(game.scheduledAt, game.timeZone)}
        <div className="text-xs text-gray-500">{formatTime(game.scheduledAt, game.timeZone)}</div>
      </td>
      <td className="px-3 py-2 text-sm text-gray-900">{game.home.name}</td>
      <td className="px-3 py-2 text-sm text-gray-900">{game.away.name}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{game.venueName ?? '—'}</td>
      <td className="px-3 py-2 text-sm text-gray-600">
        {STATUS_LABEL[game.status] ?? game.status}
        {game.needsSettling ? <div className="text-xs text-amber-700">Books disagree</div> : null}
      </td>
      <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{scoreLabel(game)}</td>
      <td className="px-3 py-2 space-y-1">
        {editing ? (
          <EditGameRow game={game} onDone={() => { setEditing(false); router.refresh(); }} />
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {editable ? <button type="button" className={LINK} onClick={() => setEditing(true)}>Edit time/venue</button> : null}
            {game.home.gameId && game.status === 'in_progress' ? (
              <Link href={`/games/${game.home.gameId}/score`} className={LINK}>Score on web</Link>
            ) : null}
            {game.home.gameId && (game.status === 'scheduled' || game.status === 'in_progress') ? (
              <Link href={`/games/${game.home.gameId}/lineup`} className={LINK}>Set home lineup</Link>
            ) : null}
            {game.home.gameId && game.status === 'scheduled' ? <StartScoringForm gameId={game.home.gameId} /> : null}
            {isLeagueAdmin && canEnterResult(game) ? (
              <Link href={`/league/admin/games/${game.id}/result`} className={LINK}>
                {game.hasManualResult ? 'Edit result' : 'Enter result'}
              </Link>
            ) : null}
            {editable ? (
              <button type="button" disabled={cancelling} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50" onClick={cancel}>
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            ) : null}
          </div>
        )}
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      </td>
    </tr>
  );
}

export function LeagueGamesClient({ leagueId, season, isLeagueAdmin, teams, games, unmatchedCount }: LeagueGamesClientProps): JSX.Element {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/league/admin/games/unmatched?leagueId=${leagueId}`} className={LINK}>
          Unknown players{unmatchedCount > 0 ? ` (${unmatchedCount})` : ''}
        </Link>
        {isLeagueAdmin && season && !adding ? (
          <button type="button" className={PRIMARY} onClick={() => setAdding(true)}>Add game</button>
        ) : null}
      </div>
      {!season ? <p className="text-sm text-gray-500">Set the league&apos;s current season in League Admin before scheduling games.</p> : null}
      {adding ? <AddGameForm leagueId={leagueId} teams={teams} onDone={() => { setAdding(false); router.refresh(); }} /> : null}
      {games.length === 0 ? (
        <p className="text-sm text-gray-500">No league games scheduled for this season.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Home</th>
                <th className="px-3 py-2 font-medium">Away</th>
                <th className="px-3 py-2 font-medium">Venue</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Score (away–home)</th>
                <th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => <GameRow key={game.id} game={game} isLeagueAdmin={isLeagueAdmin} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
