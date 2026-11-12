import { Text, TouchableOpacity, View } from 'react-native';
import { Badge, Button } from '@baseball/ui';
import { formatDate, type DashboardAnnouncement, type DashboardLiveGame, type DashboardNextGame, type DashboardRecentGame, type DashboardUpcomingItem } from '@baseball/shared';
import { useScopeTheme } from '../../theme/ThemeScope';
import { eventScreen, gameScreen, practiceScreen, useOpenInTab, type TabScreen } from '../../navigation/open-in-tab';
import { dayParts, liveSituation, matchup, nextGameWhen, result, upcomingDetail } from './dashboard-format';

/**
 * The Home tab's dashboard sections, mirroring the web dashboard's cards. Items
 * of another league team (in the league view) are shown but not opened: their
 * game pages belong to that team.
 *
 * Everything here opens in another tab's stack, so it goes through
 * `useOpenInTab` (see open-in-tab.ts), which leaves that tab's list beneath
 * the screen instead of making the screen the stack's only route.
 */

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
  const openInTab = useOpenInTab();
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
      onPress={() => openInTab(gameScreen(game.id, 'live'))}
    >
      {body}
    </TouchableOpacity>
  );
}

/** The "Next up" card: the soonest scheduled game, opened for the team's own, with Set lineup for coaches. */
export function NextUpCard({ game, activeTeamId, isCoach }: { game: DashboardNextGame | null; activeTeamId: string; isCoach: boolean }) {
  // Translucent white on the Light navy card is 6:1+; on the brighter Dark and
  // Dugout brand blue it drops to ~3:1, so the secondary lines go opaque there.
  const light = useScopeTheme() === 'light';
  const openInTab = useOpenInTab();
  const eyebrow = light ? 'text-white/70' : 'text-white';
  const detail = light ? 'text-white/75' : 'text-white';
  if (!game) {
    return (
      <View className="bg-brand-700 rounded-xl p-5 mb-3">
        <Text className={`text-xs font-bold ${eyebrow} tracking-wide`}>NEXT UP</Text>
        <Text className="text-2xl font-bold text-white mt-1">Nothing scheduled</Text>
        <Text className={`text-sm ${detail} mt-1`}>Games in the next four weeks show up here.</Text>
      </View>
    );
  }
  const own = game.teamId === activeTeamId;
  return (
    <View className="bg-brand-700 rounded-xl p-5 mb-3">
      <Text className={`text-xs font-bold ${eyebrow} tracking-wide`}>NEXT UP</Text>
      <Text className="text-2xl font-bold text-white mt-1">{matchup(game.isHome, game.opponentName)}</Text>
      <Text className={`text-sm ${detail} mt-1`}>
        {nextGameWhen(game.scheduledAt, game.timeZone)}
        {game.venueName ? ` · ${game.venueName}` : ''}
      </Text>
      {own && (
        <View className="flex-row gap-2 mt-4">
          <View className="flex-1">
            <Button label="Open game" variant="secondary" onPress={() => openInTab(gameScreen(game.id))} />
          </View>
          {isCoach && (
            <View className="flex-1">
              <Button
                label="Set lineup"
                variant="secondary"
                onPress={() => openInTab(gameScreen(game.id, 'lineup'))}
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
export function upcomingScreen(item: DashboardUpcomingItem, activeTeamId: string): TabScreen | null {
  if (item.teamId !== activeTeamId) return null;
  if (item.kind === 'game') return gameScreen(item.id);
  if (item.kind === 'practice') return practiceScreen(item.id);
  return eventScreen(item.id);
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
  const openInTab = useOpenInTab();
  if (items.length === 0) return <Text className="px-4 py-3 text-sm text-gray-500">{emptyText}</Text>;
  return (
    <>
      {items.map((item) => {
        const badge = KIND_BADGES[item.kind];
        const target = upcomingScreen(item, activeTeamId);
        return (
          <DatedRow
            key={`${item.kind}-${item.id}`}
            date={item.date}
            timeZone={item.timeZone}
            title={item.label}
            detail={upcomingDetail(item.date, item.timeZone, item.kind === 'event' ? null : item.sublabel)}
            right={<Badge label={item.kind === 'event' ? (item.sublabel ?? badge.label) : badge.label} variant={badge.variant} />}
            onPress={target ? () => openInTab(target) : null}
          />
        );
      })}
    </>
  );
}

const RESULT_VARIANTS = { W: 'safe', L: 'danger', T: 'default' } as const;

/** Completed games, newest first, with the score from our side. */
export function RecentGamesList({ games, activeTeamId }: { games: DashboardRecentGame[]; activeTeamId: string }) {
  const openInTab = useOpenInTab();
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
            onPress={game.teamId === activeTeamId ? () => openInTab(gameScreen(game.id)) : null}
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
