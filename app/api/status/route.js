import meetingAssistant from '../../../lib/meeting-assistant.cjs';

export async function GET() {
  return Response.json({ aiEnabled: meetingAssistant.isAIEnabled() });
}