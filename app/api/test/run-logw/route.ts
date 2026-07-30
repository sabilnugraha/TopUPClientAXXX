import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  LOGW_COMPANY, LOGW_SCENARIOS, LOGW_TEST_EMPLOYEES,
  type LogwScenario,
} from '@/lib/scenarios-logw';

export const maxDuration = 60; // Vercel Pro max

interface ScenarioResult {
  id:       string;
  status:   'pass' | 'fail';
  message:  string;
  before:   Record<string, unknown> | null;
  after:    Record<string, unknown> | null;
  fnRow:    Record<string, unknown> | null;
  expected: LogwScenario['expected'];
}

interface HistRow {
  PeriodMonth:   number;
  ActionType:    string;
  LBPraTopUp:    string | number | null;
  LBBPraTopUp:   string | number | null;
  LBAfterTopUp:  string | number | null;
  LBBAfterTopUp: string | number | null;
}

const n = (v: unknown) => Number(v ?? 0);

/** Reset one employee to a clean slate for the given year */
async function resetEmployee(employeeNo: string, year: number, lb: number, lbb: number) {
  await query(
    `DELETE FROM "HistoryTopUpLeaves"
     WHERE "CompanyCode" = $1 AND "EmployeeNo" = $2
       AND "LeaveType" = 'AL' AND "PeriodYear" = $3`,
    [LOGW_COMPANY, employeeNo, year]
  );
  await query(
    `UPDATE "PeMasterLeave"
     SET "LeaveBalance" = $1, "LeaveBalanceBefore" = $2,
         "LeaveBalanceBeforeExpiredDate" = NULL,
         "ChangedBy" = 'LogwTestRunner', "ChangedNo" = 0
     WHERE "CompanyCode" = $3 AND "EmployeeNo" = $4 AND "LeaveCode" = 'AL'`,
    [lb, lbb, LOGW_COMPANY, employeeNo]
  );
}

async function readBalance(employeeNo: string) {
  const rows = await query<Record<string, unknown>>(
    `SELECT "LeaveCode","LeaveBalance","LeaveBalanceBefore","LeaveBalanceBeforeExpiredDate"
     FROM "PeMasterLeave"
     WHERE "CompanyCode" = $1 AND "EmployeeNo" = $2 AND "LeaveCode" = 'AL'`,
    [LOGW_COMPANY, employeeNo]
  );
  return rows[0] ?? null;
}

async function readHistory(employeeNo: string, year: number) {
  return query<HistRow>(
    `SELECT "PeriodMonth","ActionType","LBPraTopUp","LBBPraTopUp","LBAfterTopUp","LBBAfterTopUp"
     FROM "HistoryTopUpLeaves"
     WHERE "CompanyCode" = $1 AND "EmployeeNo" = $2
       AND "LeaveType" = 'AL' AND "PeriodYear" = $3
     ORDER BY "PeriodMonth", "ActionType"`,
    [LOGW_COMPANY, employeeNo, year]
  );
}

async function runMonths(months: number[], year: number) {
  for (const mo of months) {
    await query(`SELECT public."TopUpLOGWINV2"($1::varchar, $2::int, $3::int)`, [
      LOGW_COMPANY, mo, year,
    ]);
  }
}

/** Delta of a TOPUP row = (LB after - LB before) + (LBB after - LBB before) */
function topupDelta(h: HistRow) {
  return (n(h.LBAfterTopUp) - n(h.LBPraTopUp)) + (n(h.LBBAfterTopUp) - n(h.LBBPraTopUp));
}

async function runScenario(sc: LogwScenario, year: number): Promise<ScenarioResult> {
  await resetEmployee(sc.employeeNo, year, sc.initialLb, sc.initialLbb);
  const before = await readBalance(sc.employeeNo);

  await runMonths(sc.runMonths, year);

  // Idempotency: repeat the whole sequence, result must be unchanged
  if (sc.runTwice) {
    await runMonths(sc.runMonths, year);
  }

  const after   = await readBalance(sc.employeeNo);
  const history = await readHistory(sc.employeeNo, year);

  const topups  = history.filter((h) => h.ActionType === 'TOPUP');
  const q4      = history.filter((h) => h.ActionType === 'Q4_CARRY');

  // Actual per-month grants
  const actualMonthly: Record<number, number> = {};
  for (const h of topups) actualMonthly[h.PeriodMonth] = topupDelta(h);

  const fnRow: Record<string, unknown> = {
    bulanDijalankan: sc.runMonths.join(', '),
    perBulanAktual:  actualMonthly,
    perBulanHarapan: sc.expected.monthly,
    totalAktual:     Object.values(actualMonthly).reduce((a, b) => a + b, 0),
    totalHarapan:    sc.expected.total,
    jumlahRecord:    history.length,
    q4CarryRecord:   q4.length,
  };

  const fail = (message: string): ScenarioResult => ({
    id: sc.id, status: 'fail', message, before, after, fnRow, expected: sc.expected,
  });

  // 1. Duplicate guard — one TOPUP row per month, max
  const seen = new Set<number>();
  for (const h of topups) {
    if (seen.has(h.PeriodMonth)) {
      return fail(`Ada lebih dari satu record TOPUP untuk bulan ${h.PeriodMonth} — top-up dobel`);
    }
    seen.add(h.PeriodMonth);
  }

  // 2. Per-month amounts
  for (const [moStr, expQty] of Object.entries(sc.expected.monthly)) {
    const mo     = Number(moStr);
    const actual = actualMonthly[mo] ?? 0;
    if (Math.abs(actual - expQty) > 0.01) {
      return fail(`Bulan ${mo}: diharapkan ${expQty} hari, hasilnya ${actual} hari`);
    }
  }

  // 3. Months that should not appear at all
  for (const mo of Object.keys(actualMonthly).map(Number)) {
    if (!(mo in sc.expected.monthly)) {
      return fail(`Bulan ${mo} tidak diharapkan ada top-up, tapi tercatat ${actualMonthly[mo]} hari`);
    }
  }

  // 4. Annual total
  const totalActual = Object.values(actualMonthly).reduce((a, b) => a + b, 0);
  if (Math.abs(totalActual - sc.expected.total) > 0.01) {
    return fail(`Total setahun diharapkan ${sc.expected.total} hari, hasilnya ${totalActual} hari`);
  }

  // 5. Q4 Carry
  if (sc.expected.noQ4Carry && q4.length > 0) {
    return fail(`Tidak boleh ada Q4 Carry, tapi ada ${q4.length} record`);
  }
  if (sc.expected.q4Carry !== undefined) {
    if (q4.length === 0) {
      return fail(`Q4 Carry ${sc.expected.q4Carry} hari tidak ditemukan`);
    }
    const carryDelta = n(q4[0].LBBAfterTopUp) - n(q4[0].LBBPraTopUp);
    if (Math.abs(carryDelta - sc.expected.q4Carry) > 0.01) {
      return fail(`Q4 Carry diharapkan ${sc.expected.q4Carry} hari, hasilnya ${carryDelta} hari`);
    }
  }

  return {
    id: sc.id, status: 'pass',
    message: sc.runTwice
      ? 'Semua validasi lolos ✓ — dijalankan dua kali, hasil tetap sama'
      : 'Semua validasi lolos ✓',
    before, after, fnRow, expected: sc.expected,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/test/run-logw  { scenarioId?: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { scenarioId } = body as { scenarioId?: string };

    const toRun = scenarioId
      ? LOGW_SCENARIOS.filter((s) => s.id === scenarioId)
      : LOGW_SCENARIOS;

    if (!toRun.length) {
      return NextResponse.json(
        { error: `Scenario "${scenarioId}" tidak ditemukan` },
        { status: 404 }
      );
    }

    const year = new Date().getFullYear();
    const results: ScenarioResult[] = [];

    for (const sc of toRun) {
      try {
        results.push(await runScenario(sc, year));
      } catch (e) {
        results.push({
          id: sc.id, status: 'fail',
          message: `Error saat menjalankan: ${String(e)}`,
          before: null, after: null, fnRow: null, expected: sc.expected,
        });
      }
    }

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;

    return NextResponse.json({ results, summary: { total: results.length, passed, failed } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/test/run-logw → scenario list (no DB)
export async function GET() {
  const year = new Date().getFullYear();
  return NextResponse.json(
    LOGW_SCENARIOS.map(({ id, category, emoji, name, description, employeeNo, runMonths, expected }) => {
      const emp = LOGW_TEST_EMPLOYEES.find((e) => e.employeeNo === employeeNo);
      return {
        id, category, emoji, name, description,
        runDate: `${year} · bulan ${runMonths.join(', ')}`,
        employeeNo,
        employeeName: emp?.fullName ?? employeeNo,
        expected,
      };
    })
  );
}
