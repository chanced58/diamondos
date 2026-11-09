import { buildSideIdMaps } from '@baseball/shared';
import { deriveSideStats } from '../side-stats';

const GAME = 'game-home';

function event(seq: number, type: string, isTop: boolean, payload: Record<string, unknown> = {}) {
  return {
    id: `e${seq}`,
    game_id: GAME,
    sequence_number: seq,
    event_type: type,
    inning: 1,
    is_top_of_inning: isTop,
    payload,
  };
}

/**
 * The home team's book: the away team bats first (a1 homers, a placeholder
 * doubles) off h-pitcher, then the home team bats (h1 singles, then a batter
 * the scorer didn't name strikes out) off a-pitcher.
 */
const HOME_BOOK = [
  event(1, 'game_start', true, { homeLineupPitcherId: 'h-pitcher', awayLineupPitcherId: 'op-apitcher' }),
  event(2, 'hit', true, { opponentBatterId: 'op-a1', pitcherId: 'h-pitcher', hitType: 'home_run' }),
  event(3, 'hit', true, { opponentBatterId: 'op-unknown', pitcherId: 'h-pitcher', hitType: 'double' }),
  event(4, 'inning_change', true),
  event(5, 'hit', false, { batterId: 'h1', opponentPitcherId: 'op-apitcher', hitType: 'single' }),
  event(6, 'strikeout', false, { opponentPitcherId: 'op-apitcher' }),
];

const maps = buildSideIdMaps({
  scoringTeamPlayerIds: ['h1', 'h2', 'h-pitcher'],
  rosterRecordPlayers: [
    { id: 'op-a1', linkedPlayerId: 'a1', isPlaceholder: false, isFillIn: false },
    { id: 'op-apitcher', linkedPlayerId: 'a-pitcher', isPlaceholder: false, isFillIn: false },
    { id: 'op-unknown', linkedPlayerId: null, isPlaceholder: true, isFillIn: false },
  ],
  reverseLinks: new Map(),
});

const players = [
  { id: 'h1', firstName: 'Hank', lastName: 'Home' },
  { id: 'a1', firstName: 'Abe', lastName: 'Away' },
];

describe('deriveSideStats', () => {
  it('should credit the scoring team only its own players', () => {
    const stats = deriveSideStats({ events: HOME_BOOK, sideMap: maps.scoringSide, sidePlayers: players, lineup: undefined });
    expect([...stats.batting.keys()]).toEqual(['h1']);
    expect(stats.batting.get('h1')).toMatchObject({ hits: 1, playerName: 'Hank Home' });
    expect([...stats.pitching.keys()]).toEqual(['h-pitcher']);
    expect(stats.pitching.get('h-pitcher')).toMatchObject({ hitsAllowed: 2 });
  });

  it('should credit the other team its real players and placeholders from the same book', () => {
    const stats = deriveSideStats({ events: HOME_BOOK, sideMap: maps.otherSide, sidePlayers: players, lineup: undefined });
    expect([...stats.batting.keys()].sort()).toEqual(['a1', 'placeholder:op-unknown']);
    expect(stats.batting.get('a1')).toMatchObject({ homeRuns: 1 });
    expect(stats.batting.get('placeholder:op-unknown')).toMatchObject({ doubles: 1 });
    expect([...stats.pitching.keys()]).toEqual(['a-pitcher']);
    expect(stats.pitching.get('a-pitcher')).toMatchObject({ hitsAllowed: 1, strikeouts: 1 });
  });

  it('should drop ids that are not the side\'s own, such as the other team\'s unlinked pitcher', () => {
    const stats = deriveSideStats({ events: HOME_BOOK, sideMap: maps.otherSide, sidePlayers: players, lineup: undefined });
    expect(stats.pitching.has('h-pitcher')).toBe(false);
    expect(stats.batting.has('h1')).toBe(false);
  });

  it('should credit a batter the scorer left unnamed from the scoring team\'s lineup', () => {
    const stats = deriveSideStats({
      events: HOME_BOOK,
      sideMap: maps.scoringSide,
      sidePlayers: players,
      lineup: {
        isHome: true,
        ourLineup: [
          { playerId: 'h1', battingOrder: 1 },
          { playerId: 'h2', battingOrder: 2 },
        ],
      },
    });
    expect(stats.batting.get('h2')).toMatchObject({ strikeouts: 1, atBats: 1 });
  });
});
