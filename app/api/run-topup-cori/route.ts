import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface CoriRow {
  CompanyCode:  string;
  EmployeeNo:   string;
  Action:       string;
  PeriodMonth:  number;
  PeriodYear:   number;
  Amount:       number;
  LBPraTopUp:   number;
  LBAfterTopUp: number;
  Note:         string;
}

// POST /api/run-topup-cori
// Body: { date?: string }  — optional date override (ISO 8601), defaults to NOW()
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { date } = body as { date?: string };

    const rows = date
      ? await query<CoriRow>(`SELECT * FROM "fn_topup_AL_Corinthian_daily"($1::timestamptz)`, [date])
      : await query<CoriRow>(`SELECT * FROM "fn_topup_AL_Corinthian_daily"()`);

    const summary = {
      GRANT12:  rows.filter((r) => r.Action === 'GRANT12').length,
      MONTHLY1: rows.filter((r) => r.Action === 'MONTHLY+1').length,
      CI5YEARS: rows.filter((r) => r.Action === 'CI_5YEARS').length,
      Total:    rows.length,
    };

    return NextResponse.json({ ok: true, rows, summary });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
