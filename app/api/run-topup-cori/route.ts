import { NextResponse } from 'next/server';
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
// Calls fn_topup_AL_Corinthian_daily() — uses NOW() internally
export async function POST() {
  try {
    const rows = await query<CoriRow>(`SELECT * FROM "fn_topup_AL_Corinthian_daily"()`);

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
