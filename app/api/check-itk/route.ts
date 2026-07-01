import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/check-itk — cek apakah ITK/SRH/III sudah tertopup hari ini
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const runs = await query<Record<string, unknown>>(
      `SELECT "RunID","RunDate","RunTime","CompanyCode",
              "TotalEmployeesTarget","TopUpSuccess","TopUpFailed",
              "CarrySuccess","CarryFailed","ResetSuccess","ResetFailed",
              "Notes"
       FROM "LeaveTopUpRun"
       WHERE "RunDate"::date = $1
         AND "CompanyCode" IN ('ITK','SRH','III')
       ORDER BY "RunDate" DESC, "RunTime" DESC`,
      [today]
    );

    return NextResponse.json({
      date: today,
      ran: runs.length > 0,
      runs,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/check-itk — jalankan fn_daily_topup_leave manual
export async function POST() {
  try {
    const rows = await query<{ run_id: string }>(
      `SELECT fn_daily_topup_leave() AS run_id`
    );
    const runId = rows[0]?.run_id ?? null;

    if (!runId) {
      return NextResponse.json({ error: 'Tidak ada run_id yang dikembalikan' }, { status: 500 });
    }

    const summary = await query<Record<string, unknown>>(
      `SELECT * FROM "LeaveTopUpRun" WHERE "RunID" = $1`, [runId]
    );

    return NextResponse.json({ ok: true, runId, summary: summary[0] ?? null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
