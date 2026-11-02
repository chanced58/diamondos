import fs from 'fs';
import path from 'path';

/**
 * The scorer's content is Light, but under Dark and Dugout the window is pinned
 * dark, so a scrollable that doesn't say otherwise gets a white indicator on a
 * white sheet. Every vertical scrollable the scorer renders sets
 * `indicatorStyle="black"` (what Light shows today).
 *
 * A source scan, because the scorer screen is too large to mount in a test.
 */
const MOBILE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const SCORER_FILES = [
  'app/(tabs)/schedule/games/[gameId]/score.tsx',
  'src/features/scoring/BaserunnerDisplay.tsx',
  'src/features/scoring/PlayFeed.tsx',
];

function openingTags(source: string): string[] {
  return source.match(/(?<!useRef)<(?:ScrollView|FlatList)\b[^>]*>/g) ?? [];
}

describe('scorer scroll indicators', () => {
  it.each(SCORER_FILES)('should set indicatorStyle="black" on every vertical scrollable in %s', (rel) => {
    const source = fs.readFileSync(path.join(MOBILE_ROOT, rel), 'utf8');
    const tags = openingTags(source);
    expect(tags.length).toBeGreaterThan(0);

    const missing = tags.filter((tag) => !/\bhorizontal\b/.test(tag) && !/indicatorStyle="black"/.test(tag));
    expect(missing).toEqual([]);
  });
});
