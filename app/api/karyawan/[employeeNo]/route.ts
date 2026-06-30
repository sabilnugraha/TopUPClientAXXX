import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
    const { CompanyCode, FullName, JoinDate, Gender, RecordStatus } = body;

    await query(
      `UPDATE "PeMaster"
       SET "FullName"=$1,"JoinDate"=$2,"Gender"=$3,"RecordStatus"=$4
       WHERE "CompanyCode"=$5 AND "EmployeeNo"=$6`,
      [FullName, JoinDate, Gender, RecordStatus, CompanyCode, params.employeeNo]
    );
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
  try {
    await query(
      `DELETE FROM "PeMaster" WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2`,
      [companyCode, params.employeeNo]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
