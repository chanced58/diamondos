import { leagueGameControlRefusal } from '../league-game-controls';

const normal = { status: 'completed', league_game_id: null, result_source: null };
const leagueBook = { status: 'in_progress', league_game_id: 'lg-1', result_source: null };

describe('leagueGameControlRefusal', () => {
  it('should allow every control on a game that is not a league game', () => {
    for (const control of ['edit', 'cancel', 'reset', 'recalculate'] as const) {
      expect(leagueGameControlRefusal(control, normal)).toBeNull();
    }
  });

  it('should send edits and cancels of a league game to League Games', () => {
    expect(leagueGameControlRefusal('edit', leagueBook)).toMatch(/League Games/);
    expect(leagueGameControlRefusal('cancel', leagueBook)).toMatch(/League Games/);
  });

  it('should refuse recalculate and reset on a row whose result the league wrote', () => {
    const written = { status: 'completed', league_game_id: 'lg-1', result_source: 'paired' };
    expect(leagueGameControlRefusal('recalculate', written)).not.toBeNull();
    expect(leagueGameControlRefusal('reset', written)).not.toBeNull();
  });

  it("should let a team recalculate its own league book but not reset it once it's finished", () => {
    const finished = { ...leagueBook, status: 'completed' };
    expect(leagueGameControlRefusal('recalculate', finished)).toBeNull();
    expect(leagueGameControlRefusal('reset', finished)).not.toBeNull();
    expect(leagueGameControlRefusal('reset', leagueBook)).toBeNull();
  });
});
