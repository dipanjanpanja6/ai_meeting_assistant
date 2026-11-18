'use client';

import { Fragment, useEffect, useRef, useState } from 'react';

const NODES = [
  { id: 'plan', label: 'Plan', hint: 'Break the question into sub-questions' },
  { id: 'search', label: 'Search', hint: 'Look up passages for each sub-question' },
  { id: 'synthesise', label: 'Synthesise', hint: 'Write the answer from the passages' },
  { id: 'cite', label: 'Cite', hint: 'Attach source file names' },
];

const EXAMPLES = [
  { label: 'Batteries & solar', q: 'How do batteries help integrate solar power into the grid?' },
  { label: 'Hydrogen vs heat pumps', q: 'Is green hydrogen or a heat pump better for heating homes?' },
  { label: 'Limits of renewables', q: 'What limits the growth of wind and solar?' },
  { label: 'Critical minerals', q: 'Which minerals does the energy transition depend on, and what are the risks?' },
];

const freshSteps = () => Object.fromEntries(NODES.map((n) => [n.id, { status: 'waiting', label: 'waiting' }]));
const freshMetrics = () => ({ status: 'idle', firstProgress: null, firstToken: null, tokens: 0, total: null });

/** Render "[3]" citation markers in the finished answer as highlighted refs. */
function AnswerText({ text }) {
  return text.split(/(\[\d+\])/g).map((part, i) =>
    /^\[\d+\]$/.test(part) ? <span key={i} className="ref">{part}</span> : <Fragment key={i}>{part}</Fragment>);
}

export default function Home() {
  const [question, setQuestion] = useState(EXAMPLES[0].q);
  const [mode, setMode] = useState(null);
  const [steps, setSteps] = useState(freshSteps);
  const [subQuestions, setSubQuestions] = useState([]);
  const [retrievals, setRetrievals] = useState([]);
  const [kept, setKept] = useState(null);
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState([]);
  const [metrics, setMetrics] = useState(freshMetrics);
  const [notice, setNotice] = useState('');
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [finishedAnswer, setFinishedAnswer] = useState(false);
  const esRef = useRef(null);
  const t0Ref = useRef(0);
  const logRef = useRef(null);

  const elapsed = () => `${Math.round(performance.now() - t0Ref.current)} ms`;

  useEffect(() => {
    fetch('/health').then((r) => r.json()).then(setMode).catch(() => setMode({ status: 'error' }));
    const q = new URLSearchParams(window.location.search).get('q'); // shareable link: /?q=...
    if (q) ask(q);
    return () => esRef.current?.close();
  }, []);
  useEffect(() => {
    const el = logRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
  }, [log]);

  function close(status) {
    esRef.current?.close(); // closing also stops EventSource from auto-reconnecting and re-asking
    esRef.current = null;
    setRunning(false);
    setMetrics((m) => ({ ...m, status, total: elapsed() }));
  }

  function markRunning(status, label) {
    setSteps((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.status === 'running' ? { status, label } : v])));
  }

  function ask(q) {
    const text = q.trim();
    if (!text) return;
    esRef.current?.close();
    setQuestion(text);
    setSteps(freshSteps());
    setSubQuestions([]);
    setRetrievals([]);
    setKept(null);
    setAnswer('');
    setCitations([]);
    setNotice('');
    setLog([]);
    setFinishedAnswer(false);
    setMetrics({ ...freshMetrics(), status: 'connecting' });
    setRunning(true);
    t0Ref.current = performance.now();

    const es = new EventSource(`/ask?q=${encodeURIComponent(text)}`);
    esRef.current = es;
    let done = false;
    const on = (type, handler) => es.addEventListener(type, (e) => {
      setLog((l) => [...l, { t: elapsed(), type, data: e.data }]);
      handler(JSON.parse(e.data));
    });

    on('run', () => setMetrics((m) => ({ ...m, status: 'running' })));

    on('progress', (d) => {
      setMetrics((m) => (m.firstProgress ? m : { ...m, firstProgress: elapsed() }));
      setSteps((s) => ({
        ...s,
        [d.node]: d.status === 'started'
          ? { status: 'running', label: `started ${d.ts.slice(11, 23)}` }
          : { status: 'finished', label: `${d.duration_ms} ms` },
      }));
    });

    on('retrieval', (d) => setRetrievals((r) => [...r, d]));

    on('update', (d) => {
      if (d.node === 'plan') setSubQuestions(d.data.subQuestions || []);
      if (d.node === 'search') setKept(d.data.passages || []);
    });

    on('token', (d) => {
      setMetrics((m) => ({ ...m, tokens: m.tokens + 1, firstToken: m.firstToken || elapsed() }));
      setAnswer((a) => a + d.text);
    });

    on('done', (d) => {
      done = true;
      if (d.answer) setAnswer(d.answer);
      setCitations(d.citations || []);
      setFinishedAnswer(true);
      close('done');
    });

    on('error', (d) => { // named SSE event sent by the server, not a network error
      done = true;
      setNotice(`Server error: ${d.message}`);
      markRunning('failed', 'failed');
      close('error');
    });

    es.onerror = () => { // network-level failure or the server closed the connection
      if (done || esRef.current !== es) return;
      setNotice('Connection lost before the answer finished.');
      markRunning('failed', 'connection lost');
      close('disconnected');
    };
  }

  function stop() {
    // Closing the EventSource drops the HTTP connection; the server sees it and cancels the run.
    markRunning('cancelled', 'stopped');
    setNotice('Stopped. The server cancelled the run as soon as the connection closed.');
    close('stopped');
  }

  const keptSources = kept ? [...new Set(kept.map((p) => p.source))] : [];
  const isAI = mode?.mode === 'ai';
  const modeLabel = !mode ? 'Checking mode' : mode.status !== 'ok' ? 'Server unavailable' : isAI ? 'AI mode' : 'Demo mode';
  const hasRun = metrics.status !== 'idle';

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Trace home">
          <span className="brand-mark">t</span><span>trace<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          <span className="product-label">Streaming research assistant</span>
          <span className={`mode-pill ${isAI ? 'is-ai' : ''}`} title={mode?.model || ''}>
            <span className="mode-dot" /><span>{modeLabel}</span>
          </span>
        </div>
      </header>

      <main className="page-shell">
        <div className="page-heading">
          <div>
            <p className="eyebrow">QUESTION → LIVE ANSWER</p>
            <h1>Watch the research happen.</h1>
            <p className="subtitle">Every step streams as it runs, then the answer arrives word by word, grounded in 20 local notes.</p>
          </div>
          <div className="heading-note"><span className="note-mark">✳</span><span>Server-sent events<br />no blank screens</span></div>
        </div>

        <section className="workspace" aria-label="Research assistant">
          <aside className="input-panel">
            <div className="panel-heading">
              <div><p className="section-kicker">01 / INPUT</p><h2>Question</h2></div>
              <label className="sample-picker">Examples
                <select
                  aria-label="Choose an example question" disabled={running}
                  value={EXAMPLES.find((e) => e.q === question)?.q || ''}
                  onChange={(e) => e.target.value && setQuestion(e.target.value)}
                >
                  <option value="">Custom</option>
                  {EXAMPLES.map((e) => <option key={e.q} value={e.q}>{e.label}</option>)}
                </select>
              </label>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); ask(question); }}>
              <textarea
                id="question-input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500}
                spellCheck="false" aria-label="Research question" placeholder="Ask a question about the energy transition…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!running) ask(question); } }}
              />
              <div className="input-footer">
                <span>{question.length} / 500</span>
                <span>Enter to ask</span>
              </div>
              <div className="button-row">
                <button className="analyze-button" type="submit" disabled={running || !question.trim()}>
                  <span className="button-icon">↗</span><span>{running ? 'Researching…' : 'Ask the corpus'}</span><span className="button-arrow">→</span>
                </button>
                <button className="stop-button" type="button" onClick={stop} disabled={!running} title="Cancel the running answer">■ Stop</button>
              </div>
            </form>

            <div className="progress-block">
              <p className="block-label">Progress <span className="block-hint">GET /ask · live</span></p>
              <ol className="steps">
                {NODES.map((n, i) => (
                  <li key={n.id} className={steps[n.id].status}>
                    <div className="step-head">
                      <span className="section-number">0{i + 1}</span>
                      <span className="step-name">{n.label}</span>
                      <span className="step-state">{steps[n.id].label}</span>
                    </div>
                    <div className="step-detail">
                      {n.id === 'plan' && subQuestions.length > 0 ? (
                        <ul className="text-list">{subQuestions.map((s) => <li key={s}>{s}</li>)}</ul>
                      ) : n.id === 'search' && retrievals.length > 0 ? (
                        <>
                          {retrievals.map((r) => (
                            <div key={r.sub_question} className="hit">
                              <span className="hit-q">{r.sub_question}</span>
                              <span>{r.hits.map((h) => <span key={h.source} className="chip">{h.source}</span>)}</span>
                            </div>
                          ))}
                          {kept && <div className="hit-total">{kept.length} passages from {keptSources.length} files kept</div>}
                        </>
                      ) : n.hint}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          <section className="results-panel" aria-label="Answer">
            <div className="results-header">
              <div><p className="section-kicker">02 / OUTPUT</p><h2>Answer</h2></div>
              <div className="metrics" aria-live="polite">
                <span><strong>{metrics.firstProgress || '–'}</strong>first progress</span>
                <span><strong>{metrics.firstToken || '–'}</strong>first token</span>
                <span><strong>{metrics.tokens}</strong>tokens</span>
                <span><strong>{metrics.total || '–'}</strong>total</span>
              </div>
            </div>

            <div className="results-content">
              {!hasRun ? (
                <div className="empty-state">
                  <span className="empty-glyph">✳</span>
                  <p>Ask, and watch it think.</p>
                  <span>Progress fills in on the left as each step runs; the answer streams here with its sources.</span>
                </div>
              ) : (
                <>
                  <div className={`summary-block status-${metrics.status}`}>
                    <p className="block-label">
                      <span className={`status-dot ${metrics.status}`} />
                      {metrics.status === 'done' ? 'Answer' : metrics.status === 'stopped' ? 'Stopped' : running ? 'Writing' : metrics.status}
                    </p>
                    <div className={`answer ${running && answer ? 'streaming' : ''}`} aria-live="polite">
                      {answer
                        ? (finishedAnswer ? <AnswerText text={answer} /> : answer)
                        : <span className="answer-waiting">{running ? 'Planning and searching… the first words appear once the passages are in.' : 'No answer text was produced.'}</span>}
                    </div>
                  </div>

                  {citations.length > 0 && (
                    <div className="result-section">
                      <p className="result-section-title"><span className="section-number">SRC</span>Sources<span className="count">{citations.length}</span></p>
                      <div className="note-list">
                        {citations.map((c) => (
                          <div key={c.source} className="note-item">
                            <div className="note-main">{c.title}</div>
                            <div className="note-meta">
                              <span><strong>File</strong> <code>{c.source}</code></span>
                              <span><strong>Cited as</strong> <span className="ref">[{c.refs.join('][')}]</span></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {notice && <div className="error-message">{notice}</div>}
                </>
              )}
            </div>

            <details className="raw">
              <summary>Raw event stream <span className="count">{log.length}</span></summary>
              <div className="log" ref={logRef}>
                {log.length === 0 && <div className="ev">No events yet.</div>}
                {log.map((e, i) => (
                  <div key={i} className={`ev ev-${e.type}`}>{e.t.padStart(8)}  event: {e.type.padEnd(9)} data: {e.data}</div>
                ))}
              </div>
            </details>
          </section>
        </section>

        <footer className="page-footer">
          <span>Built so users never stare at a blank screen.</span>
          <span>plan · search · synthesise · cite · streamed over SSE</span>
        </footer>
      </main>
    </>
  );
}
