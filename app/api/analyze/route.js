import meetingAssistant from '../../../lib/meeting-assistant.cjs';

export async function POST(request) {
  let body;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 1_000_000) {
      return Response.json({ error: 'Transcript is too large.' }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (typeof body?.transcript !== 'string' || !body.transcript.trim()) {
    return Response.json({ error: 'Add a transcript before analyzing.' }, { status: 400 });
  }

  try {
    return Response.json(await meetingAssistant.analyzeTranscript(body.transcript));
  } catch (error) {
    return Response.json({ error: error.message || 'Analysis failed.' }, { status: 500 });
  }
}