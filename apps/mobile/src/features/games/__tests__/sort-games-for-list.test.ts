import { sortGamesForList } from '../sort-games-for-list';

interface MockGame {
  id: string;
  status: string;
}

describe('sortGamesForList', () => {
  it('should put in_progress games first among mixed statuses', () => {
    const input: MockGame[] = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'in_progress' },
      { id: 'c', status: 'scheduled' },
      { id: 'd', status: 'in_progress' },
      { id: 'e', status: 'completed' },
    ];

    const result = sortGamesForList(input);

    expect(result).toEqual([
      { id: 'b', status: 'in_progress' },
      { id: 'd', status: 'in_progress' },
      { id: 'a', status: 'completed' },
      { id: 'c', status: 'scheduled' },
      { id: 'e', status: 'completed' },
    ]);
  });

  it('should return array unchanged when no in_progress games', () => {
    const input: MockGame[] = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'scheduled' },
      { id: 'c', status: 'completed' },
    ];

    const result = sortGamesForList(input);

    expect(result).toEqual(input);
  });

  it('should return array unchanged when all games are in_progress', () => {
    const input: MockGame[] = [
      { id: 'a', status: 'in_progress' },
      { id: 'b', status: 'in_progress' },
      { id: 'c', status: 'in_progress' },
    ];

    const result = sortGamesForList(input);

    expect(result).toEqual(input);
  });

  it('should preserve relative order within each group', () => {
    const input: MockGame[] = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'scheduled' },
      { id: 'c', status: 'in_progress' },
      { id: 'd', status: 'cancelled' },
      { id: 'e', status: 'in_progress' },
      { id: 'f', status: 'completed' },
    ];

    const result = sortGamesForList(input);

    // in_progress games first (c, e in original order), then others (a, b, d, f in original order)
    expect(result).toEqual([
      { id: 'c', status: 'in_progress' },
      { id: 'e', status: 'in_progress' },
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'scheduled' },
      { id: 'd', status: 'cancelled' },
      { id: 'f', status: 'completed' },
    ]);
  });

  it('should handle empty array', () => {
    const input: MockGame[] = [];

    const result = sortGamesForList(input);

    expect(result).toEqual([]);
  });

  it('should not mutate the input array', () => {
    const input: MockGame[] = [
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'in_progress' },
      { id: 'c', status: 'scheduled' },
    ];
    const originalInput = JSON.parse(JSON.stringify(input));

    sortGamesForList(input);

    expect(input).toEqual(originalInput);
  });
});
