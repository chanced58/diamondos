import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState } from '@baseball/ui';
import type {
  AiHitterProfile,
  AiPitcherTendency,
  PersistedScoutingCard,
  ScoutingCardResponse,
  ScoutingHitterStats,
  ScoutingPitcherStats,
} from '@baseball/shared';
import {
  generateScoutingCard,
  scoutingCardQueryKey,
  useScoutingCard,
} from '../../../../../src/features/opponents/opponent-teams-api';
import { describeApiError } from '../../../../../src/lib/api-client';

/**
 * An opponent's AI scouting card (the web /games/opponents/[id]/card): the
 * dugout takeaway, team tendencies, their pitchers and hitters (with hot and
 * cold zones) and key matchups. Coaches generate or regenerate it from past
 * games against the team.
 */
export default function ScoutingCardScreen() {
  const { opponentTeamId = '' } = useLocalSearchParams<{ opponentTeamId: string }>();
  const query = useScoutingCard(opponentTeamId);
  const queryClient = useQueryClient();
  const generate = useMutation({
    mutationFn: () => generateScoutingCard(opponentTeamId),
    onSuccess: ({ card }) => {
      queryClient.setQueryData<ScoutingCardResponse>(scoutingCardQueryKey(opponentTeamId), (current) =>
        current ? { ...current, card } : current,
      );
    },
  });

  const name = query.data?.opponentTeam.name;
  const header = <Stack.Screen options={{ title: name ? `Scouting · ${name}` : 'Scouting card' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const { card, priorGames, opponentTeam } = query.data;
  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <Text className="text-sm text-gray-500 mb-3">
        {priorGames} prior {priorGames === 1 ? 'game' : 'games'} on record
      </Text>

      {priorGames === 0 ? (
        <View className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Text className="text-sm font-semibold text-amber-900 mb-1">No prior games on record</Text>
          <Text className="text-sm text-amber-900">
            The scouting card draws from your past games against {opponentTeam.name}. Once you've played them at least
            once, come back to generate it.
          </Text>
        </View>
      ) : (
        <>
          <Button
            label={generate.isPending ? 'Generating…' : card ? 'Regenerate card' : 'Generate card'}
            loading={generate.isPending}
            onPress={() => generate.mutate()}
          />
          {generate.isPending && (
            <Text className="text-xs text-gray-500 mt-2">Reading your games against them — this can take a minute.</Text>
          )}
          {generate.error && (
            <Text accessibilityRole="alert" className="text-sm text-red-700 mt-2">
              {describeApiError(generate.error)}
            </Text>
          )}
          {card && (
            <Text className="text-xs text-gray-500 mt-2">
              Last generated {new Date(card.generatedAt).toLocaleString()} · {card.gameSampleCount}{' '}
              {card.gameSampleCount === 1 ? 'game' : 'games'}
            </Text>
          )}
          {card && <CardBody card={card} />}
        </>
      )}
    </ScrollView>
  );
}

function CardBody({ card }: { card: PersistedScoutingCard }) {
  const { aiCard } = card;
  const hitterStats = new Map(card.hitterStats.map((h) => [h.opponentPlayerId, h]));

  return (
    <View className="mt-4 gap-3">
      <View className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Text className="text-xs font-semibold uppercase tracking-wide text-blue-900/70 mb-1">Dugout takeaway</Text>
        <Text className="text-sm font-medium text-blue-900">{aiCard.oneLineSummary}</Text>
      </View>

      {aiCard.teamTendencies.bullets.length > 0 && (
        <Section title="Team tendencies">
          {aiCard.teamTendencies.bullets.map((bullet, index) => (
            <Text key={index} className="text-sm text-gray-700 mb-1">
              • {bullet}
            </Text>
          ))}
        </Section>
      )}

      {aiCard.pitcherTendencies.length > 0 && (
        <Section title="Pitchers">
          {aiCard.pitcherTendencies.map((pitcher, index) => (
            <PitcherBlock key={pitcher.opponentPlayerId ?? `p-${index}`} ai={pitcher} stats={findPitcherStats(card.pitcherStats, pitcher)} />
          ))}
        </Section>
      )}

      {aiCard.hitterProfiles.length > 0 && (
        <Section title="Hitters">
          {aiCard.hitterProfiles.map((hitter) => (
            <HitterBlock key={hitter.opponentPlayerId} ai={hitter} stats={hitterStats.get(hitter.opponentPlayerId)} />
          ))}
        </Section>
      )}

      {aiCard.keyMatchups.length > 0 && (
        <Section title="Key matchups">
          {aiCard.keyMatchups.map((matchup, index) => (
            <View key={index} className="mb-3">
              <Text className="text-sm font-semibold text-gray-900">
                {matchup.ourLabel} <Text className="text-gray-400">vs</Text> {matchup.theirLabel}
              </Text>
              <Text className="text-sm text-gray-700">{matchup.note}</Text>
            </View>
          ))}
        </Section>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-xl border border-gray-200 bg-white p-4">
      <Text accessibilityRole="header" className="text-sm font-semibold text-gray-900 mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** By roster id when the card has one, else by name (the web card's rule). */
function findPitcherStats(all: ScoutingPitcherStats[], ai: AiPitcherTendency): ScoutingPitcherStats | undefined {
  if (ai.opponentPlayerId) return all.find((p) => p.opponentPlayerId === ai.opponentPlayerId);
  return all.find((p) => p.displayName.toLowerCase() === ai.displayName.toLowerCase());
}

function PitcherBlock({ ai, stats }: { ai: AiPitcherTendency; stats?: ScoutingPitcherStats }) {
  const line = stats
    ? [
        `${stats.pitches} pitches`,
        stats.avgVelocity != null ? `avg ${stats.avgVelocity.toFixed(1)} mph` : null,
        stats.firstPitchStrikePct != null ? `1st-pitch strike ${(stats.firstPitchStrikePct * 100).toFixed(0)}%` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <View className="border-l-4 border-gray-200 pl-3 mb-4">
      <Text className="text-sm font-semibold text-gray-900">{ai.displayName}</Text>
      {line && <Text className="text-xs text-gray-500">{line}</Text>}
      {stats && stats.pitchMix.length > 0 && (
        <Text className="text-xs text-gray-500">
          Mix: {stats.pitchMix.map((m) => `${m.pitchType} ${Math.round(m.percent)}%`).join(', ')}
        </Text>
      )}
      <Text className="text-sm text-gray-700 mt-1">
        <Text className="font-semibold">Approach. </Text>
        {ai.approach}
      </Text>
      <Text className="text-sm text-gray-700 mt-1">
        <Text className="font-semibold">How to attack. </Text>
        {ai.howToAttack}
      </Text>
    </View>
  );
}

function HitterBlock({ ai, stats }: { ai: AiHitterProfile; stats?: ScoutingHitterStats }) {
  const meta = [stats?.position, stats?.bats ? `bats ${stats.bats}` : null].filter(Boolean).join(' · ');
  return (
    <View className="border-l-4 border-gray-200 pl-3 mb-4">
      <Text className="text-sm font-semibold text-gray-900">
        {stats?.displayName ?? '(player)'}
        {meta ? <Text className="text-xs font-normal text-gray-400"> · {meta}</Text> : null}
      </Text>
      {stats && (
        <Text className="text-xs text-gray-500">
          {stats.avg}/{stats.obp}/{stats.slg} · OPS {stats.ops} · PA {stats.pa}
        </Text>
      )}
      <Text className="text-sm text-gray-700 mt-1">
        <Text className="font-semibold">Approach. </Text>
        {ai.approach}
      </Text>
      <Text className="text-sm text-gray-700 mt-1">
        <Text className="font-semibold">How to pitch them. </Text>
        {ai.howToPitchThem}
      </Text>
      <View className="flex-row gap-4 mt-2">
        <ZoneGrid label="Hot zones" cells={ai.hotZones} tone="hot" />
        <ZoneGrid label="Cold zones" cells={ai.coldZones} tone="cold" />
      </View>
      <Text className="text-xs text-gray-500 mt-2">
        Steal risk: {ai.stealRisk} · Bunt risk: {ai.buntRisk}
      </Text>
    </View>
  );
}

const ZONES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The 3×3 strike zone, 1 top-inside to 9 bottom-outside, with the card's zones filled. */
function ZoneGrid({ label, cells, tone }: { label: string; cells: number[]; tone: 'hot' | 'cold' }) {
  const active = new Set(cells);
  const fill = tone === 'hot' ? 'bg-red-400' : 'bg-blue-400';
  return (
    <View accessibilityLabel={`${label}: ${cells.length > 0 ? cells.join(', ') : 'none'}`}>
      <Text className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</Text>
      <View className="flex-row flex-wrap border border-gray-300" style={{ width: 62, height: 62, padding: 1, gap: 1 }}>
        {ZONES.map((zone) => (
          <View key={zone} style={{ width: 19, height: 19 }} className={active.has(zone) ? fill : 'bg-gray-100'} />
        ))}
      </View>
    </View>
  );
}
