import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface RunResult {
  company: string;
  runId: string | null;
  summary: Record<string, unknown> | null;
  error?: string;
}

async function runFunction(fnName: string, date?: string): Promise<{ runId: string | null; error?: string }> {
  try {
    const sql = date
      ? `SELECT ${fnName}($1::timestamp) AS run_id`
      : `SELECT ${fnName}() AS run_id`;
    const rows = await query<{ run_id: string }>(sql, date ? [date] : []);
    return { runId: rows[0]?.run_id ?? null };
  } catch (err) {
    return { runId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { date, company } = body as { date?: string; company?: string };

    const results: RunResult[] = [];

    // Tentukan fungsi mana yang dijalankan
    const runAll = !company || company === 'ALL';

    // ITK/SRH/III — fn_daily_topup_leave
    if (runAll || company === 'ITK') {
      const { runId, error } = await runFunction('fn_daily_topup_leave', date);
      let summary = null;
      if (runId) {
        const rows = await query<Record<string, unknown>>(
          `SELECT * FROM "LeaveTopUpRun" WHERE "RunID" = $1`, [runId]
        );
        summary = rows[0] ?? null;
      }
      results.push({ company: 'ITK/SRH/III', runId, summary, error });
    }

    // APLL — fn_daily_topup_leave_apll
    if (runAll || company === 'APLL') {
      const { runId, error } = await runFunction('fn_daily_topup_leave_apll', date);
      let summary = null;
      if (runId) {
        const rows = await query<Record<string, unknown>>(
          `SELECT * FROM "LeaveTopUpRun" WHERE "RunID" = $1`, [runId]
        );
        summary = rows[0] ?? null;
      }
      results.push({ company: 'APLL', runId, summary, error });
    }

    const hasError = results.some((r) => r.error);
    return NextResponse.json(
      { results, ok: !hasError },
      { status: hasError ? 207 : 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
