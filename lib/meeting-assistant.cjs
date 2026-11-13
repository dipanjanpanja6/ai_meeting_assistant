require('dotenv').config();

const schema = require('../structured-output.schema.json');
const systemPrompt = `You are a precise meeting-minutes assistant. Extract only information supported by the transcript. A topic being discussed is not a decision; include a key decision only when participants explicitly decide, agree, approve, select, or commit to a direction. An action item must be explicitly assigned, requested, or promised. Never infer an owner or deadline: use null when absent. Preserve short transcript evidence for every decision and action. Keep open questions genuinely unresolved. Return JSON matching the provided schema.`;

function getLlmConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    apiKey: process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY,
  };
}

function isAIEnabled() {
  return Boolean(getLlmConfig().apiKey);
}

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
          : requestSubject?.[1] || requestMatch?.[1] || (/^(?:(?:yes|sure|okay|ok|right|absolutely)[,;:]?\s+)?(?:i'll|i will)\b/i.test(statement) ? speaker : null);
        const taskText = statement
          .replace(/^[A-Z][a-z]+\s+will\s+/i, '')
          .replace(/^[A-Z][a-z]+,?\s+(?:can you|could you|will you)\s+/i, '')
          .replace(/^(?:yes|sure|okay|ok|right|absolutely)[,;:]?\s+/i, '')
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

async function analyzeWithLLM(transcript) {
  const { baseUrl, model, apiKey } = getLlmConfig();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
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

async function analyzeTranscript(transcript) {
  if (!isAIEnabled()) return { result: parseTranscript(transcript), mode: 'demo' };
  return { result: await analyzeWithLLM(transcript), mode: 'ai' };
}

module.exports = { analyzeTranscript, isAIEnabled, parseTranscript };