import { getRuntime, getStats } from './runtime.js';
import { streamResearch } from './streaming.js';

// Every header that stops a proxy or CDN from holding the stream back until it ends.
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // nginx (and proxies that copy its convention)
};

export function formatEvent(event, data, id) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Build the GET /ask handler. `getGraph` is injectable so tests can use their own model.
 *
 * A disconnect arrives two ways: `request.signal` aborts, or the response stream is cancelled.
 * Both abort the same controller, whose signal is passed into the graph run, so the in-flight
 * LLM request is cancelled too and no tokens are generated (or paid for) after the client leaves.
 */
export function createAskHandler({ getGraph = () => getRuntime().graph, pingMs = 10_000, log = console } = {}) {
  return async function GET(request) {
    const question = (new URL(request.url).searchParams.get('q') || '').trim();
    if (!question) return Response.json({ error: 'Add a question: /ask?q=...' }, { status: 400 });
    if (question.length > 500) return Response.json({ error: 'Question is too long (max 500 chars).' }, { status: 400 });

    const graph = getGraph();
    const stats = getStats();
    const controller = new AbortController();
    const abort = () => controller.abort(new Error('client disconnected'));
    request.signal?.addEventListener('abort', abort, { once: true });

    const encoder = new TextEncoder();
    let closed = false;
    let sent = 0;

    const stream = new ReadableStream({
      start(ctrl) {
        const write = (text) => {
          if (closed) return;
          try {
            ctrl.enqueue(encoder.encode(text));
          } catch {
            closed = true;
          }
        };
        // `retry` stops EventSource from silently re-asking the question if the connection drops.
        write(': stream open\nretry: 86400000\n\n');
        const ping = setInterval(() => write(': ping\n\n'), pingMs); // keeps idle proxies from timing out

        (async () => {
          stats.active_streams += 1;
          stats.started += 1;
          try {
            for await (const [event, data] of streamResearch(graph, question, { signal: controller.signal })) {
              if (closed) break;
              sent += 1;
              write(formatEvent(event, data, sent));
            }
            if (controller.signal.aborted) throw controller.signal.reason;
            stats.completed += 1;
          } catch (error) {
            if (controller.signal.aborted) {
              stats.cancelled += 1;
              log.info?.(`[ask] client disconnected after ${sent} events; run cancelled (q="${question.slice(0, 60)}")`);
            } else {
              stats.failed += 1;
              log.error?.('[ask] run failed', error);
              write(formatEvent('error', { message: error?.message || 'Research run failed.' }, sent + 1));
            }
          } finally {
            clearInterval(ping);
            stats.active_streams -= 1;
            request.signal?.removeEventListener('abort', abort);
            if (!closed) {
              closed = true;
              try { ctrl.close(); } catch { /* already closed */ }
            }
          }
        })();
      },
      cancel() {
        closed = true;
        abort();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  };
}
