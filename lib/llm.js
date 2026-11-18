import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { ChatOpenAI } from '@langchain/openai';

export const PLAN_TAG = '[PLANNER]';
export const ANSWER_TAG = '[SYNTHESISER]';

export const PLAN_PROMPT = `${PLAN_TAG}
You break a research question into focused sub-questions for a keyword search engine.
Return JSON only, no prose: {"sub_questions": ["...", "..."]}
Rules:
- 2 or 3 sub-questions, each answerable on its own.
- Together they cover the whole question; no duplicates.
- Use concrete nouns from the question so keyword search can match them.`;

export const ANSWER_PROMPT = `${ANSWER_TAG}
You write a concise research answer using ONLY the numbered passages provided.
Rules:
- Cite every factual sentence with passage numbers in square brackets, e.g. [2] or [1][3].
- Do not use outside knowledge. If the passages do not answer part of the question, say so.
- 120 to 220 words, plain prose, no headings, no list of sources at the end.`;

/** OpenAI-compatible chat model (NVIDIA by default via LLM_BASE_URL) or the offline demo model. */
export function getChatModel(settings) {
  if (settings.provider === 'ai') {
    if (!settings.apiKey) throw new Error('LLM_PROVIDER=ai but no API key is set (NVIDIA_API_KEY / LLM_API_KEY).');
    return new ChatOpenAI({
      model: settings.model,
      temperature: 0,
      streaming: true,
      apiKey: settings.apiKey,
      configuration: { baseURL: settings.baseUrl },
      modelKwargs: settings.extraBody,
      timeout: 60_000,
      maxRetries: 1,
    });
  }
  return new DemoResearchModel({ tokenDelayMs: settings.demoTokenDelayMs });
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Aborted'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('Aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Deterministic stand-in for an LLM, used when no API key is configured and in tests.
 * It is a real LangChain chat model that streams word by word, so LangGraph's `messages`
 * stream mode treats it exactly like the hosted model.
 */
export class DemoResearchModel extends BaseChatModel {
  constructor({ tokenDelayMs = 30 } = {}) {
    super({});
    this.tokenDelayMs = tokenDelayMs;
    this.tokensEmitted = 0; // observable in tests: stops growing once a run is cancelled
  }

  _llmType() {
    return 'demo-research';
  }

  respond(messages) {
    const system = String(messages[0]?.content ?? '');
    const user = String(messages.at(-1)?.content ?? '');
    if (system.includes(PLAN_TAG)) return JSON.stringify({ sub_questions: demoPlan(user) });
    if (system.includes(ANSWER_TAG)) return demoAnswer(user);
    return 'OK';
  }

  async _generate(messages) {
    const text = this.respond(messages);
    return { generations: [{ text, message: new AIMessage(text) }] };
  }

  async *_streamResponseChunks(messages, options, runManager) {
    for (const piece of this.respond(messages).match(/\S+\s*/g) || []) {
      if (this.tokenDelayMs) await sleep(this.tokenDelayMs, options?.signal); // aborts on disconnect
      else if (options?.signal?.aborted) throw options.signal.reason ?? new Error('Aborted');
      this.tokensEmitted += 1;
      const chunk = new ChatGenerationChunk({ text: piece, message: new AIMessageChunk({ content: piece }) });
      yield chunk;
      await runManager?.handleLLMNewToken(piece, undefined, undefined, undefined, undefined, { chunk });
    }
  }
}

export function demoPlan(question) {
  const lead = /^((what|how|why|which|who|when|where|is|are|do|does|did|can|could|should|will|much|many)\b\s*)+/i;
  const topic = question.trim().replace(lead, '').replace(/[?.\s]+$/, '') || question;
  return [`${topic}?`, `Limitations of ${topic}?`, `Examples of ${topic}?`];
}

export function demoAnswer(prompt) {
  const passages = [...prompt.matchAll(/^\[(\d+)\] \(([^)]+)\) (.+)$/gm)];
  if (!passages.length) return 'The local corpus does not contain passages relevant to this question.';
  const sentences = passages.slice(0, 5).map(([, n, , text]) => {
    const first = text.trim().split(/(?<=[.!?])\s+/)[0].replace(/\.$/, '');
    return `${first} [${n}].`;
  });
  return `Based on the local corpus: ${sentences.join(' ')}`;
}
