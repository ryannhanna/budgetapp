import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const USER_ID = 'default';
let initialized = false;

async function ensureTable() {
  if (initialized) return;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    CREATE TABLE IF NOT EXISTS budget_state (
      id         SERIAL PRIMARY KEY,
      user_id    TEXT NOT NULL,
      state      JSONB NOT NULL,
      version    BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS budget_state_user_id_idx
      ON budget_state (user_id)
  `;
  // Add version column if table already exists without it
  await sql`
    ALTER TABLE budget_state ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0
  `;
  initialized = true;
}

const NO_CACHE = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    await ensureTable();
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT state, version FROM budget_state WHERE user_id = ${USER_ID}
    `;
    if (rows.length === 0) return NextResponse.json(null, { headers: NO_CACHE });
    return NextResponse.json(
      { state: rows[0].state, version: Number(rows[0].version) },
      { headers: NO_CACHE }
    );
  } catch (e) {
    console.error('GET /api/budget:', e);
    return NextResponse.json(null, { status: 500, headers: NO_CACHE });
  }
}

export async function PUT(req: Request) {
  try {
    await ensureTable();
    const sql = neon(process.env.DATABASE_URL!);
    const state = await req.json();
    const rows = await sql`
      INSERT INTO budget_state (user_id, state, version, updated_at)
      VALUES (${USER_ID}, ${JSON.stringify(state)}, 1, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET state = EXCLUDED.state, version = budget_state.version + 1, updated_at = NOW()
      RETURNING version
    `;
    return NextResponse.json({ ok: true, version: Number(rows[0].version) });
  } catch (e) {
    console.error('PUT /api/budget:', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
