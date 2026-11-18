import { getSettings } from './config.js';
import { BM25Index, loadCorpus } from './corpus.js';
import { buildGraph } from './graph.js';
import { getChatModel } from './llm.js';

// Kept on globalThis so every route module (and Next.js dev hot reloads) share one instance.
const store = globalThis.__researchAssistant ??= {
  runtime: null,
  startedAt: Date.now(),
  stats: { active_streams: 0, started: 0, completed: 0, cancelled: 0, failed: 0 },
};

export function getStats() {
  return store.stats;
}

export function getUptimeSeconds() {
  return Math.round((Date.now() - store.startedAt) / 1000);
}

/** Build the corpus index, model and compiled graph once per process. */
export function getRuntime() {
  if (!store.runtime) {
    const settings = getSettings();
    const index = new BM25Index(loadCorpus(settings.corpusDir));
    const llm = getChatModel(settings);
    const graph = buildGraph({ llm, index, topK: settings.topK, maxPassages: settings.maxPassages });
    store.runtime = { settings, index, llm, graph };
  }
  return store.runtime;
}
