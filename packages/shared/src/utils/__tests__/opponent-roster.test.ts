import { isPickableOpponentPlayer, visibleOpponentRoster } from '../opponent-roster';

const row = (id: string, placeholderGameId: string | null = null, isFillIn = false) => ({ id, placeholderGameId, isFillIn });

describe('visibleOpponentRoster', () => {
  it("should keep roster players and this league game's unknown players", () => {
    const roster = [row('regular'), row('this-game', 'lg-1'), row('other-game', 'lg-2')];
    expect(visibleOpponentRoster(roster, 'lg-1').map((p) => p.id)).toEqual(['regular', 'this-game']);
  });

  it('should hide fill-ins, even from the game they played in', () => {
    expect(visibleOpponentRoster([row('regular'), row('fill-in', 'lg-1', true)], 'lg-1').map((p) => p.id)).toEqual(['regular']);
  });

  it('should hide every unknown player on a game that is not a league game', () => {
    expect(visibleOpponentRoster([row('regular'), row('placeholder', 'lg-1')], null).map((p) => p.id)).toEqual(['regular']);
    expect(isPickableOpponentPlayer({ placeholderGameId: 'lg-1' }, undefined)).toBe(false);
  });

  it('should treat a row without the league columns as a roster player', () => {
    expect(isPickableOpponentPlayer({}, null)).toBe(true);
  });
});
