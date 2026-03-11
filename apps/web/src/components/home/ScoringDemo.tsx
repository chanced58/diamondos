'use client';

import type { JSX } from 'react';
import { useState, useCallback } from 'react';
import { deriveGameState } from '@baseball/shared';
import {
  EventType,
  PitchOutcome,
  HitType,
} from '@baseball/shared';
import type { GameEvent, LiveGameState } from '@baseball/shared';

// ── Demo data ────────────────────────────────────────────────────────────────

const DEMO_BATTERS = [
  { id: 'demo-b1', name: 'Alex Rivera', number: 12 },
  { id: 'demo-b2', name: 'Marcus Chen', number: 4 },
  { id: 'demo-b3', name: 'Jordan Williams', number: 23 },
];

const DEMO_PITCHER_ID = 'demo-pitcher';
const DEMO_GAME_ID = 'demo-home';
const DEMO_HOME_TEAM_ID = 'demo-home-team';

function makeStartEvent(): GameEvent {
  return {
    id: 'demo-start',
    gameId: DEMO_GAME_ID,
    sequenceNumber: 1,
    eventType: EventType.GAME_START,
    inning: 1,
    isTopOfInning: true,
    payload: { homeLineupPitcherId: DEMO_PITCHER_ID },
    occurredAt: new Date().toISOString(),
    createdBy: 'demo',
    deviceId: 'web',
  };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Dot({ filled, color }: { filled: boolean; color: string }) {
  return (
    <span
      className={`inline-block w-4 h-4 rounded-full border-2 ${
        filled ? color : 'border-gray-300 bg-transparent'
      }`}
    />
  );
}

function CountDisplay({ balls, strikes, outs }: { balls: number; strikes: number; outs: number }) {
  return (
    <div className="flex gap-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">
      <div className="flex items-center gap-1.5">
        <span>B</span>
        {[0, 1, 2, 3].map((i) => (
          <Dot key={`b${i}`} filled={i < balls} color="bg-green-500 border-green-500" />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span>S</span>
        {[0, 1, 2].map((i) => (
          <Dot key={`s${i}`} filled={i < strikes} color="bg-yellow-500 border-yellow-500" />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span>O</span>
        {[0, 1, 2].map((i) => (
          <Dot key={`o${i}`} filled={i < outs} color="bg-red-500 border-red-500" />
        ))}
      </div>
    </div>
  );
}

function BaserunnerDiamond({
  runners,
}: {
  runners: LiveGameState['runnersOnBase'];
}) {
  function Base({ occupied, className }: { occupied: boolean; className: string }) {
    return (
      <div
        className={`absolute w-6 h-6 rotate-45 border-2 ${
          occupied ? 'bg-brand-500 border-brand-600' : 'bg-white border-gray-300'
        } ${className}`}
      />
    );
  }

  return (
    <div className="relative w-20 h-20">
      <Base occupied={!!runners.second} className="top-0 left-1/2 -translate-x-1/2" />
      <Base occupied={!!runners.third} className="top-1/2 left-0 -translate-y-1/2" />
      <Base occupied={!!runners.first} className="top-1/2 right-0 -translate-y-1/2" />
      {/* Home plate */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-5 rotate-45 border-2 border-gray-400 bg-white" />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface ScoringDemoProps {
  isLoggedIn: boolean;
}

export function ScoringDemo({ isLoggedIn }: ScoringDemoProps): JSX.Element {
  const [events, setEvents] = useState<GameEvent[]>([makeStartEvent()]);
  const [seqCounter, setSeqCounter] = useState(2);
  const [currentBatterIdx, setCurrentBatterIdx] = useState(0);
  const [inPlayPending, setInPlayPending] = useState(false);
  const [demoComplete, setDemoComplete] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const gameState = deriveGameState(DEMO_GAME_ID, events, DEMO_HOME_TEAM_ID);
  const currentBatter = DEMO_BATTERS[currentBatterIdx] ?? null;

  const appendEvent = useCallback(
    (eventType: EventType, payload: Record<string, unknown>): GameEvent => {
      const seq = seqCounter;
      const event: GameEvent = {
        id: `demo-${seq}`,
        gameId: DEMO_GAME_ID,
        sequenceNumber: seq,
        eventType,
        inning: 1,
        isTopOfInning: true,
        payload,
        occurredAt: new Date().toISOString(),
        createdBy: 'demo',
        deviceId: 'web',
      };
      setSeqCounter(seq + 1);
      return event;
    },
    [seqCounter],
  );

  // Check if a plate appearance ended and advance batter
  const advanceBatter = useCallback(
    (newEvents: GameEvent[], actionLabel: string) => {
      setEvents(newEvents);
      setInPlayPending(false);
      setLastAction(actionLabel);

      // Derive state from new events to check outs
      const newState = deriveGameState(DEMO_GAME_ID, newEvents, DEMO_HOME_TEAM_ID);
      if (newState.outs >= 3) {
        setDemoComplete(true);
        return;
      }

      const nextIdx = currentBatterIdx + 1;
      if (nextIdx >= DEMO_BATTERS.length) {
        setDemoComplete(true);
      } else {
        setCurrentBatterIdx(nextIdx);
      }
    },
    [currentBatterIdx],
  );

  const handlePitch = useCallback(
    (outcome: PitchOutcome) => {
      if (!currentBatter) return;

      const pitchEvent = appendEvent(EventType.PITCH_THROWN, {
        pitcherId: DEMO_PITCHER_ID,
        batterId: currentBatter.id,
        outcome,
      });
      const newEvents = [...events, pitchEvent];

      if (outcome === PitchOutcome.IN_PLAY) {
        setEvents(newEvents);
        setInPlayPending(true);
        setLastAction('In play...');
        return;
      }

      // Check for walk (4 balls)
      const newState = deriveGameState(DEMO_GAME_ID, newEvents, DEMO_HOME_TEAM_ID);
      if (outcome === PitchOutcome.BALL && newState.balls >= 4) {
        const walkEvent = appendEvent(EventType.WALK, {
          batterId: currentBatter.id,
          pitcherId: DEMO_PITCHER_ID,
        });
        // Fix sequence since appendEvent uses same counter
        walkEvent.sequenceNumber = pitchEvent.sequenceNumber + 1;
        walkEvent.id = `demo-${pitchEvent.sequenceNumber + 1}`;
        setSeqCounter(pitchEvent.sequenceNumber + 2);
        advanceBatter([...newEvents, walkEvent], 'Walk (BB)');
        return;
      }

      // Check for strikeout (3 strikes)
      if (
        (outcome === PitchOutcome.CALLED_STRIKE || outcome === PitchOutcome.SWINGING_STRIKE) &&
        newState.strikes >= 2 &&
        gameState.strikes === 2
      ) {
        const kEvent = appendEvent(EventType.STRIKEOUT, {
          batterId: currentBatter.id,
          pitcherId: DEMO_PITCHER_ID,
          outType: 'strikeout',
        });
        kEvent.sequenceNumber = pitchEvent.sequenceNumber + 1;
        kEvent.id = `demo-${pitchEvent.sequenceNumber + 1}`;
        setSeqCounter(pitchEvent.sequenceNumber + 2);
        advanceBatter([...newEvents, kEvent], 'Strikeout!');
        return;
      }

      // Regular pitch — just update count
      setEvents(newEvents);
      const outcomeLabel: Record<string, string> = {
        [PitchOutcome.BALL]: 'Ball',
        [PitchOutcome.CALLED_STRIKE]: 'Called Strike',
        [PitchOutcome.SWINGING_STRIKE]: 'Swinging Strike',
        [PitchOutcome.FOUL]: 'Foul Ball',
      };
      setLastAction(outcomeLabel[outcome] ?? outcome);
    },
    [currentBatter, events, appendEvent, advanceBatter, gameState.strikes],
  );

  const handleInPlayResult = useCallback(
    (type: 'out' | 'single' | 'double' | 'triple' | 'home_run' | 'error') => {
      if (!currentBatter) return;

      let resultEvent: GameEvent;
      let label: string;

      if (type === 'out') {
        resultEvent = appendEvent(EventType.OUT, {
          batterId: currentBatter.id,
          pitcherId: DEMO_PITCHER_ID,
          outType: 'groundout',
        });
        label = 'Groundout';
      } else if (type === 'error') {
        resultEvent = appendEvent(EventType.FIELD_ERROR, {
          batterId: currentBatter.id,
          pitcherId: DEMO_PITCHER_ID,
        });
        label = 'Error — Safe at 1st';
      } else {
        const hitTypeMap: Record<string, HitType> = {
          single: HitType.SINGLE,
          double: HitType.DOUBLE,
          triple: HitType.TRIPLE,
          home_run: HitType.HOME_RUN,
        };
        resultEvent = appendEvent(EventType.HIT, {
          batterId: currentBatter.id,
          pitcherId: DEMO_PITCHER_ID,
          hitType: hitTypeMap[type],
        });
        label = type === 'home_run' ? 'Home Run!' : type.charAt(0).toUpperCase() + type.slice(1) + '!';
      }

      advanceBatter([...events, resultEvent], label);
    },
    [currentBatter, events, appendEvent, advanceBatter],
  );

  const reset = useCallback(() => {
    setEvents([makeStartEvent()]);
    setSeqCounter(2);
    setCurrentBatterIdx(0);
    setInPlayPending(false);
    setDemoComplete(false);
    setLastAction(null);
  }, []);

  // Count pitches thrown in the demo
  const pitchCount = events.filter((e) => e.eventType === EventType.PITCH_THROWN).length;
  // Count hits
  const hitCount = events.filter((e) => e.eventType === EventType.HIT).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (demoComplete) {
    const finalState = deriveGameState(DEMO_GAME_ID, events, DEMO_HOME_TEAM_ID);
    return (
      <div className="text-center py-8 space-y-6">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-gray-900">Half-Inning Complete</h3>
          <p className="text-gray-500">
            {finalState.outs >= 3
              ? 'You retired the side!'
              : `All ${DEMO_BATTERS.length} batters have batted.`}
          </p>
        </div>

        <div className="flex justify-center gap-8 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-700">{pitchCount}</div>
            <div className="text-gray-500">Pitches</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-700">{hitCount}</div>
            <div className="text-gray-500">Hits</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-700">{finalState.outs}</div>
            <div className="text-gray-500">Outs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-700">{finalState.awayScore}</div>
            <div className="text-gray-500">Runs</div>
          </div>
        </div>

        <p className="text-sm text-gray-400">
          That&apos;s the same game engine powering real scorekeeping in DiamondOS.
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Try Again
          </button>
          <a
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-brand-700 text-white hover:bg-brand-600 transition-colors"
          >
            {isLoggedIn ? 'Go to Dashboard' : 'Sign In to Start Scoring'}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scoreboard header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Top 1st
          </span>
          <div className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{gameState.awayScore}</span>
            <span className="mx-1.5">—</span>
            <span className="font-semibold text-gray-900">{gameState.homeScore}</span>
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {pitchCount} pitch{pitchCount !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Game state display */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex-1 space-y-4">
          <CountDisplay balls={gameState.balls} strikes={gameState.strikes} outs={gameState.outs} />

          {/* Current batter */}
          {currentBatter && (
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                At Bat
              </div>
              <div className="text-lg font-bold text-gray-900">
                <span className="text-brand-700">#{currentBatter.number}</span>{' '}
                {currentBatter.name}
              </div>
              <div className="text-xs text-gray-400">
                Batter {currentBatterIdx + 1} of {DEMO_BATTERS.length}
              </div>
            </div>
          )}
        </div>

        <BaserunnerDiamond runners={gameState.runnersOnBase} />
      </div>

      {/* Last action */}
      {lastAction && (
        <div className="text-center text-sm font-medium text-brand-600 bg-brand-50 rounded-lg py-2">
          {lastAction}
        </div>
      )}

      {/* Action buttons */}
      {!inPlayPending ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Record Pitch
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <button
              onClick={() => handlePitch(PitchOutcome.BALL)}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
            >
              Ball
            </button>
            <button
              onClick={() => handlePitch(PitchOutcome.CALLED_STRIKE)}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors"
            >
              Called K
            </button>
            <button
              onClick={() => handlePitch(PitchOutcome.SWINGING_STRIKE)}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
            >
              Swing K
            </button>
            <button
              onClick={() => handlePitch(PitchOutcome.FOUL)}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              Foul
            </button>
            <button
              onClick={() => handlePitch(PitchOutcome.IN_PLAY)}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors col-span-3 sm:col-span-1"
            >
              In Play
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            What happened?
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleInPlayResult('out')}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
            >
              Out
            </button>
            <button
              onClick={() => handleInPlayResult('single')}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
            >
              Single
            </button>
            <button
              onClick={() => handleInPlayResult('double')}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              Double
            </button>
            <button
              onClick={() => handleInPlayResult('triple')}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              Triple
            </button>
            <button
              onClick={() => handleInPlayResult('home_run')}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors"
            >
              Home Run
            </button>
            <button
              onClick={() => handleInPlayResult('error')}
              className="px-3 py-3 text-sm font-medium rounded-lg bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              Error
            </button>
          </div>
          <button
            onClick={() => {
              // Remove the in_play pitch event and go back
              setEvents(events.slice(0, -1));
              setSeqCounter(seqCounter - 1);
              setInPlayPending(false);
              setLastAction(null);
            }}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Back
          </button>
        </div>
      )}

      {/* Reset */}
      {events.length > 1 && (
        <div className="text-center">
          <button
            onClick={reset}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Reset Demo
          </button>
        </div>
      )}
    </div>
  );
}
