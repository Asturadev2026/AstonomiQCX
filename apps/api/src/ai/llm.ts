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
    model: env.LLM_MODEL || 'claude-haiku-4-5',
    max_tokens: 350,
    // A short support answer doesn't need extended reasoning — keep it fast/cheap.
    thinking: { type: 'disabled' },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = response.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

async function completeWithOpenAi(prompt: string, maxTokens = 350): Promise<string> {
  // Use Chat Completions — faster cold-starts, lower latency than Responses API.
  // Default to gpt-4o-mini: fast and capable for support replies.
  // Override with OPENAI_MODEL env var if needed.
  const response = await getOpenAiClient().chat.completions.create({
    model: env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content ?? '';
}

/**
 * Calls whichever LLM provider is configured with a fully-built prompt and
 * returns its raw reply text (or the literal word ESCALATE — see
 * ai.service.ts). Callers use isConfigured() first to give a clean "not set
 * up yet" response instead of a request that's doomed to fail.
 */
export async function llmComplete(prompt: string, maxTokens = 350): Promise<string> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error('No LLM provider is configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)');
  }

  try {
    return provider === 'anthropic' ? await completeWithAnthropic(prompt) : await completeWithOpenAi(prompt, maxTokens);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError) {
      throw new LlmAuthError(`${provider} rejected the configured API key`);
    }
    throw err;
  }
}

/**
 * Streaming variant of llmComplete — yields text delta chunks as they arrive
 * from the provider so the caller can forward them to the client via SSE
 * without waiting for the full response to be generated.
 */
export async function* llmStream(prompt: string): AsyncGenerator<string> {
  const provider = activeProvider();
  if (!provider) {
    throw new Error('No LLM provider is configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)');
  }

  try {
    if (provider === 'anthropic') {
      const stream = await getAnthropicClient().messages.stream({
        model: env.LLM_MODEL || 'claude-haiku-4-5',
        max_tokens: 350,
        messages: [{ role: 'user', content: prompt }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } else {
      const stream = await getOpenAiClient().chat.completions.create({
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 350,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError) {
      throw new LlmAuthError(`${provider} rejected the configured API key`);
    }
    throw err;
  }
}
