import path from 'node:path';

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseJson(value) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    throw new Error('LLM_EXTRA_BODY must be a JSON object.');
  }
}

/**
 * Runtime settings. Next.js loads `.env` automatically; Docker passes it via `env_file`.
 * Same variable names as the main branch: LLM_BASE_URL, LLM_MODEL, NVIDIA_API_KEY / LLM_API_KEY.
 */
export function getSettings(env = process.env) {
  const apiKey = env.LLM_API_KEY || env.NVIDIA_API_KEY || env.OPENAI_API_KEY || null;
  let provider = (env.LLM_PROVIDER || 'auto').toLowerCase();
  if (provider === 'auto') provider = apiKey ? 'ai' : 'demo';
  return {
    provider, // "ai" = OpenAI-compatible endpoint, "demo" = offline deterministic model
    apiKey,
    baseUrl: (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env.LLM_MODEL || env.OPENAI_MODEL || 'gpt-4o-mini',
    // Provider-specific request fields as JSON, e.g. {"chat_template_kwargs":{"enable_thinking":false}}
    // turns off silent reasoning on NVIDIA Nemotron so the first answer token arrives in ~1 s, not ~15 s.
    extraBody: parseJson(env.LLM_EXTRA_BODY),
    corpusDir: env.CORPUS_DIR || path.join(process.cwd(), 'corpus'),
    topK: int(env.SEARCH_TOP_K, 3), // passages per sub-question
    maxPassages: int(env.MAX_PASSAGES, 8), // passages handed to the synthesiser
    demoTokenDelayMs: int(env.DEMO_TOKEN_DELAY_MS, 30), // pacing of the offline model
  };
}
