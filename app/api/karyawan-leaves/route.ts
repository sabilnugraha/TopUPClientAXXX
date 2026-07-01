import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const CORI_COMPANIES  = ['CORI', 'CII'];
const APLL_CODES_SQL  = `l."LeaveCode" IN ('AL','PH','HAID','KHITAN/BABTIS_ANAK','ISTRI_MELAHIRKAN','ML','KELUARGA_MENINGGAL','MELAHIRKAN','MENIKAHKAN_ANAK','KEGUGURAN','ISTRI_KEGUGURAN')`;
const CORI_CODES_SQL  = `l."LeaveCode" IN ('AL','CI')`;

// GET /api/karyawan-leaves?companyCode=APLL | companyGroup=CORI | employeeNo=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyCode  = searchParams.get('companyCode')  ?? '';
  const companyGroup = searchParams.get('companyGroup') ?? '';
  const employeeNo   = searchParams.get('employeeNo')   ?? '';

  const isCori = CORI_COMPANIES.includes(companyCode) || companyGroup === 'CORI';

  const conditions: string[] = [`p."RecordStatus" = 'A'`];
  const values: unknown[] = [];
  let idx = 1;

  if (companyCode) {
    conditions.push(`p."CompanyCode" = $${idx++}`);
    values.push(companyCode);
  } else if (companyGroup === 'CORI') {
    conditions.push(`p."CompanyCode" IN ('CORI','CII')`);
  }

  if (employeeNo) {
    conditions.push(`p."EmployeeNo" = $${idx++}`);
    values.push(employeeNo);
  }

  const leaveFilter = isCori ? CORI_CODES_SQL : APLL_CODES_SQL;

  try {
    const rows = await query(
      `SELECT
         p."CompanyCode",
         p."EmployeeNo",
         p."FullName",
         p."Gender",
         p."JoinDate",
         l."LeaveCode",
         COALESCE(l."LeaveBalance", 0)       AS "LeaveBalance",
         COALESCE(l."LeaveBalanceBefore", 0) AS "LeaveBalanceBefore",
         l."LeaveBalanceBeforeExpiredDate"   AS "ExpiredDate"
       FROM "PeMaster" p
       JOIN "PeMasterLeave" l
         ON l."CompanyCode" = p."CompanyCode"
        AND l."EmployeeNo"  = p."EmployeeNo"
       WHERE ${conditions.join(' AND ')}
         AND ${leaveFilter}
       ORDER BY p."CompanyCode", p."EmployeeNo", l."LeaveCode"`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
