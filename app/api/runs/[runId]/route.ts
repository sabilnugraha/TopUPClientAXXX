import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params;

  try {
    // Run detail errors (LeaveTopUpRunDetail)
    const details = await query<Record<string, unknown>>(
      `SELECT
        d."CompanyCode",
        d."EmployeeNo",
        d."LeaveCode",
        d."ActionType",
        d."Status",
        d."Reason",
        d."LB_Before",
        d."LBB_Before",
        d."LB_After",
        d."LBB_After",
        d."ActionDate",
        d."ErrorMessage"
      FROM "LeaveTopUpRunDetail" d
      WHERE d."RunID" = $1
      ORDER BY d."CompanyCode", d."EmployeeNo", d."LeaveCode"`,
      [runId]
    );

    // History topup untuk run ini (pakai RunDate dari header)
    const history = await query<Record<string, unknown>>(
      `SELECT
        h."CompanyCode",
        h."EmployeeNo",
        p."FullName",
        h."LeaveType",
        h."PeriodMonth",
        h."PeriodYear",
        h."LBPraTopUp",
        h."LBBPraTopUp",
        h."LBAfterTopUp",
        h."LBBAfterTopUp",
        h."ActionDate",
        h."ActionType"
      FROM "HistoryTopUpLeaves" h
      JOIN "LeaveTopUpRun" r ON r."RunID" = $1
      LEFT JOIN "PeMaster" p
        ON p."CompanyCode" = h."CompanyCode"
       AND p."EmployeeNo"  = h."EmployeeNo"
      WHERE h."CompanyCode" = 'APLL'
        AND h."ActionDate"::date = r."RunDate"
      ORDER BY h."CompanyCode", h."EmployeeNo", h."LeaveType", h."ActionType"`,
      [runId]
    );

    return NextResponse.json({ details, history });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
