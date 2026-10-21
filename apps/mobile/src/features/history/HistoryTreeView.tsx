import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AtBatNode,
  EventCategory,
  GameEvent,
  GameHistoryTree,
  HalfInningNode,
  HistoryEventNode,
} from '@baseball/shared';
import { isCorrectable } from './history-model';

const CATEGORY_TEXT: Record<EventCategory, string> = {
  positive: 'text-emerald-700',
  negative: 'text-red-700',
  neutral: 'text-gray-700',
  info: 'text-blue-700',
};

export type SelectEvent = (event: GameEvent, label: string) => void;

interface HistoryTreeViewProps {
  tree: GameHistoryTree;
  /** Score read from our side. */
  ourScore: (home: number, away: number) => string;
  /** Set for coaches: tapping an event opens its correction. */
  onSelect?: SelectEvent;
}

function EventRow({ node, onSelect, prefix }: { node: HistoryEventNode; onSelect?: SelectEvent; prefix?: string }) {
  const tappable = Boolean(onSelect) && isCorrectable(node.event);
  const body = (
    <View className="flex-row items-center py-1.5">
      {prefix && <Text className="text-xs text-gray-400 w-14">{prefix}</Text>}
      <Text className={`flex-1 text-sm ${CATEGORY_TEXT[node.category]}`}>{node.label}</Text>
      {tappable && <Ionicons name="create-outline" size={16} color="#9ca3af" />}
    </View>
  );
  if (!tappable || !onSelect) return body;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Correct: ${node.label}`} onPress={() => onSelect(node.event, node.label)}>
      {body}
    </TouchableOpacity>
  );
}

function AtBatCard({ atBat, onSelect }: { atBat: AtBatNode; onSelect?: SelectEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetail = atBat.pitches.length > 0 || atBat.midAtBatEvents.length > 0;

  return (
    <View className="bg-white border border-gray-200 rounded-xl px-3 py-2 mb-2">
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        disabled={!hasDetail}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center"
      >
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900">
            {atBat.number}. {atBat.batterName}
          </Text>
          <Text className="text-xs text-gray-500">
            vs {atBat.pitcherName} · {atBat.pitches.length} {atBat.pitches.length === 1 ? 'pitch' : 'pitches'}
          </Text>
        </View>
        {hasDetail && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />}
      </TouchableOpacity>

      {open && (
        <View className="mt-1 border-t border-gray-100 pt-1">
          {atBat.pitches.map((pitch) => (
            <EventRow key={pitch.event.id} node={pitch} onSelect={onSelect} prefix={`${pitch.pitchNumber} · ${pitch.countBefore}`} />
          ))}
          {atBat.midAtBatEvents.map((node) => (
            <EventRow key={node.event.id} node={node} onSelect={onSelect} />
          ))}
        </View>
      )}

      {atBat.result ? (
        <View className={open ? 'border-t border-gray-100 mt-1' : ''}>
          <EventRow node={atBat.result} onSelect={onSelect} />
        </View>
      ) : (
        <Text className="text-xs text-gray-400 italic py-1.5">At bat</Text>
      )}
    </View>
  );
}

function HalfInning({ half, ourScore, onSelect }: { half: HalfInningNode; ourScore: HistoryTreeViewProps['ourScore']; onSelect?: SelectEvent }) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">{half.label}</Text>
        <Text className="text-xs text-gray-500">{ourScore(half.homeScore, half.awayScore)}</Text>
      </View>
      {half.items.map((item) =>
        item.type === 'at-bat' ? (
          <AtBatCard key={`ab-${item.number}-${item.result?.event.id ?? item.pitches[0]?.event.id ?? ''}`} atBat={item} onSelect={onSelect} />
        ) : (
          <View key={item.event.id} className="px-3 mb-2">
            <EventRow node={item} onSelect={onSelect} />
          </View>
        ),
      )}
      {half.items.length === 0 && <Text className="text-xs text-gray-400 px-1">No plays.</Text>}
    </View>
  );
}

/** Innings, half-innings and plate appearances, in the order they happened. */
export function HistoryTreeView({ tree, ourScore, onSelect }: HistoryTreeViewProps) {
  const { innings } = tree;
  return (
    <View>
      {innings.map((inning) => (
        <View key={inning.number} className="mb-2">
          <Text accessibilityRole="header" className="text-base font-bold text-gray-900 mb-2">
            Inning {inning.number}
          </Text>
          {inning.top && <HalfInning half={inning.top} ourScore={ourScore} onSelect={onSelect} />}
          {inning.bottom && <HalfInning half={inning.bottom} ourScore={ourScore} onSelect={onSelect} />}
        </View>
      ))}
      {innings.length === 0 && <Text className="text-sm text-gray-500 text-center mt-6">No plays recorded yet.</Text>}
      {tree.gameEndEvent && (
        <Text className="text-sm font-semibold text-gray-700 px-1 mt-1">{tree.gameEndEvent.label}</Text>
      )}
    </View>
  );
}
