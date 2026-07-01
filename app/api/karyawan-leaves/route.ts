import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// GET /api/karyawan-leaves?employeeNo=&companyCode=APLL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyCode = searchParams.get('companyCode') ?? 'APLL';
  const employeeNo  = searchParams.get('employeeNo')  ?? '';

  const conditions = [`p."CompanyCode" = $1`, `p."RecordStatus" = 'A'`];
  const values: unknown[] = [companyCode];
  let idx = 2;

  if (employeeNo) {
    conditions.push(`p."EmployeeNo" = $${idx++}`);
    values.push(employeeNo);
  }

  try {
    const rows = await query(
      `SELECT
         p."EmployeeNo",
         p."FullName",
         p."Gender",
         p."JoinDate",
         l."LeaveCode",
         COALESCE(l."LeaveBalance", 0)                    AS "LeaveBalance",
         COALESCE(l."LeaveBalanceBefore", 0)              AS "LeaveBalanceBefore",
         l."LeaveBalanceBeforeExpiredDate"                AS "ExpiredDate"
       FROM "PeMaster" p
       JOIN "PeMasterLeave" l
         ON l."CompanyCode" = p."CompanyCode"
        AND l."EmployeeNo"  = p."EmployeeNo"
       WHERE ${conditions.join(' AND ')}
         AND l."CompanyCode" = $1
         AND l."LeaveCode" IN (
           'AL','PH','HAID',
           'KHITAN/BABTIS_ANAK','ISTRI_MELAHIRKAN','ML',
           'KELUARGA_MENINGGAL','MELAHIRKAN','MENIKAHKAN_ANAK',
           'KEGUGURAN','ISTRI_KEGUGURAN'
         )
       ORDER BY p."EmployeeNo", l."LeaveCode"`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
