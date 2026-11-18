import { getRuntime, getStats, getUptimeSeconds } from '../../lib/runtime.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const { settings, index } = getRuntime();
    return Response.json({
      status: 'ok',
      mode: settings.provider,
      model: settings.provider === 'ai' ? settings.model : 'demo-research',
      corpus_files: index.sources.length,
      uptime_s: getUptimeSeconds(),
      ...getStats(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ status: 'error', message: error.message }, { status: 503 });
  }
}
