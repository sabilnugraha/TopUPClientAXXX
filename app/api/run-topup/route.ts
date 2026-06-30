import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date } = body as { date?: string };

    let sql: string;
    let params: unknown[];

    if (date) {
      // Test mode: jalankan dengan tanggal tertentu
      sql = `SELECT fn_daily_topup_leave_apll($1::timestamp) AS run_id`;
      params = [date];
    } else {
      // Production mode: pakai now() Jakarta
      sql = `SELECT fn_daily_topup_leave_apll() AS run_id`;
      params = [];
    }

    const rows = await query<{ run_id: string }>(sql, params);
    const runId = rows[0]?.run_id;

    if (!runId) {
      return NextResponse.json({ error: 'No run_id returned' }, { status: 500 });
    }

    // Ambil summary run header
    const summaryRows = await query<Record<string, unknown>>(
      `SELECT * FROM "LeaveTopUpRun" WHERE "RunID" = $1`,
      [runId]
    );

    return NextResponse.json({ runId, summary: summaryRows[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
