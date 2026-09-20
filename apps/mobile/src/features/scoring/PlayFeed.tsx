import { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import type { PlayFeedRow } from './use-play-feed';

type FeedItem =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; row: PlayFeedRow };

// Matches ScoreBoard.tsx's "Top N" / "Bot N" convention so the feed's
// half-inning headers read the same as the scoreboard above it.
function halfLabel(inning: number, isTopOfInning: boolean): string {
  return isTopOfInning ? `Top ${inning}` : `Bot ${inning}`;
}

/**
 * Groups newest-first rows into their half-inning headers for the FlatList.
 * `rows` is already newest-first, so a header is inserted whenever the
 * (inning, isTopOfInning) pair changes from the previous row.
 *
 * Headers are keyed by their ordinal position in the emitted items list to
 * ensure uniqueness even when the same half-inning appears non-contiguously
 * (e.g., a coach reverts and resumes a half-inning). Row items key on
 * `eventId` to maintain identity across updates.
 */
export function toFeedItems(rows: PlayFeedRow[]): FeedItem[] {
  const items: FeedItem[] = [];
  let lastHalf: string | null = null;
  for (const row of rows) {
    const half = `${row.inning}-${row.isTopOfInning}`;
    if (half !== lastHalf) {
      items.push({ kind: 'header', key: `header-${items.length}`, label: halfLabel(row.inning, row.isTopOfInning) });
      lastHalf = half;
    }
    items.push({ kind: 'row', key: row.eventId, row });
  }
  return items;
}

/**
 * Play-by-play feed for the read pane, below the batting order. Newest play
 * first, grouped under half-inning headers. Voided plays render struck
 * through and dimmed rather than removed — the coach needs to see that a
 * correction happened, not just its result. A reverted span (from Undo)
 * instead renders as a dimmed, italic, centered marker row — it means "this
 * never happened" rather than "this happened and was corrected," so it
 * never gets the strikethrough treatment.
 *
 * Long-pressing any actionable row confirms, then calls `onVoid(row.eventId)`
 * — the coach can correct a play from anywhere in the game, not only the
 * most recent one. Already-voided rows and correction-marker rows (reverted
 * spans have no single play to target) are not actionable: no long-press
 * handler, so there is no way to void something twice.
 *
 * Rendered in BookPane's `footer` slot — a sibling of that pane's
 * ScrollView, not a child of it. A VirtualizedList nested inside a
 * same-orientation ScrollView is invalid: windowing breaks, the two fight
 * over gestures, and React Native logs an error on every render. The
 * bounded height below keeps the feed a fixed band at the bottom of the
 * book rather than flex-filling it.
 */
export function PlayFeed({
  rows,
  onVoid,
}: {
  rows: PlayFeedRow[];
  onVoid?: (eventId: string) => void;
}) {
  const items = useMemo(() => toFeedItems(rows), [rows]);

  function confirmVoid(row: PlayFeedRow) {
    if (!onVoid || row.isVoided || row.isCorrectionMarker) return;
    Alert.alert(
      'Void this play?',
      `"${row.description}" will be struck from the book. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Void', style: 'destructive', onPress: () => onVoid(row.eventId) },
      ],
    );
  }

  if (rows.length === 0) {
    return (
      <View className="px-4 py-3 border-t border-gray-100">
        <Text className="text-[11px] font-semibold text-gray-500 mb-1">PLAY-BY-PLAY</Text>
        <Text className="text-xs text-gray-400">No plays recorded yet.</Text>
      </View>
    );
  }

  return (
    <View className="border-t border-gray-100" style={{ height: 260 }}>
      <Text className="px-4 pt-2 pb-1 text-[11px] font-semibold text-gray-500">PLAY-BY-PLAY</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <Text className="text-[10px] font-bold text-gray-400 mt-2 mb-0.5">
              {item.label}
            </Text>
          ) : (
            <TouchableOpacity
              className="flex-row items-center py-0.5"
              activeOpacity={item.row.isVoided || item.row.isCorrectionMarker ? 1 : 0.5}
              disabled={!onVoid || item.row.isVoided || item.row.isCorrectionMarker}
              onLongPress={() => confirmVoid(item.row)}
            >
              <Text
                className={`flex-1 text-[13px] ${
                  item.row.isCorrectionMarker
                    ? 'text-gray-400 italic text-center'
                    : item.row.isVoided
                      ? 'text-gray-400 line-through'
                      : 'text-gray-800'
                }`}
                numberOfLines={1}
              >
                {item.row.description}
              </Text>
            </TouchableOpacity>
          )
        }
      />
    </View>
  );
}
