import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { askUrl } from './helpers.js';

const { getSettings } = await import('../lib/config.js');
const { BM25Index, loadCorpus } = await import('../lib/corpus.js');
const { buildGraph } = await import('../lib/graph.js');
const { DemoResearchModel } = await import('../lib/llm.js');
const { createAskHandler } = await import('../lib/sse.js');
const { getStats } = await import('../lib/runtime.js');
const { GET: health } = await import('../app/health/route.js');

const index = new BM25Index(loadCorpus(getSettings().corpusDir));
const quiet = { info() {}, error() {} };

function slowHandler() {
  const llm = new DemoResearchModel({ tokenDelayMs: 15 }); // ~1.5 s answer: long enough to leave mid-way
  const graph = buildGraph({ llm, index });
  return { llm, GET: createAskHandler({ getGraph: () => graph, log: quiet }) };
}

async function readUntil(reader, needle) {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(needle)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`stream ended before ${needle}`);
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

test('cancelling the response stream mid-answer stops generation and frees the slot', async () => {
  const before = { ...getStats() };
  const { llm, GET } = slowHandler();
  const res = await GET(new Request(askUrl('What limits the growth of wind and solar?')));
  const reader = res.body.getReader();

  await readUntil(reader, 'event: token');
  assert.equal(getStats().active_streams, before.active_streams + 1);
  await reader.cancel(); // what the runtime does when the browser tab closes

  await sleep(150);
  const emittedAfterCancel = llm.tokensEmitted;
  await sleep(300);
  assert.equal(llm.tokensEmitted, emittedAfterCancel, 'model stopped producing tokens');
  assert.equal(getStats().active_streams, before.active_streams);
  assert.equal(getStats().cancelled, before.cancelled + 1);
});

test('an aborted request signal (client gone) also cancels the run', async () => {
  const before = { ...getStats() };
  const { llm, GET } = slowHandler();
  const client = new AbortController();
  const res = await GET(new Request(askUrl('Is green hydrogen better than heat pumps?'), { signal: client.signal }));
  const reader = res.body.getReader();
  await readUntil(reader, 'event: token');
  client.abort();

  await sleep(150);
  const emitted = llm.tokensEmitted;
  await sleep(300);
  assert.equal(llm.tokensEmitted, emitted);
  assert.equal(getStats().cancelled, before.cancelled + 1);
  assert.equal(getStats().active_streams, before.active_streams);
});

test('server stays healthy after early disconnects and serves the next request', async () => {
  const res = await health();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.corpus_files, 20);
  assert.equal(body.active_streams, 0);
  assert.ok(body.cancelled >= 2);

  const { GET } = slowHandler();
  const text = await (await GET(new Request(askUrl('What is a heat pump?')))).text();
  assert.match(text, /event: done/);
});
