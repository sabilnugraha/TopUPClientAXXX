import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { TEST_EMPLOYEES } from '@/lib/scenarios';

export async function DELETE() {
  try {
    const empNos = TEST_EMPLOYEES.map((e) => e.EmployeeNo);
    const placeholders = empNos.map((_, i) => `$${i + 1}`).join(',');

    await query(`DELETE FROM "HistoryTopUpLeaves" WHERE "CompanyCode"='APLL' AND "EmployeeNo" IN (${placeholders})`, empNos);
    await query(`DELETE FROM "LeaveTopUpRunDetail"  WHERE "CompanyCode"='APLL' AND "EmployeeNo" IN (${placeholders})`, empNos);
    await query(`DELETE FROM "PeMasterLeave"         WHERE "CompanyCode"='APLL' AND "EmployeeNo" IN (${placeholders})`, empNos);
    await query(`DELETE FROM "PeMaster"              WHERE "CompanyCode"='APLL' AND "EmployeeNo" IN (${placeholders})`, empNos);

    return NextResponse.json({ ok: true, message: `${empNos.length} karyawan test dihapus beserta semua datanya` });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
