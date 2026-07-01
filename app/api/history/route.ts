import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// DELETE /api/history?employeeNo=&leaveType=&periodYear=&periodMonth=&actionType=&companyCode=|companyGroup=
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyCode  = searchParams.get('companyCode')  ?? '';
  const companyGroup = searchParams.get('companyGroup') ?? '';
  const employeeNo   = searchParams.get('employeeNo')   ?? '';
  const leaveType    = searchParams.get('leaveType')    ?? '';
  const periodYear   = searchParams.get('periodYear')   ?? '';
  const periodMonth  = searchParams.get('periodMonth')  ?? '';
  const actionType   = searchParams.get('actionType')   ?? '';

  if (!employeeNo && !leaveType && !periodYear && !periodMonth) {
    return NextResponse.json(
      { error: 'Minimal 1 filter diperlukan (employeeNo / leaveType / periodYear / periodMonth)' },
      { status: 400 }
    );
  }

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (companyCode) {
      conditions.push(`"CompanyCode" = $${idx++}`);
      values.push(companyCode);
    } else if (companyGroup === 'CORI') {
      conditions.push(`"CompanyCode" IN ('CORI','CII')`);
    } else {
      conditions.push(`"CompanyCode" = 'APLL'`);
    }

    if (employeeNo)  { conditions.push(`"EmployeeNo"  = $${idx++}`); values.push(employeeNo); }
    if (leaveType)   { conditions.push(`"LeaveType"   = $${idx++}`); values.push(leaveType); }
    if (periodYear)  { conditions.push(`"PeriodYear"  = $${idx++}`); values.push(Number(periodYear)); }
    if (periodMonth) { conditions.push(`"PeriodMonth" = $${idx++}`); values.push(Number(periodMonth)); }
    if (actionType)  { conditions.push(`"ActionType"  = $${idx++}`); values.push(actionType); }

    const result = await query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM "HistoryTopUpLeaves"
         WHERE ${conditions.join(' AND ')}
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM deleted`,
      values
    );

    return NextResponse.json({ ok: true, deleted: Number(result[0]?.count ?? 0) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyCode  = searchParams.get('companyCode')  ?? '';
  const companyGroup = searchParams.get('companyGroup') ?? '';
  const employeeNo   = searchParams.get('employeeNo')   ?? '';
  const leaveType    = searchParams.get('leaveType')    ?? '';
  const periodMonth  = searchParams.get('periodMonth')  ?? '';
  const periodYear   = searchParams.get('periodYear')   ?? '';

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (companyCode) {
    conditions.push(`h."CompanyCode" = $${idx++}`);
    values.push(companyCode);
  } else if (companyGroup === 'CORI') {
    conditions.push(`h."CompanyCode" IN ('CORI','CII')`);
  } else {
    conditions.push(`h."CompanyCode" = 'APLL'`);
  }

  if (employeeNo) {
    conditions.push(`h."EmployeeNo" ILIKE $${idx++}`);
    values.push(`%${employeeNo}%`);
  }
  if (leaveType) {
    conditions.push(`h."LeaveType" = $${idx++}`);
    values.push(leaveType);
  }
  if (periodMonth) {
    conditions.push(`h."PeriodMonth" = $${idx++}`);
    values.push(Number(periodMonth));
  }
  if (periodYear) {
    conditions.push(`h."PeriodYear" = $${idx++}`);
    values.push(Number(periodYear));
  }

  try {
    const rows = await query<Record<string, unknown>>(
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
      LEFT JOIN "PeMaster" p
        ON p."CompanyCode" = h."CompanyCode"
       AND p."EmployeeNo"  = h."EmployeeNo"
      WHERE ${conditions.join(' AND ')}
      ORDER BY h."ActionDate" DESC, h."EmployeeNo", h."LeaveType"
      LIMIT 200`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
