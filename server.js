const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const publicRoot = path.join(root, 'public');
const port = Number(process.env.PORT || 3000);
const schema = require('./structured-output.schema.json');

const systemPrompt = `You are a precise meeting-minutes assistant. Extract only information supported by the transcript. A topic being discussed is not a decision; include a key decision only when participants explicitly decide, agree, approve, select, or commit to a direction. An action item must be explicitly assigned, requested, or promised. Never infer an owner or deadline: use null when absent. Preserve short transcript evidence for every decision and action. Keep open questions genuinely unresolved. Return JSON matching the provided schema.`;

function parseTranscript(transcript) {
  const lines = transcript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyDecisions = [];
  const actionItems = [];
  const openQuestions = [];
  const followUpItems = [];
  const decisionCue = /\b(?:decided|agreed|approved|selected|chose|choose|go with|move forward with)\b/i;
  const commitmentCue = /\b(?:i'll|i will|we'll|we will|[A-Z][a-z]+ will|please|can you|could you|will you|action item|assigned to)\b/i;
  const taskCue = /\b(?:send|prepare|draft|schedule|share|deliver|complete|review|compare|confirm|update|book|create|add|run|publish|call|check|investigate|reach out|follow up)\b/i;

  for (const line of lines) {
    const match = line.match(/^([^:]{1,40}):\s*(.+)$/);
    const speaker = match?.[1].trim() || null;
    const statements = (match?.[2].trim() || line).split(/(?<=[.!?])\s+(?=[A-Z])/);

    for (const statement of statements) {
      const negatedDecision = /\b(?:not|never|haven't|hasn't|have not|has not|no)\s+(?:yet\s+)?(?:decided|agreed|approved|selected|chosen)\b/i.test(statement);
      if (decisionCue.test(statement) && !negatedDecision) {
        keyDecisions.push({ decision: statement, evidence: line });
      }

      if (commitmentCue.test(statement) && taskCue.test(statement)) {
        const ownerMatch = statement.match(/\b([A-Z][a-z]+)\s+will\b/);
        const requestSubject = statement.match(/^([A-Z][a-z]+),?\s+(?:can|could|will) you\b/i);
        const requestMatch = statement.match(/\b(?:please|can you|could you|will you)\s+([A-Z][a-z]+)\b/);
        const owner = ownerMatch?.[1] && !/^(?:we|they|i)$/i.test(ownerMatch[1])
          ? ownerMatch[1]
          : requestSubject?.[1] || requestMatch?.[1] || (/^(?:i'll|i will)\b/i.test(statement) ? speaker : null);
        const taskText = statement
          .replace(/^[A-Z][a-z]+\s+will\s+/i, '')
          .replace(/^[A-Z][a-z]+,?\s+(?:can you|could you|will you)\s+/i, '')
          .replace(/^(?:i'll|i will|we'll|we will|please|can you|could you|will you)\s+/i, '')
          .replace(/\bby\s+[^,.!?]+/i, '')
          .replace(/[.!?]+$/, '')
          .trim();
        const deadlineMatch = statement.match(/\bby\s+([^,.!?]+)/i);
        actionItems.push({
          task: taskText || statement,
          owner,
          deadline: deadlineMatch?.[1]?.trim() || null,
          status: 'Pending',
          evidence: line,
        });
      }

      if (statement.includes('?')) openQuestions.push(statement);
      if (/\b(?:follow up|revisit|next step|circle back)\b/i.test(statement)) {
        followUpItems.push(statement);
      }
    }
  }

  const summary = lines.slice(0, 3).map((line) => line.replace(/^[^:]{1,40}:\s*/, '')).join(' ');
  return {
    meetingSummary: summary || 'No transcript content was provided.',
    keyDecisions,
    actionItems,
    openQuestions: [...new Set(openQuestions)],
    followUpItems: [...new Set(followUpItems)],
  };
}

async function analyzeWithOpenAI(transcript) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract structured meeting information from this transcript:\n\n${transcript}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'meeting_minutes', strict: true, schema },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || 'The AI provider returned an error.');
  return JSON.parse(payload.choices[0].message.content);
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function serveStatic(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filePath = path.resolve(publicRoot, `.${requested}`);
  if (!filePath.startsWith(publicRoot + path.sep) && filePath !== path.join(publicRoot, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end('Not found');
      return;
    }
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
    response.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/api/status') {
    sendJson(response, 200, { aiEnabled: Boolean(process.env.OPENAI_API_KEY) });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/analyze') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy();
    });
    request.on('end', async () => {
      try {
        const { transcript } = JSON.parse(body);
        if (typeof transcript !== 'string' || !transcript.trim()) {
          sendJson(response, 400, { error: 'Add a transcript before analyzing.' });
          return;
        }
        const result = process.env.OPENAI_API_KEY
          ? await analyzeWithOpenAI(transcript)
          : parseTranscript(transcript);
        sendJson(response, 200, { result, mode: process.env.OPENAI_API_KEY ? 'ai' : 'demo' });
      } catch (error) {
        sendJson(response, 500, { error: error.message || 'Analysis failed.' });
      }
    });
    return;
  }

  if (request.method === 'GET') return serveStatic(request, response);
  response.writeHead(405).end('Method not allowed');
});

if (require.main === module) {
  server.listen(port, () => console.log(`AI Meeting Assistant running at http://localhost:${port}`));
}

module.exports = { parseTranscript, server };