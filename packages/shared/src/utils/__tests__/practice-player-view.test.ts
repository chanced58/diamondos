import { buildPlayerRotationView } from '../practice-player-view';
import type { PracticeWithBlocks } from '../../types/practice';
import {
  PracticeBlockStatus,
  PracticeRunStatus,
  PracticeWeatherMode,
} from '../../types/practice';
import { PracticeBlockType } from '../../types/practice-template';

// Fixture:
//   Scheduled 2026-05-01T16:00:00Z
//   Block 1 "Warmup"  (10 min, no stations) — player is on block.players
//   Block 2 "Hitting" (30 min, 3 stations × 10 min rotations):
//                     player rotates Tee(idx 0) → Front Toss(idx 1) → Live BP(idx 2)
//   Block 3 "Defense" (20 min, player NOT included)
const fixture: PracticeWithBlocks = {
  id: 'p1',
  teamId: 't1',
  scheduledAt: '2026-05-01T16:00:00Z',
  durationMinutes: 60,
  weatherMode: PracticeWeatherMode.OUTDOOR,
  runStatus: PracticeRunStatus.NOT_STARTED,
  totalPlannedMinutes: 60,
  isQuickPractice: false,
  status: 'scheduled',
  blocks: [
    {
      id: 'b1',
      practiceId: 'p1',
      position: 0,
      blockType: PracticeBlockType.WARMUP,
      title: 'Warmup',
      plannedDurationMinutes: 10,
      fieldSpaces: [],
      status: PracticeBlockStatus.PENDING,
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
      players: [
        { id: 'bp1', blockId: 'b1', playerId: 'pl1', createdAt: '2026-04-30T00:00:00Z' },
      ],
      stations: [],
    },
    {
      id: 'b2',
      practiceId: 'p1',
      position: 1,
      blockType: PracticeBlockType.INDIVIDUAL_SKILL,
      title: 'Hitting',
      plannedDurationMinutes: 30,
      fieldSpaces: [],
      status: PracticeBlockStatus.PENDING,
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
      players: [
        { id: 'bp2', blockId: 'b2', playerId: 'pl1', createdAt: '2026-04-30T00:00:00Z' },
      ],
      stations: [
        {
          id: 's1',
          blockId: 'b2',
          position: 0,
          name: 'Tee',
          rotationDurationMinutes: 10,
          rotationCount: 3,
          createdAt: '2026-04-30T00:00:00Z',
          updatedAt: '2026-04-30T00:00:00Z',
          assignments: [
            { id: 'a1', stationId: 's1', playerId: 'pl1', rotationIndex: 0, createdAt: '2026-04-30T00:00:00Z' },
          ],
        },
        {
          id: 's2',
          blockId: 'b2',
          position: 1,
          name: 'Front Toss',
          rotationDurationMinutes: 10,
          rotationCount: 3,
          createdAt: '2026-04-30T00:00:00Z',
          updatedAt: '2026-04-30T00:00:00Z',
          assignments: [
            { id: 'a2', stationId: 's2', playerId: 'pl1', rotationIndex: 1, createdAt: '2026-04-30T00:00:00Z' },
          ],
        },
        {
          id: 's3',
          blockId: 'b2',
          position: 2,
          name: 'Live BP',
          rotationDurationMinutes: 10,
          rotationCount: 3,
          createdAt: '2026-04-30T00:00:00Z',
          updatedAt: '2026-04-30T00:00:00Z',
          assignments: [
            { id: 'a3', stationId: 's3', playerId: 'pl1', rotationIndex: 2, createdAt: '2026-04-30T00:00:00Z' },
          ],
        },
      ],
    },
    {
      id: 'b3',
      practiceId: 'p1',
      position: 2,
      blockType: PracticeBlockType.TEAM_DEFENSE,
      title: 'Defense',
      plannedDurationMinutes: 20,
      fieldSpaces: [],
      status: PracticeBlockStatus.PENDING,
      createdAt: '2026-04-30T00:00:00Z',
      updatedAt: '2026-04-30T00:00:00Z',
      players: [],
      stations: [],
    },
  ],
};

describe('buildPlayerRotationView', () => {
  it('includes non-station blocks when the player is in block.players', () => {
    const view = buildPlayerRotationView(fixture, 'pl1');
    expect(view[0]).toMatchObject({
      blockId: 'b1',
      blockTitle: 'Warmup',
      startsAt: '2026-05-01T16:00:00.000Z',
      endsAt: '2026-05-01T16:10:00.000Z',
    });
    expect(view[0].stationName).toBeUndefined();
  });

  it('subdivides station blocks by rotationIndex × rotationDurationMinutes', () => {
    const view = buildPlayerRotationView(fixture, 'pl1');
    const hitting = view.filter((s) => s.blockId === 'b2');
    expect(hitting).toHaveLength(3);
    expect(hitting[0]).toMatchObject({
      stationName: 'Tee',
      rotationIndex: 0,
      startsAt: '2026-05-01T16:10:00.000Z',
      endsAt: '2026-05-01T16:20:00.000Z',
    });
    expect(hitting[1]).toMatchObject({
      stationName: 'Front Toss',
      rotationIndex: 1,
      startsAt: '2026-05-01T16:20:00.000Z',
      endsAt: '2026-05-01T16:30:00.000Z',
    });
    expect(hitting[2]).toMatchObject({
      stationName: 'Live BP',
      rotationIndex: 2,
      startsAt: '2026-05-01T16:30:00.000Z',
      endsAt: '2026-05-01T16:40:00.000Z',
    });
  });

  it('skips blocks where the player is neither in players nor assignments', () => {
    const view = buildPlayerRotationView(fixture, 'pl1');
    expect(view.find((s) => s.blockId === 'b3')).toBeUndefined();
  });

  it('returns empty when the player is not on the practice', () => {
    expect(buildPlayerRotationView(fixture, 'unknown')).toEqual([]);
  });

  it('uses scheduledAt as the clock base when the practice has not started', () => {
    const view = buildPlayerRotationView(fixture, 'pl1');
    expect(view[0].startsAt).toBe('2026-05-01T16:00:00.000Z');
  });

  it('prefers startedAt over scheduledAt when set', () => {
    const started: PracticeWithBlocks = {
      ...fixture,
      runStatus: PracticeRunStatus.RUNNING,
      startedAt: '2026-05-01T17:00:00Z',
    };
    const view = buildPlayerRotationView(started, 'pl1');
    expect(view[0].startsAt).toBe('2026-05-01T17:00:00.000Z');
  });
});
