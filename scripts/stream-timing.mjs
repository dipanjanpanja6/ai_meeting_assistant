#!/usr/bin/env node
// Print when each SSE event arrives, relative to the request start.
// Use it against the public URL to prove the host is not buffering the stream:
//   node scripts/stream-timing.mjs https://your-host "How do batteries help solar?"
// If events are spread over seconds, the stream is live; if they all land at once, something buffers.

const [base = 'http://localhost:3000', question = 'How do batteries help integrate solar power into the grid?'] = process.argv.slice(2);
const url = `${base.replace(/\/+$/, '')}/ask?q=${encodeURIComponent(question)}`;
const t0 = performance.now();
const ms = () => `${Math.round(performance.now() - t0)}`.padStart(6);

const res = await fetch(url, { headers: { Accept: 'text/event-stream' } });
console.log(`${ms()} ms  HTTP ${res.status} ${res.headers.get('content-type')}`);
const decoder = new TextDecoder();
let buffer = '';
let tokens = 0;
const firsts = {};
for await (const chunk of res.body) {
  buffer += decoder.decode(chunk, { stream: true });
  let cut;
  while ((cut = buffer.indexOf('\n\n')) !== -1) {
    const block = buffer.slice(0, cut);
    buffer = buffer.slice(cut + 2);
    const event = block.match(/^event: (.+)$/m)?.[1];
    if (!event) continue;
    const data = block.match(/^data: (.+)$/m)?.[1] || '';
    firsts[event] ??= ms().trim();
    if (event === 'token') {
      tokens += 1;
      if (tokens <= 3 || tokens % 25 === 0) console.log(`${ms()} ms  token #${tokens}  ${data.slice(0, 60)}`);
    } else {
      console.log(`${ms()} ms  ${event.padEnd(9)} ${data.slice(0, 110)}`);
    }
  }
}
console.log(`\nfirst progress at ${firsts.progress} ms, first token at ${firsts.token} ms, done at ${firsts.done} ms, ${tokens} tokens`);
