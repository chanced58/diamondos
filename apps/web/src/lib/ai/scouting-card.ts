import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  AiScoutingCardSchema,
  type AiScoutingCard,
  type ScoutingHitterStats,
  type ScoutingPitcherStats,
} from '@baseball/shared';
import { AI_MODELS, getAnthropicClient } from './client';

export interface ScoutingCardInput {
  opponentName: string;
  opponentCity?: string | null;
  /** How many games against this opponent are in the sample. */
  gameSampleCount: number;
  hitterStats: ScoutingHitterStats[];
  pitcherStats: ScoutingPitcherStats[];
  /** Our top pitchers likely to face this opponent (names only, for matchup notes). */
  ourPitchers: string[];
  /** Derived tendencies from opponent-scouting-derive.ts, if available. */
  derivedTendencies: string[];
  /** Coach's freeform scouting notes (optional). */
  coachNotes?: string | null;
}

export interface ScoutingCardResult {
  card: AiScoutingCard;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

const SYSTEM_PROMPT = `You are a baseball scouting analyst writing a one-page dugout card for a high-school or youth coach on the DiamondOS platform. Given computed stats on the opponent and a sample of prior games, produce synthesis — not a stat dump.

OUTPUT
- hitterProfiles: one entry per hitter in the provided list, keyed by their exact opponentPlayerId UUID. approach: how they attack at-bats (pull-happy? patient? chase rate?). howToPitchThem: 2–3 sentences of a catcher's plan. hotZones/coldZones: 1–9 strike-zone cells (1 top-inside to 9 bottom-outside for a RHH — mirror for LHH). stealRisk / buntRisk from their prior behavior.
- pitcherTendencies: synthesize from the pitch mix + velo data. opponentPlayerId can be null if the pitcher doesn't have a clean roster match. displayName is required either way.
- teamTendencies.bullets: 3–6 scannable bullets — things like "aggressive on 1st pitch", "frequent hit-and-run with RISP", "bullpen thins after inning 5".
- keyMatchups: 3–5 matchups — ourLabel vs theirLabel with a dugout-ready note (2–3 sentences).
- oneLineSummary: ONE sentence the coach reads first. The single takeaway.

RULES
1. Only reference hitters by the exact opponentPlayerId UUIDs provided. Don't invent players.
2. Only reference pitchers by exact opponentPlayerId UUIDs when a clean match exists; use null + a displayName otherwise.
3. Ground every claim in the provided stats. If the sample is small (few games or few PAs), say so in the approach text and keep claims modest.
4. Be terse — this is a card the coach carries into the dugout. Short sentences. Active voice.
5. No filler like "should continue to monitor" or "as always". Make it actionable.`;

export async function generateScoutingCard(
  input: ScoutingCardInput,
): Promise<ScoutingCardResult> {
  const client = getAnthropicClient();

  const userMessage = formatScoutingContext(input);

  const response = await client.messages.parse({
    model: AI_MODELS.opus,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    output_config: {
      format: zodOutputFormat(AiScoutingCardSchema),
      effort: 'xhigh',
    },
  });

  const card = response.parsed_output;
  if (!card) {
    throw new Error('AI failed to produce a valid scouting card.');
  }

  return {
    card,
    model: AI_MODELS.opus,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function formatScoutingContext(input: ScoutingCardInput): string {
  const lines: string[] = [];
  lines.push(
    `Opponent: ${input.opponentName}${input.opponentCity ? ` (${input.opponentCity})` : ''}`,
  );
  lines.push(`Game sample: ${input.gameSampleCount} prior game(s) on record.`);
  lines.push('');

  lines.push('HITTERS (use opponentPlayerId as the key):');
  if (input.hitterStats.length === 0) lines.push('(no hitter data yet)');
  for (const h of input.hitterStats) {
    lines.push(
      `- ${h.opponentPlayerId} | ${h.displayName}${
        h.position ? ` (${h.position})` : ''
      }${h.bats ? ` bats ${h.bats}` : ''}: PA=${h.pa} AB=${h.ab} H=${h.h} HR=${h.hr} K=${h.k} BB=${h.bb} | ${h.avg}/${h.obp}/${h.slg} OPS ${h.ops}`,
    );
  }
  lines.push('');

  lines.push('PITCHERS (opponentPlayerId can be null; use displayName):');
  if (input.pitcherStats.length === 0) lines.push('(no pitcher data yet)');
  for (const p of input.pitcherStats) {
    const mix = p.pitchMix
      .map((m) => `${m.pitchType} ${m.percent.toFixed(0)}%`)
      .join(', ');
    lines.push(
      `- id=${p.opponentPlayerId ?? 'null'} | ${p.displayName}: ${p.pitches} pitches${
        p.avgVelocity ? ` · avg ${p.avgVelocity.toFixed(1)} mph` : ''
      }${
        p.firstPitchStrikePct != null
          ? ` · 1st-pitch strike ${(p.firstPitchStrikePct * 100).toFixed(0)}%`
          : ''
      } · mix: ${mix || 'none recorded'}`,
    );
  }
  lines.push('');

  if (input.derivedTendencies.length > 0) {
    lines.push('DERIVED TENDENCIES (from earlier scouting pipeline):');
    for (const t of input.derivedTendencies) lines.push(`- ${t}`);
    lines.push('');
  }

  if (input.ourPitchers.length > 0) {
    lines.push(`OUR PROBABLE PITCHERS: ${input.ourPitchers.join(', ')}`);
    lines.push('');
  }

  if (input.coachNotes) {
    lines.push(`COACH NOTES: ${input.coachNotes}`);
  }

  return lines.join('\n');
}
