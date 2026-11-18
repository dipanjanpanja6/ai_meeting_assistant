import { nowIso } from './graph.js';

/**
 * Three LangGraph stream modes are requested at once, each with a distinct job:
 *
 *   custom   -> `progress`  node started / finished + timestamp (written by the node itself)
 *            -> `retrieval` hits for each sub-question, while `search` is still running
 *   updates  -> `update`    the state delta a node returned, once it has finished
 *   messages -> `token`     LLM output chunks, filtered to the `synthesise` node
 *
 * plus `run` (first) and `done` (last), added here.
 */
export const STREAM_MODES = ['custom', 'updates', 'messages'];
export const ANSWER_NODE = 'synthesise';

/** Keep `update` events small: no passage text and no second copy of the streamed answer. */
export function summariseUpdate(node, delta) {
  if (node === 'search') return { passages: (delta.passages || []).map(({ n, source, score }) => ({ n, source, score })) };
  if (node === 'synthesise') return { answer_chars: (delta.answer || '').length };
  return delta;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('');
  return '';
}

/** Yields [eventName, data] pairs for one research run. Throws if `signal` aborts. */
export async function* streamResearch(graph, question, { signal } = {}) {
  yield ['run', { question, ts: nowIso() }];
  const final = {};
  const stream = await graph.stream({ question }, { streamMode: STREAM_MODES, signal });
  let inThink = false;
  for await (const [mode, chunk] of stream) {
    if (mode === 'custom') {
      const { type, ...data } = chunk;
      yield [type, data];
    } else if (mode === 'updates') {
      for (const [node, delta] of Object.entries(chunk)) {
        Object.assign(final, delta || {});
        yield ['update', { node, data: summariseUpdate(node, delta || {}) }];
      }
    } else if (mode === 'messages') {
      const [message, meta] = chunk;
      if (meta?.langgraph_node !== ANSWER_NODE) continue;
      let text = textOf(message.content);
      // Hide <think>…</think> reasoning that some hosted models stream before the answer.
      if (text.includes('<think>')) inThink = true;
      if (inThink) {
        if (!text.includes('</think>')) continue;
        inThink = false;
        text = text.split('</think>').pop();
      }
      if (text) yield ['token', { text }];
    }
  }
  yield ['done', {
    ts: nowIso(),
    answer: final.answer || '',
    citations: final.citations || [],
    sub_questions: final.subQuestions || [],
  }];
}
