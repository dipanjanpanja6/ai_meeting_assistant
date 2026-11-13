# AI Meeting Assistant Submission

## Submission Checklist

- [x] **GitHub repository:** [ai_meeting_assistant](https://github.com/dipanjanpanja6/ai_meeting_assistant). The `nextjs` branch is published.
- [x] **README:** [README.md](README.md) includes setup, configuration, prompt iterations, testing, evaluation, and deployment notes.
- [x] **Working implementation:** Next.js App Router application with editable transcript input, five selectable examples, structured results, evidence, and JSON export.
- [x] **Meeting transcripts:** Five examples are available in [public/transcripts.json](public/transcripts.json): sales planning, product launch, marketing budget, incident retrospective, and hiring.
- [x] **Structured output schema:** [structured-output.schema.json](structured-output.schema.json) defines the summary, decisions, action items, owners, deadlines, status, evidence, questions, and follow-ups.
- [x] **Prompt iterations:** Documented in [README.md](README.md), from broad summarization through evidence-backed structured extraction.
- [x] **Test cases:** [test/extraction.test.js](test/extraction.test.js) covers discussion-versus-decision, ownership, deadlines, evidence, questions, and follow-ups.
- [x] **Evaluation:** Acceptance checks and demo-parser limitations are described in [README.md](README.md). The fixtures are small examples, not a representative accuracy benchmark.
- [x] **Screenshot:** [public/demo.png](public/demo.png).
- [ ] **Demo video:** Not recorded; the screenshot and live deployment are provided instead.
- [x] **Live URL:** [https://ai-meeting-assistant-wheat-seven.vercel.app](https://ai-meeting-assistant-wheat-seven.vercel.app).

## Decision/Assignment Safeguard

The system keeps discussion separate from decisions and only extracts explicit agreements or commitments. Decisions and action items include transcript evidence; missing owners or deadlines remain unknown instead of being inferred.

## Evaluation Note

Demo mode uses a conservative English phrase matcher and may miss varied wording. AI mode uses the configured NVIDIA endpoint and structured-output schema; review extracted results against their evidence before treating them as final.