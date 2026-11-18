import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers.js';

const { getSettings } = await import('../lib/config.js');
const { BM25Index, loadCorpus, tokenize } = await import('../lib/corpus.js');
const { parseSubQuestions, stripThinking } = await import('../lib/graph.js');

const passages = loadCorpus(getSettings().corpusDir);
const index = new BM25Index(passages);

test('corpus has 20 markdown files split into titled passages', () => {
  assert.equal(index.sources.length, 20);
  assert.ok(passages.every((p) => p.title && p.text && !p.text.startsWith('#')));
});

test('keyword search finds the obvious file first', () => {
  const top = (q) => index.search(q)[0].passage.source;
  assert.equal(top('How expensive is nuclear power?'), 'nuclear_power.md');
  assert.equal(top('What minerals do batteries need?'), 'critical_minerals.md');
  assert.equal(top('coefficient of performance of heat pumps'), 'heat_pumps.md');
  assert.equal(top('battery storage California duck curve evening'), 'california_battery_storage.md');
});

test('search returns at most one passage per file and nothing for unrelated text', () => {
  const hits = index.search('wind solar storage grid', 3);
  assert.equal(new Set(hits.map((h) => h.passage.source)).size, hits.length);
  assert.deepEqual(index.search('zzzz qqqq'), []);
});

test('tokenizer stems plurals and -ing forms', () => {
  assert.deepEqual(tokenize('Batteries heating pumps'), ['battery', 'heat', 'pump']);
});

test('planner output is parsed defensively into 2-3 sub-questions', () => {
  const q = 'How do heat pumps work?';
  assert.deepEqual(parseSubQuestions('```json\n{"sub_questions":["A?","B?"]}\n```', q), ['A?', 'B?']);
  assert.equal(parseSubQuestions('{"sub_questions":["1","2","3","4"]}', q).length, 3);
  assert.equal(parseSubQuestions('not json at all', q).length, 3);
  assert.equal(parseSubQuestions('{"sub_questions":["only one"]}', q).length, 3);
  assert.deepEqual(parseSubQuestions('<think>hmm</think>{"sub_questions":["X?","Y?"]}', q), ['X?', 'Y?']);
  assert.equal(stripThinking('<think>a</think> answer'), 'answer');
});
