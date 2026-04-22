import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  AiPracticePlanSchema,
  type AiPracticePlan,
  type PracticeDrill,
  type PracticeFieldSpace,
} from '@baseball/shared';
import { AI_MODELS, getAnthropicClient } from './client';
import { formatDrillCatalog } from './drill-catalog';

export interface GeneratePracticeInput {
  coachPrompt: string;
  durationMinutes: number;
  playerCount: number;
  availableFieldSpaces: PracticeFieldSpace[];
  drills: PracticeDrill[];
}

export interface GeneratePracticeResult {
  plan: AiPracticePlan;
  unknownDrillIds: string[];
  /** Non-null when plan.blocks[].plannedDurationMinutes sums outside ±5 of the requested total. UI can show this; we don't retry. */
  durationMismatchWarning: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

const SYSTEM_PROMPT = `You are a baseball practice planner for high school and youth coaches on the DiamondOS platform. Given a coach's request and their team's drill catalog, produce a structured practice plan.

RULES
1. Reference only drills from the catalog by their exact UUID. Use drillId: null for blocks that don't need a specific drill (warmup, stretch, water_break, meeting, custom).
2. Block durations MUST sum to the coach's requested total (±5 minutes is acceptable).
3. Respect fieldSpace availability — do not pick drills whose required fieldSpaces exceed the coach's list. If a drill lists "any" / no fieldSpace, it works anywhere.
4. Start with a warmup (8–12 min) and end with a stretch or meeting (3–7 min).
5. Vary block types: mix individual_skill, team_defense, situational, bullpen, conditioning as appropriate to the focus.
6. For every block, rationale must explain in 1–2 sentences WHY the block fits the coach's focus. No filler.
7. Pick drills whose minPlayers/maxPlayers fit the coach's player count.
8. Prefer drills whose tags align with keywords in the coach's prompt.
9. The focusSummary is a 1–2 sentence takeaway the coach sees at the top of the plan.`;

export async function generatePractice(
  input: GeneratePracticeInput,
): Promise<GeneratePracticeResult> {
  const client = getAnthropicClient();
  const catalog = formatDrillCatalog(input.drills);
  const drillIdSet = new Set(input.drills.map((d) => d.id));

  const userMessage = [
    `Coach's request: ${input.coachPrompt}`,
    '',
    'Constraints:',
    `- Total duration: ${input.durationMinutes} minutes`,
    `- Player count: ${input.playerCount}`,
    `- Available field spaces: ${input.availableFieldSpaces.join(', ') || 'any'}`,
  ].join('\n');

  const response = await client.messages.parse({
    model: AI_MODELS.opus,
    max_tokens: 16000,
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
      format: zodOutputFormat(AiPracticePlanSchema),
      effort: 'high',
    },
  });

  const plan = response.parsed_output;
  if (!plan) {
    throw new Error('AI failed to produce a valid practice plan.');
  }

  const unknownDrillIds = Array.from(
    new Set(
      plan.blocks
        .filter((b) => b.drillId && !drillIdSet.has(b.drillId))
        .map((b) => b.drillId as string),
    ),
  );

  const totalPlanned = plan.blocks.reduce(
    (n, b) => n + b.plannedDurationMinutes,
    0,
  );
  const delta = totalPlanned - input.durationMinutes;
  const durationMismatchWarning =
    Math.abs(delta) > 5
      ? `Plan totals ${totalPlanned} min vs. the ${input.durationMinutes} min requested (${delta > 0 ? '+' : ''}${delta}).`
      : null;

  return {
    plan,
    unknownDrillIds,
    durationMismatchWarning,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
