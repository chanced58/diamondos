import type { GameLineup } from '../types/game';
import type { HotHitter, LineupSwapSuggestion } from '../types/hot-hitters';

/**
 * Suggests lineup swaps that promote hot hitters and demote cold ones.
 * Conservative by design — limits suggestions to `maxSwaps` (default 2)
 * to avoid overwhelming coaches.
 *
 * Rules:
 *  - Only suggests promoting a hot hitter into the top N slots (default 5).
 *  - Only suggests demoting a current top-N hitter if they're in the cold list.
 *  - Never suggests moving a hitter who's already in the top N unless they're cold.
 *  - Returns an empty array if there are no clear wins.
 *
 * Pure function — no persistence.
 */
export function suggestLineupAdjustment(args: {
  currentLineup: GameLineup[];
  hotHitters: HotHitter[];
  coldHitters: HotHitter[];
  topSlotCount?: number;
  maxSwaps?: number;
}): LineupSwapSuggestion[] {
  const topSlotCount = args.topSlotCount ?? 5;
  const maxSwaps = args.maxSwaps ?? 2;

  const starters = args.currentLineup
    .filter((l) => l.isStarter)
    .sort((a, b) => a.battingOrder - b.battingOrder);
  if (starters.length === 0) return [];

  const topSlots = starters.filter((s) => s.battingOrder <= topSlotCount);
  const topPlayerIds = new Set(topSlots.map((s) => s.playerId));
  const starterByPlayerId = new Map(starters.map((s) => [s.playerId, s]));
  const coldPlayerIds = new Set(args.coldHitters.map((c) => c.playerId));

  // Cold hitters currently in the top slots are demotion candidates.
  const demotionCandidates = topSlots.filter((s) => coldPlayerIds.has(s.playerId));

  // Hot hitters not yet in the top slots are promotion candidates.
  const promotionCandidates = args.hotHitters.filter(
    (h) => !topPlayerIds.has(h.playerId) && starterByPlayerId.has(h.playerId),
  );

  const suggestions: LineupSwapSuggestion[] = [];

  for (const demote of demotionCandidates) {
    if (suggestions.length >= maxSwaps) break;
    const promote = promotionCandidates[suggestions.length];
    if (!promote) break;
    const promoteSlot = starterByPlayerId.get(promote.playerId);
    if (!promoteSlot) continue;
    suggestions.push({
      fromBattingOrder: promoteSlot.battingOrder,
      toBattingOrder: demote.battingOrder,
      demotePlayerId: demote.playerId,
      promotePlayerId: promote.playerId,
      reason: `Hot bat (rank ${promote.rank}) moves into the #${demote.battingOrder} slot; cold bat drops to #${promoteSlot.battingOrder}.`,
    });
  }

  return suggestions;
}
