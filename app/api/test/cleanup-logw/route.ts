import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { LOGW_COMPANY, LOGW_TEST_EMPLOYEES } from '@/lib/scenarios-logw';

// DELETE /api/test/cleanup-logw
// Removes all TLOGW-* test employees + their data. Distribution config is
// left alone by default (it is company-level config, not per-employee) unless
// ?withConfig=1 is passed.
export async function DELETE(req: Request) {
  try {
    const url         = new URL(req.url);
    const withConfig  = url.searchParams.get('withConfig') === '1';
    const empNos      = LOGW_TEST_EMPLOYEES.map((e) => e.employeeNo);
    const placeholders = empNos.map((_, i) => `$${i + 2}`).join(',');
    const values      = [LOGW_COMPANY, ...empNos];

    const condition = `"CompanyCode" = $1 AND "EmployeeNo" IN (${placeholders})`;

    await query(`DELETE FROM "HistoryTopUpLeaves"  WHERE ${condition}`, values);
    await query(`DELETE FROM "LeaveTopUpRunDetail" WHERE ${condition}`, values);
    await query(`DELETE FROM "PeMasterLeave"       WHERE ${condition}`, values);
    await query(`DELETE FROM "PeMasterLevel"       WHERE ${condition}`, values);
    await query(`DELETE FROM "PeMaster"            WHERE ${condition}`, values);

    let distDeleted = 0;
    if (withConfig) {
      const year = new Date().getFullYear();
      const res = await query<{ cnt: string }>(
        `WITH d AS (
           DELETE FROM "TmLeaveDistributionConfig"
           WHERE "CompanyCode" = $1 AND "EffectiveYear" = ANY($2::int[])
           RETURNING 1
         ) SELECT COUNT(*)::text AS cnt FROM d`,
        [LOGW_COMPANY, [year, year - 1]]
      );
      distDeleted = Number(res[0]?.cnt ?? 0);
    }

    return NextResponse.json({
      ok: true,
      deleted: empNos.length,
      distDeleted,
      message:
        `${empNos.length} karyawan test LOGW dihapus beserta semua datanya` +
        (withConfig ? `, ${distDeleted} baris distribusi ikut dihapus` : ''),
      employees: empNos,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
