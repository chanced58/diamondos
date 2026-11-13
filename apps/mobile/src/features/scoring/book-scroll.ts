/**
 * On phones the scorer's book (count, bases, their pitcher, the batting order)
 * scrolls inside the space the pad leaves, often only a couple of hundred
 * points. Nothing about a still ScrollView says it scrolls, so the controls
 * below the fold (Change their pitcher, Change, + Batter) went unfound. The
 * book shows a "more below" hint while this is true.
 */

/** Hidden content shorter than this (in points) doesn't earn a hint. */
export const MORE_BELOW_THRESHOLD = 12;

export function hasMoreBelow({
  viewportHeight,
  contentHeight,
  offsetY,
}: {
  viewportHeight: number;
  contentHeight: number;
  offsetY: number;
}): boolean {
  if (viewportHeight <= 0) return false;
  return contentHeight - (offsetY + viewportHeight) > MORE_BELOW_THRESHOLD;
}
