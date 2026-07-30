import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { LOGW_COMPANY } from '@/lib/scenarios-logw';

interface LogwRow {
  EmployeeNo:    string;
  FullName:      string;
  LevelCode:     string | null;
  ActionType:    string;
  PeriodMonth:   number;
  PeriodYear:    number;
  LBPraTopUp:    number | null;
  LBBPraTopUp:   number | null;
  LBAfterTopUp:  number | null;
  LBBAfterTopUp: number | null;
  Delta:         number;
}

// POST /api/run-topup-logw
// Body: { month?: number, year?: number, companyCode?: string }
//
// TopUpLOGWINV2 returns void, so after running we read back the rows it just
// wrote to HistoryTopUpLeaves for that period.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { month, year, companyCode } = body as {
      month?: number; year?: number; companyCode?: string;
    };

    const now      = new Date();
    const pMonth   = Number(month) || now.getMonth() + 1;
    const pYear    = Number(year)  || now.getFullYear();
    const pCompany = companyCode || LOGW_COMPANY;

    if (pMonth < 1 || pMonth > 12) {
      return NextResponse.json({ error: 'Bulan harus 1–12' }, { status: 400 });
    }

    // CompanyCode di-hardcode di dalam function, jadi param cuma bulan + tahun.
    await query(`SELECT public."TopUpLOGWINV2"($1::int, $2::int)`, [pMonth, pYear]);

    const rows = await query<LogwRow>(
      `SELECT
         h."EmployeeNo",
         pm."FullName",
         pl."LevelCode",
         h."ActionType",
         h."PeriodMonth",
         h."PeriodYear",
         h."LBPraTopUp",
         h."LBBPraTopUp",
         h."LBAfterTopUp",
         h."LBBAfterTopUp",
         (COALESCE(h."LBAfterTopUp",0)  - COALESCE(h."LBPraTopUp",0))
       + (COALESCE(h."LBBAfterTopUp",0) - COALESCE(h."LBBPraTopUp",0)) AS "Delta"
       FROM "HistoryTopUpLeaves" h
       LEFT JOIN "PeMaster" pm
         ON pm."CompanyCode" = h."CompanyCode" AND pm."EmployeeNo" = h."EmployeeNo"
       LEFT JOIN "PeMasterLevel" pl
         ON pl."CompanyCode" = h."CompanyCode" AND pl."EmployeeNo" = h."EmployeeNo"
        AND pl."LevelType" = '3'
       WHERE h."CompanyCode" = $1
         AND h."LeaveType"   = 'AL'
         AND h."PeriodYear"  = $2
         AND h."PeriodMonth" = $3
       ORDER BY h."ActionType", h."EmployeeNo"`,
      [pCompany, pYear, pMonth]
    );

    const countBy = (t: string) => rows.filter((r) => r.ActionType === t).length;
    const summary = {
      TOPUP:     countBy('TOPUP'),
      ROLLOVER:  countBy('ROLLOVER'),
      Q4_CARRY:  countBy('Q4_CARRY'),
      CLEAR_APR: countBy('CLEAR_APR'),
      HariCair:  rows
        .filter((r) => r.ActionType === 'TOPUP')
        .reduce((a, r) => a + Number(r.Delta ?? 0), 0),
      Total:     rows.length,
    };

    return NextResponse.json({
      ok: true,
      companyCode: pCompany,
      periodMonth: pMonth,
      periodYear:  pYear,
      rows,
      summary,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
