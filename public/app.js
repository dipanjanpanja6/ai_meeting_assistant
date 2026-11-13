const sampleSelect = document.querySelector('#sample-select');
const transcriptInput = document.querySelector('#transcript-input');
const analyzeButton = document.querySelector('#analyze-button');
const resultsContent = document.querySelector('#results-content');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
let currentResult = null;
let toastTimeout;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function updateWordCount() {
  const count = transcriptInput.value.trim().split(/\s+/).filter(Boolean).length;
  document.querySelector('#word-count').textContent = `${count} ${count === 1 ? 'word' : 'words'}`;
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2200);
}

function renderList(items, renderItem) {
  if (!items.length) return '<div class="empty-list">Nothing explicit in this transcript.</div>';
  return `<div class="note-list">${items.map(renderItem).join('')}</div>`;
}

function renderResults(result) {
  currentResult = result;
  const decisions = renderList(result.keyDecisions, (item) => `
    <article class="note-item"><div class="note-main">${escapeHtml(item.decision)}</div>
      <span class="evidence"><span class="evidence-label">Heard</span>${escapeHtml(item.evidence)}</span></article>`);
  const actions = renderList(result.actionItems, (item) => `
    <article class="note-item"><div class="note-main">${escapeHtml(item.task)}</div>
      <div class="note-meta"><span>Owner <strong>${escapeHtml(item.owner || 'Unassigned')}</strong></span>
        <span>Due <strong>${escapeHtml(item.deadline || 'Not specified')}</strong></span>
        <span>Status <strong>${escapeHtml(item.status)}</strong></span></div>
      <span class="evidence"><span class="evidence-label">Heard</span>${escapeHtml(item.evidence)}</span></article>`);
  const listSection = (title, number, items) => `
    <section class="result-section"><h3 class="result-section-title"><span class="section-number">${number}</span>${title}<span class="count">${items.length}</span></h3>
      ${items.length ? `<ul class="text-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="empty-list">Nothing surfaced.</div>'}</section>`;

  resultsContent.innerHTML = `
    <section class="summary-block"><h3 class="block-label"><span>✳</span> Meeting summary</h3><p>${escapeHtml(result.meetingSummary)}</p></section>
    <section class="result-section"><h3 class="result-section-title"><span class="section-number">A</span>Key decisions<span class="count">${result.keyDecisions.length}</span></h3>${decisions}</section>
    <section class="result-section"><h3 class="result-section-title"><span class="section-number">B</span>Action items<span class="count">${result.actionItems.length}</span></h3>${actions}</section>
    ${listSection('Open questions', 'C', result.openQuestions)}
    ${listSection('Follow-up', 'D', result.followUpItems)}`;
  copyButton.disabled = false;
  downloadButton.disabled = false;
}

async function analyze() {
  const transcript = transcriptInput.value.trim();
  if (!transcript) {
    transcriptInput.focus();
    showToast('Add a transcript first.');
    return;
  }
  analyzeButton.disabled = true;
  document.querySelector('#analyze-label').textContent = 'Reading the transcript…';
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Analysis failed.');
    renderResults(payload.result);
  } catch (error) {
    resultsContent.innerHTML = `<div class="error-message">${escapeHtml(error.message)}</div>`;
  } finally {
    analyzeButton.disabled = false;
    document.querySelector('#analyze-label').textContent = 'Extract meeting notes';
  }
}

async function loadSamples() {
  const response = await fetch('/transcripts.json');
  const samples = await response.json();
  sampleSelect.innerHTML = samples.map((sample) => `<option value="${escapeHtml(sample.id)}">${escapeHtml(sample.title)}</option>`).join('');
  const selectSample = (sample) => {
    transcriptInput.value = sample.text;
    document.querySelector('#transcript-category').textContent = sample.category.toUpperCase();
    document.querySelector('#transcript-duration').textContent = sample.duration;
    updateWordCount();
  };
  sampleSelect.addEventListener('change', () => {
    selectSample(samples.find((sample) => sample.id === sampleSelect.value));
  });
  selectSample(samples[0]);
  return samples;
}

transcriptInput.addEventListener('input', updateWordCount);
analyzeButton.addEventListener('click', analyze);
document.querySelector('#clear-button').addEventListener('click', () => {
  transcriptInput.value = '';
  updateWordCount();
  transcriptInput.focus();
});
copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(currentResult, null, 2));
  showToast('Structured notes copied.');
});
downloadButton.addEventListener('click', () => {
  const file = new Blob([JSON.stringify(currentResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'meeting-notes.json';
  link.click();
  URL.revokeObjectURL(url);
});

fetch('/api/status').then((response) => response.json()).then(({ aiEnabled }) => {
  const pill = document.querySelector('#mode-pill');
  document.querySelector('#mode-label').textContent = aiEnabled ? 'AI extraction' : 'Demo extraction';
  if (aiEnabled) pill.classList.add('is-ai');
}).catch(() => {
  document.querySelector('#mode-label').textContent = 'Local mode';
});

loadSamples().then(analyze).catch((error) => {
  resultsContent.innerHTML = `<div class="error-message">Could not load sample transcripts: ${escapeHtml(error.message)}</div>`;
});