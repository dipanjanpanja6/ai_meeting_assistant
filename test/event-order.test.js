import assert from 'node:assert/strict';
import test from 'node:test';
import { askUrl, parseSSE } from './helpers.js';

// Import the real route module after helpers.js has forced demo mode.
const { GET } = await import('../app/ask/route.js');

async function run(question) {
  const res = await GET(new Request(askUrl(question)));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  return parseSSE(await res.text());
}

const events = await run('How do batteries help integrate solar power into the grid?');
const idx = (pred) => events.findIndex(pred);
const progress = (node, status) => idx((e) => e.event === 'progress' && e.data.node === node && e.data.status === status);

test('stream opens with run and closes with done', () => {
  assert.equal(events[0].event, 'run');
  assert.equal(events.at(-1).event, 'done');
  assert.deepEqual(events.map((e) => e.id), events.map((_, i) => i + 1), 'ids are sequential');
});

test('progress events arrive before the first token', () => {
  const firstToken = idx((e) => e.event === 'token');
  const firstProgress = idx((e) => e.event === 'progress');
  assert.ok(firstToken > 0, 'answer tokens were streamed');
  assert.ok(firstProgress > 0 && firstProgress < firstToken);
  // plan and search have fully finished, and synthesise has started, before any token.
  assert.ok(progress('plan', 'finished') < firstToken);
  assert.ok(progress('search', 'finished') < firstToken);
  assert.ok(progress('synthesise', 'started') < firstToken);
});

test('nodes start and finish in graph order: plan -> search -> synthesise -> cite', () => {
  const order = events.filter((e) => e.event === 'progress').map((e) => `${e.data.node}:${e.data.status}`);
  assert.deepEqual(order, [
    'plan:started', 'plan:finished',
    'search:started', 'search:finished',
    'synthesise:started', 'synthesise:finished',
    'cite:started', 'cite:finished',
  ]);
  for (const e of events.filter((ev) => ev.event === 'progress')) {
    assert.ok(!Number.isNaN(Date.parse(e.data.ts)), 'every progress event has an ISO timestamp');
  }
});

test('every token is emitted while synthesise is running', () => {
  const start = progress('synthesise', 'started');
  const end = progress('synthesise', 'finished');
  events.forEach((e, i) => {
    if (e.event === 'token') assert.ok(i > start && i < end, `token at ${i} outside synthesise (${start}..${end})`);
  });
});

test('custom events (progress + retrieval) appear in the stream', () => {
  const retrievals = events.filter((e) => e.event === 'retrieval');
  assert.ok(retrievals.length >= 2 && retrievals.length <= 3, 'one retrieval event per sub-question');
  assert.ok(retrievals.every((r) => idx((e) => e === r) > progress('search', 'started')));
  assert.ok(retrievals.every((r) => idx((e) => e === r) < progress('search', 'finished')));
});

test('streamed tokens add up to the final answer, and citations are corpus file names', () => {
  const done = events.at(-1).data;
  const streamed = events.filter((e) => e.event === 'token').map((e) => e.data.text).join('');
  assert.equal(streamed.trim(), done.answer.trim());
  assert.ok(done.citations.length > 0);
  for (const c of done.citations) assert.match(c.source, /^[a-z0-9_]+\.md$/);
  assert.ok(done.sub_questions.length >= 2 && done.sub_questions.length <= 3);
});

test('a missing question is rejected with 400, not a stream', async () => {
  const res = await GET(new Request('http://localhost/ask?q=%20'));
  assert.equal(res.status, 400);
});
