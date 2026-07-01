import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { CORI_TEST_EMPLOYEES } from '@/lib/scenarios-cori';

// DELETE /api/test/cleanup-cori
// Removes all TCORI-* test employees and their associated data from CORI and CII
export async function DELETE() {
  try {
    const empNos      = CORI_TEST_EMPLOYEES.map((e) => e.employeeNo);
    const companies   = ['CORI', 'CII'];
    const placeholders = empNos.map((_, i) => `$${i + 1}`).join(',');
    const compPlaceholders = companies.map((_, i) => `$${empNos.length + i + 1}`).join(',');
    const allValues   = [...empNos, ...companies];

    const condition = `"EmployeeNo" IN (${placeholders}) AND "CompanyCode" IN (${compPlaceholders})`;

    await query(`DELETE FROM "HistoryTopUpLeaves"  WHERE ${condition}`, allValues);
    await query(`DELETE FROM "LeaveTopUpRunDetail" WHERE ${condition}`, allValues);
    await query(`DELETE FROM "PeMasterLeave"       WHERE ${condition}`, allValues);
    await query(`DELETE FROM "PeMaster"            WHERE ${condition}`, allValues);

    return NextResponse.json({
      ok: true,
      deleted: empNos.length,
      message: `${empNos.length} karyawan test CORI/CII dihapus beserta semua datanya`,
      employees: empNos,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
