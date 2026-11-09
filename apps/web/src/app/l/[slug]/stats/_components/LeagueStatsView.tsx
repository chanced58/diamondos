'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { leagueStatsHref } from '@/lib/league-home/stats-href';
import { BATTING_COLUMNS, DEFAULT_SORT, PITCHING_COLUMNS, type StatsTab } from '@/lib/league-stats/columns';
import type { MyPlayer, StatsTeam } from '@/lib/league-stats/load';
import type { RankTable, StatsPlayer } from '@/lib/league-stats/ranks';
import { visiblePlayers, type ViewState } from '@/lib/league-stats/view';
import { FilterBar } from './FilterBar';
import { PlayerStatsTable } from './PlayerStatsTable';
import { SeasonSwitcher } from './SeasonSwitcher';
import { TeamStatsTable } from './TeamStatsTable';
import { YourRanksCard } from './YourRanksCard';

type PlayerTab = 'batting' | 'pitching';

const TABS: Array<{ id: StatsTab; label: string }> = [
  { id: 'batting', label: 'Batting' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'teams', label: 'Teams' },
];

const tabId = (t: StatsTab): string => `stats-tab-${t}`;
const PANEL_ID = 'stats-tabpanel';

const defaultSortFor = (tab: StatsTab) => DEFAULT_SORT[tab === 'pitching' ? 'pitching' : 'batting'];

export function LeagueStatsView({
  slug,
  season,
  seasons,
  leagueName,
  initialTab,
  players,
  ranks,
  teams,
  myPlayers,
  ourTeamId,
  mins,
  rankingEnabled,
  standingsRankEnabled,
}: {
  slug: string;
  season: string;
  /** All seasons with data, newest first, for the season switcher. */
  seasons: string[];
  leagueName: string;
  initialTab: StatsTab;
  players: StatsPlayer[];
  ranks: { batting: RankTable; pitching: RankTable } | null;
  teams: StatsTeam[];
  myPlayers: MyPlayer[];
  ourTeamId: string | null;
  mins: { paMin: number; ipOutsMin: number };
  rankingEnabled: boolean;
  standingsRankEnabled: boolean;
}): JSX.Element {
  const [tab, setTab] = useState<StatsTab>(initialTab);
  const [view, setView] = useState<ViewState>(() => ({
    teamId: 'all',
    query: '',
    qualifiedOnly: true,
    ...defaultSortFor(initialTab),
  }));
  const [selectedId, setSelectedId] = useState<string | null>(myPlayers[0]?.playerId ?? null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const tabRefs = useRef<Partial<Record<StatsTab, HTMLButtonElement | null>>>({});

  // Scroll after the render that cleared any filters hiding the target row.
  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollTarget(null);
  }, [scrollTarget]);

  const changeTab = (next: StatsTab): void => {
    if (next === tab) return;
    setTab(next);
    // A new tab starts at its default sort; team filter and search carry over.
    setView((v) => ({ ...v, ...defaultSortFor(next) }));
    // Rewrite the URL only: a router navigation would re-run the force-dynamic
    // server page (auth + every snapshot query) on each tap. Next 14.2 keeps
    // useSearchParams in sync with history.replaceState.
    window.history.replaceState(null, '', leagueStatsHref(slug, season, next));
  };

  // Arrow / Home / End move focus and selection between tabs (WAI-ARIA tabs pattern).
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    const id = TABS[next].id;
    changeTab(id);
    tabRefs.current[id]?.focus();
  };

  // "Show in table": clear a team filter or search that hides the row, then scroll.
  const showInTable = (rowId: string): void => {
    const p = players.find((x) => x.playerId === selectedId);
    if (tab !== 'teams' && p) {
      setView((v) => ({
        ...v,
        teamId: v.teamId === 'all' || v.teamId === p.teamId ? v.teamId : 'all',
        query: v.query.trim() === '' || p.name.toLowerCase().includes(v.query.trim().toLowerCase()) ? v.query : '',
      }));
    }
    setScrollTarget(rowId);
  };

  const onSort = (key: string, naturalDir: 'asc' | 'desc'): void =>
    setView((v) =>
      v.sortKey === key
        ? { ...v, sortDir: v.sortDir === 'asc' ? 'desc' : 'asc' }
        : { ...v, sortKey: key, sortDir: naturalDir },
    );

  const selectedTeamId = players.find((p) => p.playerId === selectedId)?.teamId ?? null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <a
          href={`/l/${slug}?season=${encodeURIComponent(season)}`}
          className="text-sm font-semibold text-app-fg-muted hover:text-app-fg hover:underline"
        >
          ← {leagueName}
        </a>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="display text-2xl font-bold md:text-3xl">League Stats</h1>
          <SeasonSwitcher slug={slug} season={season} seasons={seasons} tab={tab} />
        </div>
      </header>

      <YourRanksCard
        myPlayers={myPlayers}
        players={players}
        tab={tab}
        ranks={ranks}
        mins={mins}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onShowInTable={showInTable}
        teams={teams}
        rankingEnabled={rankingEnabled}
      />

      <div
        role="tablist"
        aria-label="Stats category"
        className="inline-flex rounded-lg border border-app-border bg-app-surface-2 p-0.5 text-sm"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            id={tabId(t.id)}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={PANEL_ID}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => changeTab(t.id)}
            onKeyDown={onTabKeyDown}
            className={`rounded-md px-3 py-1 font-semibold transition-colors ${
              tab === t.id ? 'bg-app-surface text-app-fg shadow-sm' : 'text-app-fg-muted hover:text-app-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(tab)}>
        {tab === 'teams' ? (
          teams.length === 0 ? (
            <p className="text-sm text-app-fg-subtle">No teams yet for this season.</p>
          ) : (
            <TeamStatsTable
              teams={teams}
              showRank={standingsRankEnabled}
              slug={slug}
              season={season}
              highlightTeamId={selectedTeamId}
              ourTeamId={ourTeamId}
            />
          )
        ) : (
          <PlayerTabPanel
            tab={tab}
            slug={slug}
            season={season}
            players={players}
            ranks={ranks ? ranks[tab] : null}
            teams={teams}
            view={view}
            setView={setView}
            onSort={onSort}
            selectedId={selectedId}
            rankingEnabled={rankingEnabled}
          />
        )}
      </div>
    </div>
  );
}

function PlayerTabPanel({
  tab,
  slug,
  season,
  players,
  ranks,
  teams,
  view,
  setView,
  onSort,
  selectedId,
  rankingEnabled,
}: {
  tab: PlayerTab;
  slug: string;
  season: string;
  players: StatsPlayer[];
  ranks: RankTable | null;
  teams: StatsTeam[];
  view: ViewState;
  setView: (update: (v: ViewState) => ViewState) => void;
  onSort: (key: string, naturalDir: 'asc' | 'desc') => void;
  selectedId: string | null;
  rankingEnabled: boolean;
}): JSX.Element {
  const hasAny = players.some((p) => (tab === 'batting' ? p.pa > 0 : p.ipOuts > 0));
  if (!hasAny) return <p className="text-sm text-app-fg-subtle">{`No ${tab} stats yet for this season.`}</p>;

  const rows = visiblePlayers(players, tab, view, ranks, selectedId);
  // Sorted by name: the rank columns keep showing the tab's default stat.
  const rankKey = view.sortKey === 'name' ? DEFAULT_SORT[tab].sortKey : view.sortKey;

  return (
    <div className="space-y-3">
      <FilterBar
        teams={teams}
        teamId={view.teamId}
        onTeamId={(teamId) => setView((v) => ({ ...v, teamId }))}
        query={view.query}
        onQuery={(query) => setView((v) => ({ ...v, query }))}
        qualifiedOnly={view.qualifiedOnly}
        onQualifiedOnly={(qualifiedOnly) => setView((v) => ({ ...v, qualifiedOnly }))}
        showQualified={rankingEnabled}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-app-fg-subtle">No players match these filters.</p>
      ) : (
        <PlayerStatsTable
          players={rows}
          caption={`${tab === 'batting' ? 'Batting' : 'Pitching'} stats`}
          columns={tab === 'batting' ? BATTING_COLUMNS : PITCHING_COLUMNS}
          ranks={ranks}
          rankKey={rankKey}
          sortKey={view.sortKey}
          sortDir={view.sortDir}
          onSort={onSort}
          highlightId={selectedId}
          slug={slug}
          season={season}
        />
      )}
    </div>
  );
}
