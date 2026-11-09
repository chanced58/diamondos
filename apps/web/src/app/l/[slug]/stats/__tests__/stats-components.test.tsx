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
// The view must not trigger a server round trip on tab change; fail loudly if it does.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
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
  caption: 'Batting stats',
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
  it('hides Lg/Tm when ranks is null', () => {
    render(<PlayerStatsTable {...tableProps} ranks={null} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Lg');
    expect(headers).not.toContain('Tm');
    expect(headers.some((h) => h?.startsWith('Player'))).toBe(true);
  });

  it('shows "—" ranks and muted style for an unqualified row', () => {
    render(<PlayerStatsTable {...tableProps} ranks={battingRanks} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(0, 2)).toEqual(['Lg', 'Tm']);
    expect(screen.getByRole('columnheader', { name: 'League rank' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Team rank' })).toBeTruthy();

    const bobCells = within(rowFor('Bob Baker')).getAllByRole('cell');
    expect(bobCells[0].textContent).toBe('—');
    expect(bobCells[1].textContent).toBe('—');
    expect(rowFor('Bob Baker').className).toContain('text-app-fg-subtle');

    const aliceCells = within(rowFor('Alice Avery')).getAllByRole('cell');
    expect(aliceCells[0].textContent).toBe('1');
    expect(aliceCells[1].textContent).toBe('1');
    expect(rowFor('Alice Avery').className).not.toContain('text-app-fg-subtle');
  });

  it('marks the selected player’s row with the turf highlight and ◆ marker', () => {
    render(<PlayerStatsTable {...tableProps} ranks={battingRanks} highlightId="a" />);
    expect(rowFor('Alice Avery').classList.contains('bg-turf-50')).toBe(true);
    expect(within(rowFor('Alice Avery')).getByLabelText('Your player')).toBeTruthy();
    expect(within(rowFor('Cara Cole')).queryByLabelText('Your player')).toBeNull();
    expect(rowFor('Alice Avery').id).toBe('row-a');
  });

  it('gives other linked players the lighter tint without the ◆ marker', () => {
    const kidRow = { ...cara, mine: true };
    render(<PlayerStatsTable {...tableProps} players={[alice, bob, kidRow]} ranks={battingRanks} highlightId="c" />);
    expect(rowFor('Cara Cole').classList.contains('bg-turf-50')).toBe(true);
    expect(within(rowFor('Cara Cole')).getByLabelText('Your player')).toBeTruthy();
    expect(rowFor('Alice Avery').classList.contains('bg-turf-50')).toBe(false);
    expect(rowFor('Alice Avery').classList.contains('bg-turf-50/50')).toBe(true);
    expect(within(rowFor('Alice Avery')).queryByLabelText('Your player')).toBeNull();
    expect(screen.getAllByLabelText('Your player')).toHaveLength(1);
  });

  it('keeps the sticky Player cell offset equal to the two rank columns and caps the name', () => {
    const { unmount } = render(<PlayerStatsTable {...tableProps} ranks={battingRanks} />);
    const [lgTh, tmTh, playerTh] = screen.getAllByRole('columnheader');
    expect(lgTh.className).toContain('w-10');
    expect(tmTh.className).toContain('left-10');
    expect(tmTh.className).toContain('w-10');
    expect(playerTh.className).toContain('left-20');
    const cells = within(rowFor('Alice Avery')).getAllByRole('cell');
    expect(cells[0].className).toContain('w-10');
    expect(cells[1].className).toContain('left-10');
    expect(cells[2].className).toContain('left-20');
    const name = screen.getByTitle('Alice Avery');
    expect(name.className).toContain('max-w-[8rem]');
    expect(name.className).toContain('truncate');
    unmount();

    render(<PlayerStatsTable {...tableProps} ranks={null} />);
    expect(screen.getAllByRole('columnheader')[0].className).toContain('left-0');
    expect(within(rowFor('Alice Avery')).getAllByRole('cell')[0].className).toContain('left-0');
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
  onShowInTable: () => {},
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
    expect(screen.getByText('No innings pitched this season.')).toBeTruthy();
    // No row exists to scroll to on that tab.
    expect(screen.queryByRole('button', { name: /Show in table/ })).toBeNull();
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
    render(<TeamStatsTable teams={teams.map((t) => ({ ...t, rank: null }))} showRank={false} slug="metro" season="2026" highlightTeamId={null} ourTeamId={null} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('#');
    expect(headers.some((h) => h?.startsWith('Team AVG'))).toBe(true);
  });

  it('shows the standings rank and links team names', () => {
    render(<TeamStatsTable teams={teams} showRank slug="metro" season="2026" highlightTeamId={null} ourTeamId={null} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers[0]).toBe('#');
    const owls = screen.getByRole('link', { name: 'Owls' });
    expect(owls.getAttribute('href')).toBe('/l/metro/team/t2?season=2026');
    expect(within(owls.closest('tr') as HTMLElement).getAllByRole('cell')[0].textContent).toBe('2');
  });
});

describe('TeamStatsTable highlight', () => {
  const props = { teams, showRank: true, slug: 'metro', season: '2026' };
  const teamRow = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;

  it('gives the coach’s active team the lighter tint when no player is selected', () => {
    render(<TeamStatsTable {...props} highlightTeamId={null} ourTeamId="t2" />);
    expect(teamRow('Owls').classList.contains('bg-turf-50/50')).toBe(true);
    expect(teamRow('Owls').classList.contains('bg-turf-50')).toBe(false);
    expect(within(teamRow('Owls')).queryByLabelText('Your team')).toBeNull();
    expect(teamRow('Hawks').className).not.toContain('bg-turf');
  });

  it('prefers the selected player’s team over the active team', () => {
    render(<TeamStatsTable {...props} highlightTeamId="t1" ourTeamId="t2" />);
    expect(teamRow('Hawks').classList.contains('bg-turf-50')).toBe(true);
    expect(within(teamRow('Hawks')).getByLabelText('Your team')).toBeTruthy();
    expect(teamRow('Owls').className).not.toContain('bg-turf');
  });
});

describe('LeagueStatsView', () => {
  const viewProps = {
    slug: 'metro',
    season: '2026',
    seasons: ['2026', '2025'],
    leagueName: 'Metro League',
    initialTab: 'batting' as const,
    players,
    ranks: { batting: battingRanks, pitching: pitchingRanks },
    teams,
    myPlayers: [me],
    ourTeamId: null,
    mins,
    rankingEnabled: true,
    standingsRankEnabled: true,
  };

  let replaceState: jest.SpyInstance;
  beforeEach(() => {
    mockReplace.mockReset();
    replaceState = jest.spyOn(window.history, 'replaceState');
  });
  afterEach(() => replaceState.mockRestore());

  it('syncs the tab to ?tab= via history.replaceState, without a router navigation', () => {
    render(<LeagueStatsView {...viewProps} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));
    expect(replaceState).toHaveBeenCalledWith(null, '', '/l/metro/stats?season=2026&tab=teams');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Teams' }).getAttribute('aria-selected')).toBe('true');
  });

  it('season links carry the current tab after a tab change', () => {
    render(<LeagueStatsView {...viewProps} />);
    const nav = screen.getByRole('navigation', { name: 'Season' });
    expect(within(nav).getByRole('link', { name: '2025' }).getAttribute('href')).toBe(
      '/l/metro/stats?season=2025&tab=batting',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pitching' }));
    expect(within(nav).getByRole('link', { name: '2025' }).getAttribute('href')).toBe(
      '/l/metro/stats?season=2025&tab=pitching',
    );
    expect(within(nav).getByRole('link', { name: '2026' }).getAttribute('aria-current')).toBe('true');
  });

  it('hides the season switcher when there is only one season', () => {
    render(<LeagueStatsView {...viewProps} seasons={['2026']} />);
    expect(screen.queryByRole('navigation', { name: 'Season' })).toBeNull();
    expect(screen.getByRole('link', { name: '← Metro League' }).getAttribute('href')).toBe('/l/metro?season=2026');
  });

  it('shows AVG ranks in the rank columns when sorted by player name', () => {
    render(<LeagueStatsView {...viewProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^Player/ }));
    // Cara is #2 in AVG league-wide.
    expect(within(rowFor('Cara Cole')).getAllByRole('cell')[0].textContent).toBe('2');
    // "Qualified only" still applies, by AVG's qualifier: Bob is hidden until it's off.
    expect(screen.queryByText('Bob Baker')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Qualified only' }));
    expect(within(rowFor('Bob Baker')).getAllByRole('cell')[0].textContent).toBe('—');
  });

  it('arrow keys move between tabs; the panel is labelled by the active tab', () => {
    render(<LeagueStatsView {...viewProps} />);
    const batting = screen.getByRole('tab', { name: 'Batting' });
    expect(batting.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Pitching' }).getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(batting, { key: 'ArrowRight' });
    const pitching = screen.getByRole('tab', { name: 'Pitching' });
    expect(pitching.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(pitching);
    fireEvent.keyDown(pitching, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Teams' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Teams' }), { key: 'ArrowRight' });
    expect(batting.getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel', { name: 'Batting' });
    expect(batting.getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByRole('table', { name: 'Batting stats' })).toBeTruthy();
  });

  it('"Show in table" clears a team filter that hides the player, then scrolls to the row', () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<LeagueStatsView {...viewProps} />);
    fireEvent.change(screen.getByRole('combobox', { name: /team/i }), { target: { value: 't2' } });
    expect(screen.queryByText('Alice Avery', { selector: 'td span' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show in table/ }));
    expect(screen.getByText('Alice Avery', { selector: 'td span' })).toBeTruthy();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('labels the unranked group when unqualified players are shown', () => {
    render(<LeagueStatsView {...viewProps} myPlayers={[]} />);
    expect(screen.queryByText('Not ranked · listed by name')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Qualified only' }));
    const divider = screen.getByText('Not ranked · listed by name').closest('tr') as HTMLElement;
    expect(divider.nextElementSibling).toBe(rowFor('Bob Baker'));
    // The unranked rows form their own row group, apart from the ranked rows.
    expect(divider.parentElement?.tagName).toBe('TBODY');
    expect(divider.parentElement).not.toBe(rowFor('Alice Avery').parentElement);
    // The table is no longer in one sort order: say so instead of "descending".
    expect(screen.getByRole('columnheader', { name: /^AVG/ }).getAttribute('aria-sort')).toBe('other');
    expect(screen.getByRole('table', { name: /unranked players follow, by name/ })).toBeTruthy();
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
