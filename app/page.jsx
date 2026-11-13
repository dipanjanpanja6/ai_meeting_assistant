import Script from 'next/script';

export default function Home() {
  return (
    <>
      <Script src="/app.js" strategy="afterInteractive" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Minutes home"><span className="brand-mark">m</span><span>minutes<span className="brand-period">.</span></span></a>
        <div className="topbar-right">
          <span className="product-label">AI meeting assistant</span>
          <span className="mode-pill" id="mode-pill"><span className="mode-dot" /><span id="mode-label">Checking mode</span></span>
        </div>
      </header>

      <main className="page-shell">
        <div className="page-heading">
          <div>
            <p className="eyebrow">TRANSCRIPT → CLARITY</p>
            <h1>Make the meeting count.</h1>
            <p className="subtitle">Decisions, owners, and next steps, grounded in what was actually said.</p>
          </div>
          <div className="heading-note"><span className="note-mark">✳</span><span>Evidence-backed<br />meeting notes</span></div>
        </div>

        <section className="workspace" aria-label="Meeting transcript analyzer">
          <aside className="transcript-panel">
            <div className="panel-heading">
              <div><p className="section-kicker">01 / INPUT</p><h2>Transcript</h2></div>
              <label className="sample-picker">Examples <select id="sample-select" aria-label="Choose an example transcript" /></label>
            </div>
            <div className="transcript-meta"><span id="transcript-category">SALES</span><span id="transcript-duration">28 min</span></div>
            <textarea id="transcript-input" spellCheck="false" aria-label="Meeting transcript" placeholder="Paste a meeting transcript here…" />
            <div className="input-footer">
              <span id="word-count">0 words</span>
              <button className="clear-button" id="clear-button" type="button">Clear</button>
            </div>
            <button className="analyze-button" id="analyze-button" type="button"><span className="button-icon">↗</span><span id="analyze-label">Extract meeting notes</span><span className="button-arrow">→</span></button>
            <p className="privacy-note"><span className="lock-icon">●</span> Transcript is processed on this server and not stored.</p>
          </aside>

          <section className="results-panel" aria-live="polite" aria-label="Structured meeting notes">
            <div className="results-header">
              <div><p className="section-kicker">02 / OUTPUT</p><h2>Meeting notes</h2></div>
              <div className="result-actions"><button className="icon-button" id="copy-button" type="button" title="Copy as JSON" aria-label="Copy as JSON" disabled>⧉</button><button className="icon-button" id="download-button" type="button" title="Download JSON" aria-label="Download JSON" disabled>↓</button></div>
            </div>
            <div className="results-content" id="results-content">
              <div className="empty-state"><span className="empty-glyph">✳</span><p>Your meeting, made clear.</p><span>Analysis will appear here with evidence for every decision and action.</span></div>
            </div>
          </section>
        </section>
        <footer className="page-footer"><span>Built for the details that matter.</span><span>Structured output · Evidence first · No invented owners</span></footer>
      </main>
      <div className="toast" id="toast" role="status" aria-live="polite" />
    </>
  );
}