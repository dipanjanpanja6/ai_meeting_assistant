'use client';

import { Fragment, useEffect, useRef, useState } from 'react';

const NODES = [
  { id: 'plan', label: 'Plan', hint: 'Break the question into sub-questions' },
  { id: 'search', label: 'Search', hint: 'Look up passages for each sub-question' },
  { id: 'synthesise', label: 'Synthesise', hint: 'Write the answer from the passages' },
  { id: 'cite', label: 'Cite', hint: 'Attach source file names' },
];

const EXAMPLES = [
  'How do batteries help integrate solar power into the grid?',
  'Is green hydrogen or a heat pump better for heating homes?',
  'What limits the growth of wind and solar?',
];

const freshSteps = () => Object.fromEntries(NODES.map((n) => [n.id, { status: 'waiting', label: 'waiting' }]));
const freshMetrics = () => ({ status: 'idle', firstProgress: null, firstToken: null, tokens: 0, total: null });

/** Render "[3]" citation markers in the finished answer as highlighted refs. */
function AnswerText({ text }) {
  return text.split(/(\[\d+\])/g).map((part, i) =>
    /^\[\d+\]$/.test(part) ? <span key={i} className="ref">{part}</span> : <Fragment key={i}>{part}</Fragment>);
}

export default function Home() {
  const [question, setQuestion] = useState('');
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

  useEffect(() => () => esRef.current?.close(), []);
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
          : { status: 'finished', label: `done in ${d.duration_ms} ms` },
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

  return (
    <main className="shell">
      <header className="head">
        <h1>Streaming Research Assistant</h1>
        <p>Answers come only from a local corpus of 20 energy-transition notes. Progress and the answer stream live over server-sent events from <code>GET /ask</code>.</p>
      </header>

      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <input
          type="text" value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a research question…" maxLength={500} aria-label="Research question" required
        />
        <button className="primary" type="submit" disabled={running}>Ask</button>
        <button className="danger" type="button" onClick={stop} disabled={!running}>Stop</button>
      </form>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" disabled={running} onClick={() => ask(ex)}>{ex}</button>
        ))}
      </div>

      <div className="metrics" aria-live="polite">
        <span>status <b>{metrics.status}</b></span>
        <span>first progress <b>{metrics.firstProgress || '–'}</b></span>
        <span>first token <b>{metrics.firstToken || '–'}</b></span>
        <span>tokens <b>{metrics.tokens}</b></span>
        <span>total <b>{metrics.total || '–'}</b></span>
      </div>

      <div className="grid">
        <section className="panel" aria-label="Progress">
          <h2>Progress</h2>
          <ol className="steps">
            {NODES.map((n) => (
              <li key={n.id} className={steps[n.id].status}>
                <span className="step-name">{n.label}</span>
                <span className="step-state">{steps[n.id].label}</span>
                <div className="step-detail">
                  {n.id === 'plan' && subQuestions.length > 0 ? (
                    <ul>{subQuestions.map((s) => <li key={s}>{s}</li>)}</ul>
                  ) : n.id === 'search' && retrievals.length > 0 ? (
                    <>
                      {retrievals.map((r) => (
                        <div key={r.sub_question} className="hit">
                          “{r.sub_question}” → {r.hits.map((h) => <span key={h.source} className="chip">{h.source}</span>)}
                        </div>
                      ))}
                      {kept && <div className="hit">{kept.length} passages from {keptSources.length} files kept</div>}
                    </>
                  ) : n.hint}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel" aria-label="Answer">
          <h2>Answer</h2>
          <div className={`answer ${answer ? '' : 'empty'} ${running && answer ? 'streaming' : ''}`} aria-live="polite">
            {answer ? (finishedAnswer ? <AnswerText text={answer} /> : answer) : 'The answer will appear here as it is written.'}
          </div>
          {citations.length > 0 && (
            <ol className="sources">
              {citations.map((c) => (
                <li key={c.source}><code>{c.source}</code> {c.title} <span className="ref">[{c.refs.join('][')}]</span></li>
              ))}
            </ol>
          )}
          {notice && <p className="notice">{notice}</p>}
        </section>
      </div>

      <details className="raw">
        <summary>Raw event stream ({log.length} events)</summary>
        <div className="log" ref={logRef}>
          {log.map((e, i) => (
            <div key={i} className={`ev ev-${e.type}`}>{e.t.padStart(8)}  event: {e.type.padEnd(9)} data: {e.data}</div>
          ))}
        </div>
      </details>
    </main>
  );
}
