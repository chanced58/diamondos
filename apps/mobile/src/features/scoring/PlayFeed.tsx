import { useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Modal } from 'react-native';
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
 * Headers are keyed by the eventId of the first row in that group, prefixed
 * to avoid collision with row keys. This ensures stable identity under the
 * feed's prepend-only update pattern: when a new play is added to the
 * topmost group, only that group's header receives a new key; all downstream
 * headers retain their identity indefinitely, as their first-row-below remains
 * unchanged. Non-contiguous half-inning groups (e.g., coach reverts and
 * resumes an inning) still generate distinct headers because the first row
 * under each group is unique.
 *
 * Row items key on `eventId` to maintain identity across updates. Header keys
 * are namespaced with `header-` prefix to remain distinct from row keys.
 */
export function toFeedItems(rows: PlayFeedRow[]): FeedItem[] {
  const items: FeedItem[] = [];
  let lastHalf: string | null = null;
  for (const row of rows) {
    const half = `${row.inning}-${row.isTopOfInning}`;
    if (half !== lastHalf) {
      items.push({ kind: 'header', key: `header-${row.eventId}`, label: halfLabel(row.inning, row.isTopOfInning) });
      lastHalf = half;
    }
    items.push({ kind: 'row', key: row.eventId, row });
  }
  return items;
}

/**
 * Play-by-play feed: newest play first, grouped under half-inning headers.
 * Voided plays render struck through and dimmed rather than removed — the
 * coach needs to see that a correction happened, not just its result. A
 * reverted span (from Undo) instead renders as a dimmed, italic, centered
 * marker row — it means "this never happened" rather than "this happened and
 * was corrected," so it never gets the strikethrough treatment.
 *
 * Long-pressing any actionable row confirms, then calls `onVoid(row.eventId)`
 * — the coach can correct a play from anywhere in the game, not only the
 * most recent one. Already-voided rows and correction-marker rows (reverted
 * spans have no single play to target) are not actionable: no long-press
 * handler, so there is no way to void something twice.
 *
 * Fills its parent. It lives on its own page (`PlayFeedSheet`) rather than
 * as a band in the scorebook, so it never competes with the bases and
 * batter for room and can show the whole game at a readable size.
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
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-score-sm text-gray-400">No plays recorded yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="play-feed"
      data={items}
      keyExtractor={(item) => item.key}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      renderItem={({ item }) =>
        item.kind === 'header' ? (
          <Text className="text-score-xs font-bold text-gray-500 uppercase mt-4 mb-1 pb-1 border-b border-gray-100">
            {item.label}
          </Text>
        ) : (
          <TouchableOpacity
            className="flex-row items-center py-2 border-b border-gray-50"
            activeOpacity={item.row.isVoided || item.row.isCorrectionMarker ? 1 : 0.5}
            disabled={!onVoid || item.row.isVoided || item.row.isCorrectionMarker}
            onLongPress={() => confirmVoid(item.row)}
          >
            <Text
              className={`flex-1 text-score-15px ${
                item.row.isCorrectionMarker
                  ? 'text-gray-400 italic text-center'
                  : item.row.isVoided
                    ? 'text-gray-400 line-through'
                    : 'text-gray-800'
              }`}
            >
              {item.row.description}
            </Text>
          </TouchableOpacity>
        )
      }
    />
  );
}

/**
 * The play-by-play as its own page, opened from the scorebook toolbar. A
 * page sheet rather than a pushed route: the feed's rows, player names and
 * void action all come from the scoring screen's live state, and a sheet
 * keeps them — new plays recorded while it is open appear immediately, and
 * dismissing it lands the scorer back exactly where they were.
 */
export function PlayFeedSheet({
  visible,
  onClose,
  rows,
  onVoid,
}: {
  visible: boolean;
  onClose: () => void;
  rows: PlayFeedRow[];
  onVoid?: (eventId: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white">
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-200">
          <View>
            <Text className="text-score-lg font-bold text-gray-900">Play-by-Play</Text>
            {onVoid && rows.length > 0 && (
              <Text className="text-score-xs text-gray-500 mt-0.5">Long-press a play to void it.</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            className="px-4 py-2 rounded-full bg-blue-900"
          >
            <Text className="text-score-sm font-semibold text-white">Done</Text>
          </TouchableOpacity>
        </View>
        <PlayFeed rows={rows} onVoid={onVoid} />
      </View>
    </Modal>
  );
}
