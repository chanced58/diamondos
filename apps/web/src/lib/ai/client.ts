import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. AI features require this server-only secret.');
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export const AI_MODELS = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
} as const;
