import { neon } from '@neondatabase/serverless';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const USER_ID = 'default';

export async function GET(request: Request) {
  const sql = neon(process.env.DATABASE_URL!);
  const encoder = new TextEncoder();

  // TransformStream lets us write from the async loop and return the readable
  // side immediately — the HTTP response starts flowing before the loop ends.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const emit = async (chunk: string) => {
    try {
      await writer.write(encoder.encode(chunk));
    } catch {
      // Client disconnected — stop trying to write
    }
  };

  // Background loop: runs for the lifetime of the SSE connection.
  (async () => {
    let lastVersion = -1;
    let lastHeartbeat = Date.now();

    // Push current state immediately on connect so the client is in sync right away.
    try {
      const rows = await sql`
        SELECT state, version FROM budget_state WHERE user_id = ${USER_ID} LIMIT 1
      `;
      if (rows.length > 0) {
        lastVersion = Number(rows[0].version);
        await emit(
          `data: ${JSON.stringify({ version: lastVersion, state: rows[0].state })}\n\n`
        );
        lastHeartbeat = Date.now();
      }
    } catch {
      // DB unavailable on first connect — will retry in the loop below
    }

    while (!request.signal.aborted) {
      // Wait 1.5 s between polls
      await new Promise<void>(r => setTimeout(r, 1500));
      if (request.signal.aborted) break;

      // SSE comment ping every 25 s keeps the connection alive through proxies
      if (Date.now() - lastHeartbeat > 25_000) {
        await emit(': ping\n\n');
        lastHeartbeat = Date.now();
      }

      try {
        // Lightweight check — version only
        const vrows = await sql`
          SELECT version FROM budget_state WHERE user_id = ${USER_ID} LIMIT 1
        `;
        if (!vrows.length) continue;

        const version = Number(vrows[0].version);
        if (version === lastVersion) continue; // Nothing changed

        // Version bumped — fetch full state and push to all connected clients
        const srows = await sql`
          SELECT state FROM budget_state WHERE user_id = ${USER_ID} LIMIT 1
        `;
        if (srows.length > 0) {
          lastVersion = version;
          lastHeartbeat = Date.now();
          await emit(
            `data: ${JSON.stringify({ version, state: srows[0].state })}\n\n`
          );
        }
      } catch {
        // Transient DB error — try again next cycle
      }
    }

    try {
      await writer.close();
    } catch {
      // Already closed
    }
  })();

  return new Response(readable as ReadableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering when behind a proxy
    },
  });
}
