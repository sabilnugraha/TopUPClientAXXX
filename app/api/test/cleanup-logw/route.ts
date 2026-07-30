import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { LOGW_COMPANY, LOGW_TEST_EMPLOYEES } from '@/lib/scenarios-logw';

// DELETE /api/test/cleanup-logw
// Removes all TLOGW-* test employees + their data.
// TmLeaveDistributionConfig TIDAK PERNAH disentuh — itu data statis milik user.
export async function DELETE() {
  try {
    const empNos      = LOGW_TEST_EMPLOYEES.map((e) => e.employeeNo);
    const placeholders = empNos.map((_, i) => `$${i + 2}`).join(',');
    const values      = [LOGW_COMPANY, ...empNos];

    const condition = `"CompanyCode" = $1 AND "EmployeeNo" IN (${placeholders})`;

    await query(`DELETE FROM "HistoryTopUpLeaves"  WHERE ${condition}`, values);
    await query(`DELETE FROM "LeaveTopUpRunDetail" WHERE ${condition}`, values);
    await query(`DELETE FROM "PeMasterLeave"       WHERE ${condition}`, values);
    await query(`DELETE FROM "PeMasterLevel"       WHERE ${condition}`, values);
    await query(`DELETE FROM "PeMaster"            WHERE ${condition}`, values);

    return NextResponse.json({
      ok: true,
      deleted: empNos.length,
      message: `${empNos.length} karyawan test LOGWIN dihapus beserta semua datanya. Tabel distribusi tidak disentuh.`,
      employees: empNos,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
