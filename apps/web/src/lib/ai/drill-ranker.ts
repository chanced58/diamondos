import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  AiDrillRecommendationsSchema,
  type AiDrillRecommendations,
  type PracticeDrill,
} from '@baseball/shared';
import { AI_MODELS, getAnthropicClient } from './client';
import { formatDrillCatalog } from './drill-catalog';

export interface PlayerFocusSignal {
  source: 'weakness' | 'rep_tag' | 'stat_gap';
  label: string;
  detail?: string;
}

export interface RankDrillsInput {
  player: {
    firstName: string;
    lastName: string;
    primaryPosition?: string | null;
    bats?: string | null;
    throws?: string | null;
    ageLevel?: string | null;
  };
  focusSignals: PlayerFocusSignal[];
  recentBattingLine?: string | null;
  recentPitchingLine?: string | null;
  coachNote?: string | null;
  drills: PracticeDrill[];
}

export interface RankDrillsResult {
  recommendations: AiDrillRecommendations;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

const SYSTEM_PROMPT = `You are a baseball player development assistant. Given a specific player's recent signals (coach-flagged weaknesses, practice rep tags, game stats) and the team's drill library, rank up to 10 drills by expected development impact.

RULES
1. Reference drills only by the exact UUID from the drill catalog.
2. Rank by development impact for THIS player's focus signals — not generic quality.
3. Each rationale: 1–2 sentences tying the drill to a specific signal ("addresses the two-strike chase flagged in 2 recent reps").
4. addressesDeficits: short labels pulled from the focus signals, e.g. "two-strike approach", "first-step quickness". Max 3 labels per drill.
5. expectedImpact: "high" when the drill directly targets the player's top signal, "medium" when it addresses a secondary signal, "low" for supplementary work.
6. Do NOT include drills whose position / age-level constraints exclude this player.
7. If there are no strong signals, rank drills by broad fit to position and prioritize fundamentals.`;

export async function rankDrillsForPlayer(
  input: RankDrillsInput,
): Promise<RankDrillsResult> {
  const client = getAnthropicClient();
  const catalog = formatDrillCatalog(input.drills);

  const userMessage = formatPlayerContext(input);

  const response = await client.messages.parse({
    model: AI_MODELS.sonnet,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      {
        type: 'text',
        text: catalog,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
    output_config: {
      format: zodOutputFormat(AiDrillRecommendationsSchema),
      effort: 'medium',
    },
  });

  const recommendations = response.parsed_output;
  if (!recommendations) {
    throw new Error('AI failed to produce drill recommendations.');
  }

  return {
    recommendations,
    model: AI_MODELS.sonnet,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function formatPlayerContext(input: RankDrillsInput): string {
  const lines: string[] = [];
  lines.push(
    `Player: ${input.player.firstName} ${input.player.lastName}` +
      (input.player.primaryPosition ? ` · ${input.player.primaryPosition}` : '') +
      (input.player.bats ? ` · bats ${input.player.bats}` : '') +
      (input.player.throws ? ` · throws ${input.player.throws}` : '') +
      (input.player.ageLevel ? ` · ${input.player.ageLevel}` : ''),
  );
  lines.push('');

  if (input.focusSignals.length > 0) {
    lines.push('FOCUS SIGNALS (strongest first):');
    for (const s of input.focusSignals) {
      lines.push(`- [${s.source}] ${s.label}${s.detail ? ` — ${s.detail}` : ''}`);
    }
  } else {
    lines.push(
      'FOCUS SIGNALS: none strong — rank by broad fit to position and fundamentals.',
    );
  }
  lines.push('');

  if (input.recentBattingLine) {
    lines.push(`Recent batting: ${input.recentBattingLine}`);
  }
  if (input.recentPitchingLine) {
    lines.push(`Recent pitching: ${input.recentPitchingLine}`);
  }
  if (input.coachNote) {
    lines.push(`Coach note: ${input.coachNote}`);
  }

  return lines.join('\n');
}
