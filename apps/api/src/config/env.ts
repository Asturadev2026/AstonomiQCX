import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  APP_URL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  JWT_SECRET: z.string().min(20, 'JWT_SECRET must be at least 20 characters'),

  AWS_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().optional(),

  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),
  WA_VERIFY_TOKEN: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),

  EXOTEL_SID: z.string().optional(),
  EXOTEL_API_KEY: z.string().optional(),
  EXOTEL_API_TOKEN: z.string().optional(),
  EXOTEL_SUBDOMAIN: z.string().optional(),

  // LLM_PROVIDER forces a choice; otherwise Astra auto-picks whichever key is
  // set (Anthropic first) — see apps/api/src/ai/llm.ts.
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  EMBEDDINGS_MODEL: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
});

// Parsed once at import time — a missing or malformed required var stops the app at boot
// with a clear message, instead of failing later inside some unrelated request.
export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
