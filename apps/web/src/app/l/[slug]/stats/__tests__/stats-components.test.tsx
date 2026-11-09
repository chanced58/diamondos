/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BATTING_COLUMNS, PITCHING_COLUMNS } from '@/lib/league-stats/columns';
import { computeRankTable, type StatsPlayer } from '@/lib/league-stats/ranks';
import type { MyPlayer, StatsTeam } from '@/lib/league-stats/load';
import { PlayerStatsTable } from '../_components/PlayerStatsTable';
import { YourRanksCard } from '../_components/YourRanksCard';
import { TeamStatsTable } from '../_components/TeamStatsTable';
import { LeagueStatsView } from '../_components/LeagueStatsView';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mins = { paMin: 10, ipOutsMin: 9 };

function player(over: Partial<StatsPlayer> & Pick<StatsPlayer, 'playerId' | 'name'>): StatsPlayer {
  return {
    teamId: 't1',
    teamName: 'Hawks',
    pa: 0,
    ipOuts: 0,
    stats: {},
    mine: false,
    ourTeam: false,
    ...over,
  };
}

const alice = player({ playerId: 'a', name: 'Alice Avery', pa: 30, stats: { avg: 0.4, obp: 0.45, homeRuns: 3, rbi: 9 }, mine: true });
const bob = player({ playerId: 'b', name: 'Bob Baker', pa: 2, stats: { avg: 0.5, obp: 0.5, homeRuns: 0, rbi: 1 } });
const cara = player({ playerId: 'c', name: 'Cara Cole', teamId: 't2', teamName: 'Owls', pa: 25, stats: { avg: 0.3, obp: 0.35, homeRuns: 5, rbi: 12 } });
const players = [alice, bob, cara];
const battingRanks = computeRankTable(players, BATTING_COLUMNS, 'batting', mins);
const pitchingRanks = computeRankTable(players, PITCHING_COLUMNS, 'pitching', mins);

const teams: StatsTeam[] = [
  { teamId: 't1', name: 'Hawks', wins: 5, losses: 2, ties: 1, winPct: 0.688, rank: 1, stats: { teamAvg: 0.31 } },
  { teamId: 't2', name: 'Owls', wins: 2, losses: 5, ties: 1, winPct: 0.313, rank: 2, stats: { teamAvg: 0.27 } },
];

const tableProps = {
  players,
  columns: BATTING_COLUMNS,
  sortKey: 'avg',
  sortDir: 'desc' as const,
  rankKey: 'avg',
  onSort: () => {},
  highlightId: null,
  slug: 'metro',
  season: '2026',
};

const rowFor = (name: string): HTMLElement => screen.getByText(name).closest('tr') as HTMLElement;

describe('PlayerStatsTable', () => {
  it('hides Lg #/Team # when ranks is null', () => {
    render(<PlayerStatsTable {...tableProps} ranks={null} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Lg #');
    expect(headers).not.toContain('Team #');
    expect(headers.some((h) => h?.startsWith('Player'))).toBe(true);
  });

  it('shows "—" ranks and muted style for an unqualified row', () => {
    render(<PlayerStatsTable {...tableProps} ranks={battingRanks} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(0, 2)).toEqual(['Lg #', 'Team #']);

    const bobCells = within(rowFor('Bob Baker')).getAllByRole('cell');
    expect(bobCells[0].textContent).toBe('—');
    expect(bobCells[1].textContent).toBe('—');
    expect(rowFor('Bob Baker').className).toContain('text-app-fg-subtle');

    const aliceCells = within(rowFor('Alice Avery')).getAllByRole('cell');
    expect(aliceCells[0].textContent).toBe('1');
    expect(aliceCells[1].textContent).toBe('1');
    expect(rowFor('Alice Avery').className).not.toContain('text-app-fg-subtle');
  });

  it('marks the viewer’s own row with the turf highlight and ◆ marker', () => {
    render(<PlayerStatsTable {...tableProps} ranks={battingRanks} />);
    expect(rowFor('Alice Avery').className).toContain('bg-turf-50');
    expect(within(rowFor('Alice Avery')).getByLabelText('Your player')).toBeTruthy();
    expect(within(rowFor('Cara Cole')).queryByLabelText('Your player')).toBeNull();
    expect(rowFor('Alice Avery').id).toBe('row-a');
  });

  it('links team names to the season-scoped team page', () => {
    render(<PlayerStatsTable {...tableProps} ranks={null} />);
    const link = within(rowFor('Cara Cole')).getByRole('link', { name: 'Owls' });
    expect(link.getAttribute('href')).toBe('/l/metro/team/t2?season=2026');
  });

  it('reports header clicks with the column key and natural direction', () => {
    const onSort = jest.fn();
    render(<PlayerStatsTable {...tableProps} ranks={null} onSort={onSort} />);
    fireEvent.click(screen.getByRole('button', { name: /^HR/ }));
    expect(onSort).toHaveBeenCalledWith('homeRuns', 'desc');
    fireEvent.click(screen.getByRole('button', { name: /^Player/ }));
    expect(onSort).toHaveBeenCalledWith('name', 'asc');
  });
});

const me: MyPlayer = { playerId: 'a', name: 'Alice Avery', teamName: 'Hawks' };
const kid: MyPlayer = { playerId: 'c', name: 'Cara Cole', teamName: 'Owls' };

const cardProps = {
  players,
  tab: 'batting' as const,
  mins,
  selectedId: 'a',
  onSelect: () => {},
  teams,
};

describe('YourRanksCard', () => {
  it('is titled "Your stats" with no "#" text when ranking is off', () => {
    const { container } = render(
      <YourRanksCard {...cardProps} myPlayers={[me]} ranks={null} rankingEnabled={false} />,
    );
    expect(screen.getByRole('heading', { name: 'Your stats' })).toBeTruthy();
    expect(container.textContent).toContain('.400');
    expect(container.textContent).not.toContain('#');
  });

  it('is titled "Your ranks" with league and team ranks when ranking is on', () => {
    const { container } = render(
      <YourRanksCard
        {...cardProps}
        myPlayers={[me]}
        ranks={{ batting: battingRanks, pitching: pitchingRanks }}
        rankingEnabled
      />,
    );
    expect(screen.getByRole('heading', { name: 'Your ranks' })).toBeTruthy();
    expect(container.textContent).toContain('#1 of 2');
    expect(container.textContent).toContain('#1 on Hawks');
  });

  it('shows a switcher only for more than one player', () => {
    const onSelect = jest.fn();
    const { rerender } = render(
      <YourRanksCard {...cardProps} myPlayers={[me]} ranks={null} rankingEnabled={false} onSelect={onSelect} />,
    );
    expect(screen.queryByRole('combobox')).toBeNull();

    rerender(
      <YourRanksCard {...cardProps} myPlayers={[me, kid]} ranks={null} rankingEnabled={false} onSelect={onSelect} />,
    );
    const select = screen.getByRole('combobox', { name: 'Player' });
    fireEvent.change(select, { target: { value: 'c' } });
    expect(onSelect).toHaveBeenCalledWith('c');
  });

  it('says so in one line when the player has no line for the tab', () => {
    render(
      <YourRanksCard {...cardProps} tab="pitching" myPlayers={[me]} ranks={null} rankingEnabled={false} />,
    );
    expect(screen.getByText('No pitching stats this season.')).toBeTruthy();
  });

  it('shows the team record and standing on the Teams tab', () => {
    const { container, rerender } = render(
      <YourRanksCard {...cardProps} tab="teams" myPlayers={[me]} ranks={null} rankingEnabled={false} />,
    );
    expect(container.textContent).toContain('5-2-1');
    expect(container.textContent).toContain('#1 of 2');

    const unranked = teams.map((t) => ({ ...t, rank: null }));
    rerender(
      <YourRanksCard {...cardProps} tab="teams" teams={unranked} myPlayers={[me]} ranks={null} rankingEnabled={false} />,
    );
    expect(container.textContent).toContain('5-2-1');
    expect(container.textContent).not.toContain('#');
  });
});

describe('TeamStatsTable', () => {
  it('hides the # column when standings rank is off', () => {
    render(<TeamStatsTable teams={teams.map((t) => ({ ...t, rank: null }))} showRank={false} slug="metro" season="2026" highlightTeamId={null} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('#');
    expect(headers.some((h) => h?.startsWith('Team AVG'))).toBe(true);
  });

  it('shows the standings rank and links team names', () => {
    render(<TeamStatsTable teams={teams} showRank slug="metro" season="2026" highlightTeamId={null} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers[0]).toBe('#');
    const owls = screen.getByRole('link', { name: 'Owls' });
    expect(owls.getAttribute('href')).toBe('/l/metro/team/t2?season=2026');
    expect(within(owls.closest('tr') as HTMLElement).getAllByRole('cell')[0].textContent).toBe('2');
  });
});

describe('LeagueStatsView', () => {
  const viewProps = {
    slug: 'metro',
    season: '2026',
    initialTab: 'batting' as const,
    players,
    ranks: { batting: battingRanks, pitching: pitchingRanks },
    teams,
    myPlayers: [me],
    mins,
    rankingEnabled: true,
    standingsRankEnabled: true,
  };

  beforeEach(() => mockReplace.mockReset());

  it('syncs the tab to ?tab= without scrolling', () => {
    render(<LeagueStatsView {...viewProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    expect(mockReplace).toHaveBeenCalledWith('/l/metro/stats?season=2026&tab=teams', { scroll: false });
    expect(screen.getByRole('tab', { name: 'Teams' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows AVG ranks in the rank columns when sorted by player name', () => {
    render(<LeagueStatsView {...viewProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^Player/ }));
    // Cara is #2 in AVG league-wide; Bob (unqualified) stays unranked.
    expect(within(rowFor('Cara Cole')).getAllByRole('cell')[0].textContent).toBe('2');
    expect(within(rowFor('Bob Baker')).getAllByRole('cell')[0].textContent).toBe('—');
  });

  it('hides unqualified players by default and shows them when the switch is off', () => {
    render(<LeagueStatsView {...viewProps} myPlayers={[]} />);
    expect(screen.queryByText('Bob Baker')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Qualified only' }));
    expect(screen.getByText('Bob Baker')).toBeTruthy();
  });

  it('omits the qualified switch when ranking is off', () => {
    render(<LeagueStatsView {...viewProps} ranks={null} rankingEnabled={false} />);
    expect(screen.queryByRole('switch', { name: 'Qualified only' })).toBeNull();
    expect(screen.getByText('Bob Baker')).toBeTruthy();
  });
});
