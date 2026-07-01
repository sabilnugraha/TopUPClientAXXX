import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const CORI_COMPANIES = ['CORI', 'CII'];

// GET /api/karyawan/:employeeNo?companyCode=
export async function GET(
  req: NextRequest,
  { params }: { params: { employeeNo: string } }
) {
  const companyCode = new URL(req.url).searchParams.get('companyCode') ?? 'APLL';
  try {
    const rows = await query(
      `SELECT * FROM "PeMaster" WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2`,
      [companyCode, params.employeeNo]
    );
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT /api/karyawan/:employeeNo — update
export async function PUT(
  req: NextRequest,
  { params }: { params: { employeeNo: string } }
) {
  try {
    const body = await req.json();
    const {
      CompanyCode, FullName, JoinDate, Gender, RecordStatus,
      EmploymentStatus, ContractStartDate, EffectivePermanentDate,
    } = body;

    const isCori = CORI_COMPANIES.includes(CompanyCode);

    if (isCori) {
      await query(
        `UPDATE "PeMaster"
         SET "FullName"=$1,"JoinDate"=$2,"Gender"=$3,"RecordStatus"=$4,
             "EmploymentStatus"=$5,"ContractStartDate"=$6,"EffectivePermanentDate"=$7
         WHERE "CompanyCode"=$8 AND "EmployeeNo"=$9`,
        [
          FullName, JoinDate, Gender, RecordStatus,
          EmploymentStatus ?? 'C',
          ContractStartDate      || null,
          EffectivePermanentDate || null,
          CompanyCode, params.employeeNo,
        ]
      );
    } else {
      await query(
        `UPDATE "PeMaster"
         SET "FullName"=$1,"JoinDate"=$2,"Gender"=$3,"RecordStatus"=$4
         WHERE "CompanyCode"=$5 AND "EmployeeNo"=$6`,
        [FullName, JoinDate, Gender, RecordStatus, CompanyCode, params.employeeNo]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/karyawan/:employeeNo?companyCode=
export async function DELETE(
  req: NextRequest,
  { params }: { params: { employeeNo: string } }
) {
  const companyCode = new URL(req.url).searchParams.get('companyCode') ?? 'APLL';
  const { employeeNo } = params;
  try {
    await query(`DELETE FROM "HistoryTopUpLeaves" WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2`, [companyCode, employeeNo]);
    await query(`DELETE FROM "LeaveTopUpRunDetail"  WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2`, [companyCode, employeeNo]);
    await query(`DELETE FROM "PeMasterLeave"         WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2`, [companyCode, employeeNo]);
    await query(`DELETE FROM "PeMaster"              WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2`, [companyCode, employeeNo]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
