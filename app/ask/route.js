import { createAskHandler } from '../../lib/sse.js';

// Never prerender or cache: every request is a live event stream.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = createAskHandler();
