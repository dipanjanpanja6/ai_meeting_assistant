// Shared test setup: force the offline demo model, no token delay, regardless of the shell env.
process.env.LLM_PROVIDER = 'demo';
process.env.DEMO_TOKEN_DELAY_MS = '0';

/** Parse a server-sent-events body into [{ event, id, data }] (comments and `retry` skipped). */
export function parseSSE(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    const fields = {};
    for (const line of block.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const i = line.indexOf(':');
      fields[line.slice(0, i)] = line.slice(i + 1).trimStart();
    }
    if (fields.event) events.push({ event: fields.event, id: Number(fields.id), data: JSON.parse(fields.data) });
  }
  return events;
}

export const askUrl = (q) => `http://localhost/ask?q=${encodeURIComponent(q)}`;
