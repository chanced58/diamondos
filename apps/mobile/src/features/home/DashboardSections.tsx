import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Button } from '@baseball/ui';
import { formatDate, type DashboardAnnouncement, type DashboardLiveGame, type DashboardNextGame, type DashboardRecentGame, type DashboardUpcomingItem } from '@baseball/shared';
import { dayParts, liveSituation, matchup, nextGameWhen, result, upcomingDetail } from './dashboard-format';

/**
 * The Home tab's dashboard sections, mirroring the web dashboard's cards. Items
 * of another league team (in the league view) are shown but not opened: their
 * game pages belong to that team.
 */

const openGame = (gameId: string) => router.push({ pathname: '/(tabs)/schedule/games/[gameId]', params: { gameId } });

/** A white card with a title row and an optional action on the right. */
export function DashboardCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-3">
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
        <Text className="text-base font-semibold text-gray-900">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/** A live game from the server: the score and situation, opening the live viewer for the team's own games. */
export function LiveGameRow({ game, activeTeamId }: { game: DashboardLiveGame; activeTeamId: string }) {
  const own = game.teamId === activeTeamId;
  const body = (
    <>
      <View className="flex-row items-center mb-1.5">
        <View className="w-2 h-2 rounded-full bg-red-500 mr-2" />
        <Text className="text-[11px] font-bold text-red-700 tracking-wide">LIVE{own ? '' : ` · ${game.teamName.toUpperCase()}`}</Text>
      </View>
      <Text className="text-lg font-semibold text-gray-900">{matchup(game.isHome, game.opponentName)}</Text>
      <Text className="text-gray-500 text-sm mt-0.5">
        <Text className="font-semibold text-gray-900">
          {game.ourScore}–{game.theirScore}
        </Text>
        {'  ·  '}
        {liveSituation(game)}
      </Text>
    </>
  );
  const className = 'bg-white rounded-xl border-2 border-red-200 p-5 mb-3';
  if (!own) return <View className={className}>{body}</View>;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Live: ${matchup(game.isHome, game.opponentName)}, ${game.ourScore} to ${game.theirScore}. Follow live.`}
      className={className}
      onPress={() => router.push({ pathname: '/(tabs)/schedule/games/[gameId]/live', params: { gameId: game.id } })}
    >
      {body}
    </TouchableOpacity>
  );
}

/** The "Next up" card: the soonest scheduled game, opened for the team's own, with Set lineup for coaches. */
export function NextUpCard({ game, activeTeamId, isCoach }: { game: DashboardNextGame | null; activeTeamId: string; isCoach: boolean }) {
  if (!game) {
    return (
      <View className="bg-brand-700 rounded-xl p-5 mb-3">
        <Text className="text-xs font-bold text-white/70 tracking-wide">NEXT UP</Text>
        <Text className="text-2xl font-bold text-white mt-1">Nothing scheduled</Text>
        <Text className="text-sm text-white/75 mt-1">Games in the next four weeks show up here.</Text>
      </View>
    );
  }
  const own = game.teamId === activeTeamId;
  return (
    <View className="bg-brand-700 rounded-xl p-5 mb-3">
      <Text className="text-xs font-bold text-white/70 tracking-wide">NEXT UP</Text>
      <Text className="text-2xl font-bold text-white mt-1">{matchup(game.isHome, game.opponentName)}</Text>
      <Text className="text-sm text-white/75 mt-1">
        {nextGameWhen(game.scheduledAt, game.timeZone)}
        {game.venueName ? ` · ${game.venueName}` : ''}
      </Text>
      {own && (
        <View className="flex-row gap-2 mt-4">
          <View className="flex-1">
            <Button label="Open game" variant="secondary" onPress={() => openGame(game.id)} />
          </View>
          {isCoach && (
            <View className="flex-1">
              <Button
                label="Set lineup"
                variant="secondary"
                onPress={() => router.push({ pathname: '/(tabs)/schedule/games/[gameId]/lineup', params: { gameId: game.id } })}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** A small stat tile: label, big value, detail. */
export function StatTile({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'up' | 'down' }) {
  const valueColor = tone === 'down' ? 'text-red-700' : tone === 'up' ? 'text-green-700' : 'text-gray-900';
  return (
    <View className="flex-1 bg-white rounded-xl border border-gray-200 p-4">
      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</Text>
      <Text className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">{detail}</Text>
    </View>
  );
}

const KIND_BADGES = { game: { label: 'Game', variant: 'default' }, practice: { label: 'Practice', variant: 'safe' }, event: { label: 'Event', variant: 'warning' } } as const;

/** Where an upcoming item opens, or null for another team's game. */
function openUpcoming(item: DashboardUpcomingItem, activeTeamId: string): (() => void) | null {
  if (item.teamId !== activeTeamId) return null;
  if (item.kind === 'game') return () => openGame(item.id);
  if (item.kind === 'practice') return () => router.push({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: item.id } });
  return () => router.push({ pathname: '/(tabs)/schedule/events/[eventId]', params: { eventId: item.id } });
}

/** A dated row: the month and day in a column, then the text, then a trailing element. */
function DatedRow({
  date,
  timeZone,
  title,
  detail,
  right,
  onPress,
}: {
  date: string;
  timeZone: string | null;
  title: string;
  detail: string;
  right: React.ReactNode;
  onPress: (() => void) | null;
}) {
  const { month, day } = dayParts(date, timeZone);
  const content = (
    <>
      <View className="w-11 items-center mr-3">
        <Text className="text-[10px] font-bold text-gray-500">{month}</Text>
        <Text className="text-xl font-bold text-gray-900">{day}</Text>
      </View>
      <View className="flex-1 mr-2">
        <Text className="text-[15px] font-semibold text-gray-900">{title}</Text>
        <Text className="text-xs text-gray-500 mt-0.5">{detail}</Text>
      </View>
      {right}
    </>
  );
  const className = 'flex-row items-center px-4 py-3 border-t border-gray-100';
  if (!onPress) return <View className={className}>{content}</View>;
  return (
    <TouchableOpacity accessibilityRole="button" className={className} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}

/** Upcoming items in the next four weeks, or a line saying there are none. */
export function UpcomingList({ items, activeTeamId, emptyText }: { items: DashboardUpcomingItem[]; activeTeamId: string; emptyText: string }) {
  if (items.length === 0) return <Text className="px-4 py-3 text-sm text-gray-500">{emptyText}</Text>;
  return (
    <>
      {items.map((item) => {
        const badge = KIND_BADGES[item.kind];
        return (
          <DatedRow
            key={`${item.kind}-${item.id}`}
            date={item.date}
            timeZone={item.timeZone}
            title={item.label}
            detail={upcomingDetail(item.date, item.timeZone, item.kind === 'event' ? null : item.sublabel)}
            right={<Badge label={item.kind === 'event' ? (item.sublabel ?? badge.label) : badge.label} variant={badge.variant} />}
            onPress={openUpcoming(item, activeTeamId)}
          />
        );
      })}
    </>
  );
}

const RESULT_VARIANTS = { W: 'safe', L: 'danger', T: 'default' } as const;

/** Completed games, newest first, with the score from our side. */
export function RecentGamesList({ games, activeTeamId }: { games: DashboardRecentGame[]; activeTeamId: string }) {
  if (games.length === 0) return <Text className="px-4 py-3 text-sm text-gray-500">No completed games yet.</Text>;
  return (
    <>
      {games.map((game) => {
        const outcome = result(game.ourScore, game.theirScore);
        return (
          <DatedRow
            key={game.id}
            date={game.date}
            timeZone={game.timeZone}
            title={matchup(game.isHome, game.opponent)}
            detail={game.teamId === activeTeamId ? 'Box score' : 'Final'}
            right={
              <View className="flex-row items-center gap-2">
                <Text className="text-[15px] font-bold text-gray-900">
                  {game.ourScore}–{game.theirScore}
                </Text>
                <Badge label={outcome} variant={RESULT_VARIANTS[outcome]} />
              </View>
            }
            onPress={game.teamId === activeTeamId ? () => openGame(game.id) : null}
          />
        );
      })}
    </>
  );
}

/** The latest announcements, two lines each. */
export function AnnouncementList({ announcements }: { announcements: DashboardAnnouncement[] }) {
  if (announcements.length === 0) return <Text className="px-4 py-3 text-sm text-gray-500">No recent announcements.</Text>;
  return (
    <>
      {announcements.map((a) => (
        <View key={a.id} className="px-4 py-3 border-t border-gray-100">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs font-bold text-gray-900">{a.senderName}</Text>
            <Text className="text-[11px] text-gray-400">{formatDate(a.createdAt)}</Text>
          </View>
          <Text className="text-sm text-gray-600" numberOfLines={2}>
            {a.body}
          </Text>
        </View>
      ))}
    </>
  );
}

/** A small text action in a card's title row. */
export function CardAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" hitSlop={8} onPress={onPress}>
      <Text className="text-sm font-semibold text-brand-700">{label}</Text>
    </TouchableOpacity>
  );
}
