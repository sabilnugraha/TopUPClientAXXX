import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// DELETE /api/runs/:runId — hapus run + detail + history dari tanggal run tsb
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params;
  try {
    // Ambil RunDate dulu untuk delete history berdasarkan tanggal
    const runRows = await query<{ RunDate: string }>(
      `SELECT "RunDate"::text AS "RunDate" FROM "LeaveTopUpRun" WHERE "RunID" = $1`,
      [runId]
    );
    if (!runRows.length) {
      return NextResponse.json({ error: 'Run tidak ditemukan' }, { status: 404 });
    }
    const runDate = runRows[0].RunDate.slice(0, 10);

    // Delete berurutan
    const detailDel = await query<{ count: string }>(
      `WITH d AS (DELETE FROM "LeaveTopUpRunDetail" WHERE "RunID" = $1 RETURNING 1)
       SELECT COUNT(*)::text AS count FROM d`,
      [runId]
    );
    const histDel = await query<{ count: string }>(
      `WITH d AS (
         DELETE FROM "HistoryTopUpLeaves"
         WHERE "CompanyCode" = 'APLL'
           AND "ActionDate"::date = $1::date
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM d`,
      [runDate]
    );
    await query(`DELETE FROM "LeaveTopUpRun" WHERE "RunID" = $1`, [runId]);

    return NextResponse.json({
      ok: true,
      runDate,
      detailsDeleted: Number(detailDel[0]?.count ?? 0),
      historyDeleted: Number(histDel[0]?.count ?? 0),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const { runId } = params;

  try {
    // Run detail errors (LeaveTopUpRunDetail)
    const details = await query<Record<string, unknown>>(
      `SELECT
        d."CompanyCode",
        d."EmployeeNo",
        d."LeaveCode",
        d."ActionType",
        d."Status",
        d."Reason",
        d."LB_Before",
        d."LBB_Before",
        d."LB_After",
        d."LBB_After",
        d."ActionDate",
        d."ErrorMessage"
      FROM "LeaveTopUpRunDetail" d
      WHERE d."RunID" = $1
      ORDER BY d."CompanyCode", d."EmployeeNo", d."LeaveCode"`,
      [runId]
    );

    // History topup untuk run ini (pakai RunDate dari header)
    const history = await query<Record<string, unknown>>(
      `SELECT
        h."CompanyCode",
        h."EmployeeNo",
        p."FullName",
        h."LeaveType",
        h."PeriodMonth",
        h."PeriodYear",
        h."LBPraTopUp",
        h."LBBPraTopUp",
        h."LBAfterTopUp",
        h."LBBAfterTopUp",
        h."ActionDate",
        h."ActionType"
      FROM "HistoryTopUpLeaves" h
      JOIN "LeaveTopUpRun" r ON r."RunID" = $1
      LEFT JOIN "PeMaster" p
        ON p."CompanyCode" = h."CompanyCode"
       AND p."EmployeeNo"  = h."EmployeeNo"
      WHERE h."CompanyCode" = 'APLL'
        AND h."ActionDate"::date = r."RunDate"
      ORDER BY h."CompanyCode", h."EmployeeNo", h."LeaveType", h."ActionType"`,
      [runId]
    );

    return NextResponse.json({ details, history });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
