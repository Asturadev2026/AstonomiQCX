import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '../config/env';

type Provider = 'anthropic' | 'openai';

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

function getOpenAiClient(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openaiClient;
}

/** LLM_PROVIDER forces a choice; otherwise whichever key is set wins (Anthropic first). */
function activeProvider(): Provider | null {
  if (env.LLM_PROVIDER) return env.LLM_PROVIDER;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  return null;
}

export function isConfigured(): boolean {
  return activeProvider() !== null;
}

/** Thrown when the configured provider rejects the API key — callers treat this like "not configured". */
export class LlmAuthError extends Error {}

async function completeWithAnthropic(prompt: string): Promise<string> {
  const response = await getAnthropicClient().messages.create({
    model: env.LLM_MODEL || 'claude-sonnet-5',
    max_tokens: 1024,
    // A short support answer doesn't need extended reasoning — keep it fast/cheap.
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

async function completeWithOpenAi(prompt: string): Promise<string> {
  const response = await getOpenAiClient().responses.create({
    model: env.OPENAI_MODEL || 'gpt-5.5',
    input: prompt,
  });
  return response.output_text ?? '';
}

/**
 * Calls whichever LLM provider is configured with a fully-built prompt and
 * returns its raw reply text (or the literal word ESCALATE — see
 * ai.service.ts). Callers use isConfigured() first to give a clean "not set
 * up yet" response instead of a request that's doomed to fail.
 */
export async function llmComplete(prompt: string): Promise<string> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error('No LLM provider is configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)');
  }

  try {
    return provider === 'anthropic' ? await completeWithAnthropic(prompt) : await completeWithOpenAi(prompt);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError) {
      throw new LlmAuthError(`${provider} rejected the configured API key`);
    }
    throw err;
  }
}
