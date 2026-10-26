import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Badge, EmptyState, ErrorState, SectionHeader, SegmentedControl } from '@baseball/ui';
import { LEADER_TABS, type LeaderTab, type LeagueHomeResponse, type LeagueHomeStandingRow, type LeagueLeaderBoard } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { StatTable } from '../../../../src/features/stats/StatTable';
import { useLeagueHome } from '../../../../src/features/league/league-home-api';
import { HOME_STANDINGS_COLUMNS, updatedLabel } from '../../../../src/features/league/league-home-model';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';

const TAB_OPTIONS: ReadonlyArray<{ value: LeaderTab; label: string }> = [
  { value: 'batting', label: 'Batting' },
  { value: 'pitching', label: 'Pitching' },
  { value: 'team', label: 'Team' },
  { value: 'special', label: 'Special' },
];

/**
 * The league home (the web /l/:slug page) as a signed-in viewer sees it: the
 * sections the league shows, in its order — the hero with the season switch,
 * standings (league and per division), spotlights, League Leaders by tab, and
 * recent and upcoming games. A team name opens its stat page.
 */
export default function LeagueHomeScreen() {
  const { slug = '', season: seasonParam } = useLocalSearchParams<{ slug: string; season?: string }>();
  const { activeTeam } = useRole();
  const [season, setSeason] = useState<string | undefined>(seasonParam || undefined);
  const query = useLeagueHome(slug, season, activeTeam?.teamId);

  const header = <Stack.Screen options={{ title: query.data?.league.name ?? 'League home' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const notFound = isApiError(query.error) && query.error.kind === 'not_found';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {notFound ? (
          <EmptyState title="League not found" message="This league's home page isn't available." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const home = query.data;
  const openTeam = (teamId: string | null) => {
    if (!teamId) return;
    router.push({ pathname: '/(tabs)/more/league/team/[teamId]', params: { teamId, slug, season: home.season } });
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      {query.isRefetchError && (
        <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <Text accessibilityRole="alert" className="text-sm text-red-700">
            Couldn't refresh: {describeApiError(query.error)}
          </Text>
        </View>
      )}
      {home.sections.map((section) => {
        switch (section) {
          case 'hero':
            return <Hero key="hero" home={home} selectedSeason={season ?? home.season} onSeason={setSeason} />;
          case 'standings':
            return <Standings key="standings" home={home} onTeam={openTeam} />;
          case 'spotlights':
            return <Spotlights key="spotlights" home={home} onTeam={openTeam} />;
          case 'leaders':
            return <Leaders key="leaders" leaders={home.leaders} onTeam={openTeam} />;
          case 'recent':
            return <AroundTheLeague key="recent" home={home} onTeam={openTeam} />;
          default:
            return null;
        }
      })}
    </ScrollView>
  );
}

/** The league's name, its counters, when stats were last updated, and the season switch (showing the one picked while it loads). */
function Hero({ home, selectedSeason, onSeason }: { home: LeagueHomeResponse; selectedSeason: string; onSeason: (season: string) => void }) {
  const updated = updatedLabel(home.updatedAt);
  return (
    <View className="bg-brand-700 px-4 pt-5 pb-4">
      <Text className="text-2xl font-bold text-white">{home.league.name}</Text>
      <Text className="text-sm text-white/80 mt-1">
        {home.counters.teams} teams · {home.counters.games} games{home.season ? ` · ${home.season}` : ''}
      </Text>
      {updated && <Text className="text-xs text-white/60 mt-1">{updated}</Text>}
      {home.seasons.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerStyle={{ gap: 8 }}>
          {home.seasons.map((s) => {
            const active = s === selectedSeason;
            return (
              <TouchableOpacity
                key={s}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSeason(s)}
                className={`rounded-full px-3 py-1.5 ${active ? 'bg-white' : 'bg-white/20'}`}
              >
                <Text className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-white'}`}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** One standings table; a platform team's name opens its page. */
function StandingsTable({ rows, onTeam }: { rows: LeagueHomeStandingRow[]; onTeam: (teamId: string | null) => void }) {
  return (
    <StatTable
      rows={rows}
      rowKey={(row) => row.teamId ?? `opp-${row.name}`}
      rowLabel={(row) => row.name}
      labelHeader="Team"
      labelWidth={150}
      columns={HOME_STANDINGS_COLUMNS}
      onPressRow={(row) => onTeam(row.teamId)}
      // A league opponent (no platform team) has no page.
      isRowPressable={(row) => row.teamId !== null}
      emptyText="No standings yet this season."
    />
  );
}

/** The league table, then each division's, as on the web page. */
function Standings({ home, onTeam }: { home: LeagueHomeResponse; onTeam: (teamId: string | null) => void }) {
  return (
    <View className="mt-2">
      <View className="px-4">
        <SectionHeader title={home.divisions.length > 0 ? 'Standings · League' : 'Standings'} />
      </View>
      <StandingsTable rows={home.standings} onTeam={onTeam} />
      {home.divisions.map((division) => (
        <View key={division.id} className="mt-2">
          <View className="px-4">
            <SectionHeader title={division.name} />
          </View>
          <StandingsTable rows={division.rows} onTeam={onTeam} />
        </View>
      ))}
    </View>
  );
}

/** Player of the Week and Hot Team cards. */
function Spotlights({ home, onTeam }: { home: LeagueHomeResponse; onTeam: (teamId: string | null) => void }) {
  if (home.spotlights.length === 0) return null;
  return (
    <View className="px-4 mt-2">
      <SectionHeader title="Spotlights" />
      {home.spotlights.map((s, index) => {
        const isPlayer = s.kind === 'player';
        const teamId = isPlayer ? s.teamId : s.subjectTeamId;
        return (
          <TouchableOpacity
            key={`${s.kind}-${index}`}
            accessibilityRole={teamId ? 'button' : undefined}
            disabled={!teamId}
            onPress={() => onTeam(teamId)}
            className={`rounded-xl border p-4 mb-2 ${isPlayer ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}
          >
            <Text className={`text-xs font-bold tracking-wide ${isPlayer ? 'text-amber-800' : 'text-green-800'}`}>
              {isPlayer ? 'PLAYER OF THE WEEK' : 'HOT TEAM'}
            </Text>
            <Text className="text-lg font-bold text-gray-900 mt-0.5">{s.subjectName}</Text>
            {s.teamName && <Text className="text-sm text-gray-600">{s.teamName}</Text>}
            {s.blurb ? <Text className="text-sm text-gray-800 mt-1">{s.blurb}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** League Leaders: Batting, Pitching, Team and Special tabs, each a list of boards. */
function Leaders({ leaders, onTeam }: { leaders: LeagueHomeResponse['leaders']; onTeam: (teamId: string | null) => void }) {
  const firstWithBoards = LEADER_TABS.find((tab) => leaders[tab].length > 0) ?? 'batting';
  const [tab, setTab] = useState<LeaderTab>(firstWithBoards);
  const boards = leaders[tab];
  return (
    <View className="px-4 mt-2">
      <SectionHeader title="League leaders" />
      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} testID="leader-tabs" />
      {boards.length === 0 ? (
        <Text className="text-sm text-gray-500 mt-3">No leaders here yet.</Text>
      ) : (
        boards.map((board) => <LeaderBoard key={`${board.key}-${board.label}`} board={board} onTeam={onTeam} />)
      )}
    </View>
  );
}

/** One leaderboard: rank, name (and team), value; the viewer's own rows tinted. */
function LeaderBoard({ board, onTeam }: { board: LeagueLeaderBoard; onTeam: (teamId: string | null) => void }) {
  return (
    <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-3">
      <Text className="text-sm font-semibold text-gray-900 px-4 py-2.5 border-b border-gray-100">{board.label}</Text>
      {board.rows.length === 0 ? (
        <Text className="text-sm text-gray-500 px-4 py-3">No qualified leaders yet.</Text>
      ) : (
        board.rows.map((row) => (
          <TouchableOpacity
            key={row.id}
            accessibilityRole={row.teamId ? 'button' : undefined}
            disabled={!row.teamId}
            onPress={() => onTeam(row.teamId)}
            className={`flex-row items-center px-4 py-2.5 border-t border-gray-100 ${row.ours ? 'bg-blue-50' : 'bg-white'}`}
          >
            <Text className="w-7 text-sm font-semibold text-gray-500">{row.rank}</Text>
            <View className="flex-1 mr-2">
              <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
                {row.name}
              </Text>
              {row.teamName && (
                <Text className="text-xs text-gray-500" numberOfLines={1}>
                  {row.teamName}
                </Text>
              )}
            </View>
            <Text className="text-sm font-bold text-gray-900">{row.display}</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

/** Recent results and upcoming games across the league. */
function AroundTheLeague({ home, onTeam }: { home: LeagueHomeResponse; onTeam: (teamId: string | null) => void }) {
  return (
    <View className="px-4 mt-2">
      <SectionHeader title="Around the league" />
      {home.recent.length === 0 && home.upcoming.length === 0 && <Text className="text-sm text-gray-500">No games yet this season.</Text>}
      {home.recent.map((g) => (
        <TouchableOpacity
          key={g.id}
          accessibilityRole="button"
          onPress={() => onTeam(g.teamId)}
          className="flex-row items-center bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-2"
        >
          <View className="flex-1 mr-2">
            <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
              {g.teamName} vs {g.opponent ?? 'TBD'}
            </Text>
          </View>
          <Text className="text-sm font-bold text-gray-900 mr-2">
            {g.ourScore}–{g.theirScore}
          </Text>
          <Badge label={g.result} variant={g.result === 'W' ? 'safe' : g.result === 'L' ? 'danger' : 'default'} />
        </TouchableOpacity>
      ))}
      {home.upcoming.length > 0 && (
        <>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1">Upcoming</Text>
          {home.upcoming.map((u) => (
            <Text key={u.id} className="text-sm text-gray-700 py-1">
              {u.label}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}
