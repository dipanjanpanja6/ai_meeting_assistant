import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ANSWER_PROMPT, PLAN_PROMPT, demoPlan } from './llm.js';

export const NODES = ['plan', 'search', 'synthesise', 'cite'];

const ResearchState = Annotation.Root({
  question: Annotation(),
  subQuestions: Annotation(),
  passages: Annotation(), // [{ n, id, source, title, text, score, subQuestion }]
  answer: Annotation(),
  citations: Annotation(), // [{ source, title, refs: [n, ...] }]
});

export const nowIso = () => new Date().toISOString();

/**
 * Wrap a node so it reports its own lifecycle on LangGraph's `custom` stream.
 * "started" is emitted before the node does any work, which `updates` mode cannot do:
 * an update only exists once the node has returned.
 */
function tracked(name, fn) {
  return async (state, config) => {
    const t0 = performance.now();
    config.writer?.({ type: 'progress', node: name, status: 'started', ts: nowIso() });
    const result = await fn(state, config);
    config.writer?.({
      type: 'progress', node: name, status: 'finished', ts: nowIso(),
      duration_ms: Math.round(performance.now() - t0),
    });
    return result;
  };
}

/** Strip reasoning blocks some hosted models emit before their final answer. */
export function stripThinking(text) {
  return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Parse the planner's JSON (tolerating fences and prose around it) and force 2-3 sub-questions. */
export function parseSubQuestions(raw, question) {
  let subs = [];
  const match = stripThinking(raw).match(/\{[\s\S]*\}/);
  try {
    const items = JSON.parse(match ? match[0] : '').sub_questions;
    if (Array.isArray(items)) subs = items.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
  } catch {
    subs = [];
  }
  const unique = [...new Map(subs.map((s) => [s.toLowerCase(), s])).values()];
  const filled = unique.length >= 2 ? unique : [...unique, ...demoPlan(question)];
  return filled.slice(0, 3);
}

export function formatPassages(passages) {
  return passages.map((p) => `[${p.n}] (${p.source}) ${p.text}`).join('\n');
}

export function buildGraph({ llm, index, topK = 3, maxPassages = 8 }) {
  const plan = tracked('plan', async (state, config) => {
    const msg = await llm.invoke([new SystemMessage(PLAN_PROMPT), new HumanMessage(state.question)], config);
    return { subQuestions: parseSubQuestions(msg.content, state.question) };
  });

  const search = tracked('search', async (state, config) => {
    const best = new Map();
    for (const sq of state.subQuestions) {
      const hits = index.search(sq, topK);
      // Mid-node progress: one custom event per sub-question as soon as its lookup is done.
      config.writer?.({
        type: 'retrieval', sub_question: sq, ts: nowIso(),
        hits: hits.map((h) => ({ source: h.passage.source, score: Number(h.score.toFixed(2)) })),
      });
      for (const { passage, score } of hits) {
        if (!best.has(passage.id) || score > best.get(passage.id).score) {
          best.set(passage.id, { ...passage, score: Number(score.toFixed(3)), subQuestion: sq });
        }
      }
    }
    const ranked = [...best.values()].sort((a, b) => b.score - a.score).slice(0, maxPassages);
    return { passages: ranked.map((p, i) => ({ ...p, n: i + 1 })) };
  });

  const synthesise = tracked('synthesise', async (state, config) => {
    if (!state.passages?.length) {
      return { answer: 'The local corpus does not contain passages relevant to this question.' };
    }
    const prompt = `Question: ${state.question}\n\nSub-questions: ${state.subQuestions.join('; ')}\n\n`
      + `Passages:\n${formatPassages(state.passages)}`;
    // Tokens leave through the `messages` stream mode while this call is still running.
    const msg = await llm.invoke([new SystemMessage(ANSWER_PROMPT), new HumanMessage(prompt)], config);
    return { answer: stripThinking(msg.content) };
  });

  const cite = tracked('cite', async (state) => {
    const byN = new Map((state.passages || []).map((p) => [p.n, p]));
    const used = [...(state.answer || '').matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])).filter((n) => byN.has(n));
    const order = used.length ? [...new Set(used)] : [...byN.keys()];
    const grouped = new Map(); // one entry per file, keeping every [n] that cites it
    for (const n of order) {
      const p = byN.get(n);
      if (!grouped.has(p.source)) grouped.set(p.source, { source: p.source, title: p.title, refs: [] });
      grouped.get(p.source).refs.push(n);
    }
    return { citations: [...grouped.values()] };
  });

  return new StateGraph(ResearchState)
    .addNode('plan', plan)
    .addNode('search', search)
    .addNode('synthesise', synthesise)
    .addNode('cite', cite)
    .addEdge(START, 'plan')
    .addEdge('plan', 'search')
    .addEdge('search', 'synthesise')
    .addEdge('synthesise', 'cite')
    .addEdge('cite', END)
    .compile();
}
