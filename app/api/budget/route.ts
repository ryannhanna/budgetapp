import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

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
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS budget_state_user_id_idx
      ON budget_state (user_id)
  `;
  initialized = true;
}

export async function GET() {
  try {
    await ensureTable();
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT state FROM budget_state WHERE user_id = ${USER_ID}
    `;
    if (rows.length === 0) return NextResponse.json(null);
    return NextResponse.json(rows[0].state);
  } catch (e) {
    console.error('GET /api/budget:', e);
    return NextResponse.json(null, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await ensureTable();
    const sql = neon(process.env.DATABASE_URL!);
    const state = await req.json();
    await sql`
      INSERT INTO budget_state (user_id, state, updated_at)
      VALUES (${USER_ID}, ${JSON.stringify(state)}, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/budget:', e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
