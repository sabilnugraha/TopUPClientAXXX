import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/karyawan?search=&companyCode=&status=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search      = searchParams.get('search')      ?? '';
  const companyCode = searchParams.get('companyCode') ?? '';
  const status      = searchParams.get('status')      ?? '';

  const conditions: string[] = [];
  const values: unknown[]    = [];
  let idx = 1;

  if (search) {
    conditions.push(`(p."EmployeeNo" ILIKE $${idx} OR p."FullName" ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  if (companyCode) {
    conditions.push(`p."CompanyCode" = $${idx++}`);
    values.push(companyCode);
  }
  if (status) {
    conditions.push(`p."RecordStatus" = $${idx++}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const rows = await query(
      `SELECT
        p."CompanyCode",
        p."EmployeeNo",
        p."FullName",
        p."JoinDate",
        p."Gender",
        p."RecordStatus"
      FROM "PeMaster" p
      ${where}
      ORDER BY p."CompanyCode", p."EmployeeNo"
      LIMIT 200`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/karyawan — create
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { CompanyCode, EmployeeNo, FullName, JoinDate, Gender, RecordStatus } = body;

    await query(
      `INSERT INTO "PeMaster"("CompanyCode","EmployeeNo","FullName","JoinDate","Gender","RecordStatus")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [CompanyCode, EmployeeNo, FullName, JoinDate, Gender, RecordStatus ?? 'A']
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
