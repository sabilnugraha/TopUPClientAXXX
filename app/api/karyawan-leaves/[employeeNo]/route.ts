import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// PUT /api/karyawan-leaves/:employeeNo — update saldo leave 1 baris
// Body: { CompanyCode, LeaveCode, LeaveBalance, LeaveBalanceBefore, ExpiredDate }
export async function PUT(
  req: NextRequest,
  { params }: { params: { employeeNo: string } }
) {
  try {
    const body = await req.json();
    const { CompanyCode, LeaveCode, LeaveBalance, LeaveBalanceBefore, ExpiredDate } = body;

    await query(
      `UPDATE "PeMasterLeave"
       SET "LeaveBalance"                  = $1,
           "LeaveBalanceBefore"             = $2,
           "LeaveBalanceBeforeExpiredDate"  = $3,
           "ChangedBy"                      = 'QATest'
       WHERE "CompanyCode" = $4
         AND "EmployeeNo"  = $5
         AND "LeaveCode"   = $6`,
      [
        Number(LeaveBalance ?? 0),
        Number(LeaveBalanceBefore ?? 0),
        ExpiredDate || null,
        CompanyCode,
        params.employeeNo,
        LeaveCode,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
