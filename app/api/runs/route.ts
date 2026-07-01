import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyCode = searchParams.get('companyCode'); // null = semua company

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT
        r."RunID",
        r."RunDate",
        r."RunTime",
        r."PeriodMonth",
        r."PeriodYear",
        r."CompanyCode",
        r."RunBy",
        r."TotalEmployeesTarget",
        r."TotalLeaveRowsTarget",
        r."TopUpSuccess",
        r."TopUpSkipped",
        r."TopUpFailed",
        r."CarrySuccess",
        r."CarrySkipped",
        r."CarryFailed",
        r."ResetSuccess",
        r."ResetSkipped",
        r."ResetFailed",
        r."FiveYearSuccess",
        r."FiveYearSkipped",
        r."FiveYearFailed",
        r."ResetLLSuccess",
        r."ResetLLSkipped",
        r."ResetLLFailed",
        r."Notes"
      FROM "LeaveTopUpRun" r
      ${companyCode ? `WHERE r."CompanyCode" = '${companyCode}'` : ''}
      ORDER BY r."RunDate" DESC, r."RunTime" DESC
      LIMIT 100`
    );
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
