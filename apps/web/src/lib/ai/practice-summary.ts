import 'server-only';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  AiPracticeSummarySchema,
  type AiPracticeSummary,
} from '@baseball/shared';
import { AI_MODELS, getAnthropicClient } from './client';

export interface PracticeSummaryPlayer {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
}

export interface PracticeSummaryBlock {
  title: string;
  blockType: string;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number | null;
  drillName?: string | null;
  status: string;
  notes?: string | null;
}

export interface PracticeSummaryRep {
  playerId?: string | null;
  outcomeCategory: string;
  outcome: string;
  coachTag?: string | null;
  drillName?: string | null;
  /** ISO timestamp — used to order reps newest-first before summarization. */
  recordedAt: string;
}

export interface SummarizePracticeInput {
  scheduledAt: string;
  durationMinutes?: number | null;
  focusSummary?: string | null;
  overallNotes?: string | null;
  coachNotes?: string | null;
  blocks: PracticeSummaryBlock[];
  reps: PracticeSummaryRep[];
  /** All active team players at the time of the practice. */
  players: PracticeSummaryPlayer[];
  /** Subset of `players` that attended. */
  attendedPlayerIds: string[];
  /** Per-player coach notes keyed by player_id, if any. */
  playerNotes?: Record<string, string | null | undefined>;
}

export interface SummarizePracticeResult {
  summary: AiPracticeSummary;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

const SYSTEM_PROMPT = `You are a baseball coaching assistant writing a post-practice summary for a high school or youth team on the DiamondOS platform. The coach will read the full summary; players will see their own per-player paragraph.

OUTPUT
- coachRecap: 2–4 short paragraphs (keep under 300 words total). What was covered, how it went, what to carry into the next practice. No filler.
- standoutPlayers: up to 5 players with a one-sentence reason each, citing a rep outcome, coach tag, or note where possible.
- concerns: up to 5 items. Set playerId when a specific player is involved, null for team-wide concerns.
- playerSummaries: one short paragraph per attended player, player-facing (no harsh judgment; actionable and specific). Max 3–4 sentences per player.

RULES
1. Only reference players who appear in the attendedPlayerIds list. Use their exact UUID as the playerSummaries key.
2. Ground every claim in the provided data — blocks, reps, notes. Do not invent events.
3. Player-facing summaries should be encouraging and specific; mention what they did (not assumed internal states).
4. Be concise. Coaches read fast.`;

export async function summarizePractice(
  input: SummarizePracticeInput,
): Promise<SummarizePracticeResult> {
  const client = getAnthropicClient();

  const userMessage = formatPracticeContext(input);

  const response = await client.messages.parse({
    model: AI_MODELS.sonnet,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    output_config: {
      format: zodOutputFormat(AiPracticeSummarySchema),
      effort: 'medium',
    },
  });

  const summary = response.parsed_output;
  if (!summary) {
    throw new Error('AI failed to produce a valid practice summary.');
  }

  return {
    summary,
    model: AI_MODELS.sonnet,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function repPriority(r: PracticeSummaryRep): number {
  // Coach tags carry the most signal; negative outcomes next; neutral/positive last.
  if (r.coachTag) return 3;
  if (r.outcomeCategory === 'negative') return 2;
  return 1;
}

function formatPracticeContext(input: SummarizePracticeInput): string {
  const lines: string[] = [];
  lines.push(
    `Practice scheduled: ${input.scheduledAt}${
      input.durationMinutes ? ` (${input.durationMinutes} min planned)` : ''
    }`,
  );
  if (input.focusSummary) lines.push(`Focus: ${input.focusSummary}`);
  lines.push('');

  lines.push('PLAYERS (id — name):');
  for (const p of input.players) {
    const attended = input.attendedPlayerIds.includes(p.id) ? ' [attended]' : '';
    lines.push(
      `- ${p.id} — ${p.firstName} ${p.lastName}${
        p.jerseyNumber ? ` #${p.jerseyNumber}` : ''
      }${attended}`,
    );
  }
  lines.push('');

  lines.push('BLOCKS:');
  if (input.blocks.length === 0) lines.push('(no blocks recorded)');
  for (const b of input.blocks) {
    const drill = b.drillName ? ` · drill: ${b.drillName}` : '';
    const actual =
      b.actualDurationMinutes != null
        ? ` · actual ${b.actualDurationMinutes}m`
        : '';
    lines.push(
      `- [${b.status}] ${b.title} (${b.blockType}, ${b.plannedDurationMinutes}m planned${actual})${drill}`,
    );
    if (b.notes) lines.push(`  notes: ${b.notes}`);
  }
  lines.push('');

  lines.push('REPS (per-player rep outcomes, newest first):');
  if (input.reps.length === 0) lines.push('(no reps logged)');
  // Rank reps by (a) priority — coach-tagged or negative outcomes first — then
  // by recency. The summarizer only sees the top 200 after this sort, so we
  // surface the most signal-rich reps even if the total is deep.
  const prioritized = [...input.reps].sort((a, b) => {
    const priorityA = repPriority(a);
    const priorityB = repPriority(b);
    if (priorityA !== priorityB) return priorityB - priorityA;
    return b.recordedAt.localeCompare(a.recordedAt);
  });
  const TOP = 200;
  for (const r of prioritized.slice(0, TOP)) {
    const tag = r.coachTag ? ` [${r.coachTag}]` : '';
    const drill = r.drillName ? ` in ${r.drillName}` : '';
    lines.push(
      `- player=${r.playerId ?? 'unknown'} · ${r.outcomeCategory}: ${r.outcome}${tag}${drill}`,
    );
  }
  if (prioritized.length > TOP) {
    lines.push(
      `  (${prioritized.length - TOP} lower-signal reps omitted — coach-tagged and negative-outcome reps kept first, then most-recent)`,
    );
  }
  lines.push('');

  if (input.overallNotes || input.coachNotes) {
    lines.push('NOTES:');
    if (input.overallNotes) lines.push(`overall: ${input.overallNotes}`);
    if (input.coachNotes) lines.push(`coach-only: ${input.coachNotes}`);
    lines.push('');
  }

  const perPlayer = Object.entries(input.playerNotes ?? {}).filter(
    ([, v]) => v && v.length > 0,
  );
  if (perPlayer.length > 0) {
    lines.push('PER-PLAYER COACH NOTES:');
    for (const [pid, note] of perPlayer) {
      lines.push(`- ${pid}: ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
