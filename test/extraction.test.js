const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseTranscript } = require('../server');

const samples = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/transcripts.json'), 'utf8'));

test('all five example transcripts are available', () => {
  assert.equal(samples.length, 5);
  assert.equal(new Set(samples.map((sample) => sample.id)).size, 5);
});

test('mentions under discussion do not become decisions', () => {
  const result = parseTranscript(samples[0].text);
  assert.equal(result.keyDecisions.length, 1);
  assert.match(result.keyDecisions[0].decision, /agreed to review the forecast/);
  assert.doesNotMatch(JSON.stringify(result.keyDecisions), /new dashboard/);
});

test('assigned actions keep owner, deadline, and evidence', () => {
  const result = parseTranscript(samples[0].text);
  assert.deepEqual(result.actionItems[0], {
    task: 'prepare the Q4 sales report',
    owner: 'Rahul',
    deadline: 'Friday',
    status: 'Pending',
    evidence: 'Rahul: I will prepare the Q4 sales report by Friday.',
  });
});

test('unassigned or undated work is not filled in by guesswork', () => {
  const result = parseTranscript('The report needs a review soon.');
  assert.deepEqual(result.actionItems, []);
  assert.deepEqual(result.keyDecisions, []);
});

test('named commitments and questions are extracted from speaker lines', () => {
  const result = parseTranscript('Nora: Evan will update the alert by Thursday.\nTess: Do we know the cause? We have not selected a fix.');
  assert.equal(result.actionItems[0].owner, 'Evan');
  assert.equal(result.actionItems[0].deadline, 'Thursday');
  assert.equal(result.openQuestions.length, 1);
  assert.deepEqual(result.keyDecisions, []);
});

test('group commitments stay unassigned and second sentences are not skipped', () => {
  const result = parseTranscript('Nora: Not yet. We will investigate the timeline.\nEvan: I will add the recovery steps.');
  assert.equal(result.actionItems.length, 2);
  assert.equal(result.actionItems[0].owner, null);
  assert.equal(result.actionItems[1].task, 'add the recovery steps');
  assert.equal(result.actionItems[1].owner, 'Evan');
});

test('affirmative first-person commitments use the speaker as owner', () => {
  const result = parseTranscript('Leo: Yes, I will share the rota by Wednesday.');
  assert.equal(result.actionItems[0].task, 'share the rota');
  assert.equal(result.actionItems[0].owner, 'Leo');
  assert.equal(result.actionItems[0].deadline, 'Wednesday');
});

test('a direct request assigns the requested person, not the speaker', () => {
  const result = parseTranscript('Aisha: Leo, can you confirm the rota by Wednesday?');
  assert.equal(result.actionItems[0].owner, 'Leo');
  assert.equal(result.actionItems[0].deadline, 'Wednesday');
});

test('questions and follow-ups stay in their own fields', () => {
  const result = parseTranscript(samples[2].text);
  assert.ok(result.actionItems.some((action) => action.task.includes('compare the event and search channel costs')));
  assert.ok(result.openQuestions.some((question) => question.includes('target cost per lead')));
  assert.ok(result.followUpItems.some((item) => item.includes('follow up')));
});

test('every sample produces the documented output shape', () => {
  for (const sample of samples) {
    const result = parseTranscript(sample.text);
    assert.deepEqual(Object.keys(result), [
      'meetingSummary', 'keyDecisions', 'actionItems', 'openQuestions', 'followUpItems',
    ]);
    assert.equal(typeof result.meetingSummary, 'string');
  }
});