import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { CORI_SCENARIOS, type CoriScenario } from '@/lib/scenarios-cori';

export const maxDuration = 60; // Vercel Pro max

// ── DB ActionType mapping ─────────────────────────────────────────────────────
// The function stores ActionType differently from the Action column it returns:
//   GRANT12   → ActionType 'TopUp'  in HistoryTopUpLeaves
//   MONTHLY+1 → ActionType 'TopUp'  in HistoryTopUpLeaves
//   CI_5YEARS → ActionType '5years' in HistoryTopUpLeaves
function dbActionType(scenarioAction: string): string {
  if (scenarioAction === 'GRANT12' || scenarioAction === 'MONTHLY+1') return 'TopUp';
  if (scenarioAction === 'CI_5YEARS') return '5years';
  return scenarioAction;
}

// ── Row type returned by fn_topup_AL_Corinthian_daily() ──────────────────────
interface CoriRow {
  CompanyCode:  string;
  EmployeeNo:   string;
  Action:       string;
  PeriodMonth:  number;
  PeriodYear:   number;
  Amount:       number;
  LBPraTopUp:   number;
  LBAfterTopUp: number;
  Note:         string;
}

interface ScenarioResult {
  id:       string;
  status:   'pass' | 'fail';
  message:  string;
  before:   Record<string, unknown> | null;
  after:    Record<string, unknown> | null;
  fnRow:    Record<string, unknown> | null;
  expected: CoriScenario['expected'];
}

// ─────────────────────────────────────────────────────────────────────────────

async function runScenario(
  scenario: CoriScenario,
  fnRows:   CoriRow[],   // all rows returned by function (passed in — function runs ONCE per batch)
  now:      Date,
): Promise<ScenarioResult> {
  const { setups, expected } = scenario;
  const periodYear  = now.getFullYear();
  const periodMonth = now.getMonth() + 1; // 1-indexed

  // 1. ── Apply preconditions ────────────────────────────────────────────────
  for (const s of setups) {
    // Determine company code from test employee definition
    const empRow = await query<{ CompanyCode: string }>(
      `SELECT "CompanyCode" FROM "PeMaster" WHERE "EmployeeNo"=$1 AND "CompanyCode" IN ('CORI','CII') LIMIT 1`,
      [s.employeeNo]
    );
    const companyCode = empRow[0]?.CompanyCode ?? 'CORI';

    // Set exact LB/LBB for relevant leave code
    await query(
      `UPDATE "PeMasterLeave"
       SET "LeaveBalance"=$1, "LeaveBalanceBefore"=$2,
           "ChangedBy"='CoriTestRunner', "ChangedNo"=0
       WHERE "CompanyCode"=$3 AND "EmployeeNo"=$4 AND "LeaveCode"=$5`,
      [s.lb, s.lbb, companyCode, s.employeeNo, s.leaveCode]
    );

    // Clear current-period history for this employee (clean slate per scenario)
    await query(
      `DELETE FROM "HistoryTopUpLeaves"
       WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
         AND "LeaveType"=$3 AND "ActionType"=$4
         AND "PeriodYear"=$5 AND "PeriodMonth"=$6`,
      [companyCode, s.employeeNo, expected.leaveType, expected.actionType, periodYear, periodMonth]
    );

    // Insert pre-existing history entries (idempotency tests)
    if (s.preHistory && s.preHistory.length > 0) {
      for (const h of s.preHistory) {
        const hYear  = periodYear + h.yearOffset;
        const hMonth = h.periodMonth === 0 ? periodMonth : h.periodMonth;

        // Clear first to avoid conflicts
        await query(
          `DELETE FROM "HistoryTopUpLeaves"
           WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
             AND "LeaveType"=$3 AND "ActionType"=$4
             AND "PeriodYear"=$5 AND "PeriodMonth"=$6`,
          [companyCode, s.employeeNo, h.leaveType, h.actionType, hYear, hMonth]
        );

        await query(
          `INSERT INTO "HistoryTopUpLeaves"(
             "CompanyCode","EmployeeNo","LeaveType","PeriodMonth","PeriodYear",
             "LBPraTopUp","LBBPraTopUp","LBAfterTopUp","LBBAfterTopUp",
             "ActionDate","ActionType","ChangedBy","ChangedNo"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,'CoriTestRunner',0)`,
          [
            companyCode, s.employeeNo, h.leaveType, hMonth, hYear,
            h.lbBefore, h.lbbBefore, h.lbAfter, h.lbbAfter, h.actionType,
          ]
        );
      }
    }
  }

  // 2. ── Capture BEFORE state ───────────────────────────────────────────────
  const primarySetup = setups[0];
  const empRow = await query<{ CompanyCode: string }>(
    `SELECT "CompanyCode" FROM "PeMaster" WHERE "EmployeeNo"=$1 AND "CompanyCode" IN ('CORI','CII') LIMIT 1`,
    [primarySetup.employeeNo]
  );
  const companyCode = empRow[0]?.CompanyCode ?? 'CORI';

  const beforeRows = await query<Record<string, unknown>>(
    `SELECT "LeaveCode","LeaveBalance","LeaveBalanceBefore","LeaveBalanceBeforeExpiredDate"
     FROM "PeMasterLeave"
     WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2 AND "LeaveCode"=$3`,
    [companyCode, primarySetup.employeeNo, primarySetup.leaveCode]
  );
  const before = beforeRows[0] ?? null;

  // 3. ── Find this employee's row in the already-run function output ─────────
  const fnRow = fnRows.find(
    (r) => r.EmployeeNo === expected.employeeNo && r.Action === expected.actionType
  ) ?? null;

  // 4. ── Also check HistoryTopUpLeaves for the expected record ──────────────
  const histRows = await query<Record<string, unknown>>(
    `SELECT * FROM "HistoryTopUpLeaves"
     WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
       AND "LeaveType"=$3 AND "ActionType"=$4
       AND "PeriodYear"=$5 AND "PeriodMonth"=$6
     ORDER BY "ActionDate" DESC LIMIT 1`,
    [companyCode, expected.employeeNo, expected.leaveType, expected.actionType, periodYear, periodMonth]
  );
  const histRow = histRows[0] ?? null;

  // 5. ── Capture AFTER state ────────────────────────────────────────────────
  const afterRows = await query<Record<string, unknown>>(
    `SELECT "LeaveCode","LeaveBalance","LeaveBalanceBefore","LeaveBalanceBeforeExpiredDate"
     FROM "PeMasterLeave"
     WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2 AND "LeaveCode"=$3`,
    [companyCode, primarySetup.employeeNo, primarySetup.leaveCode]
  );
  const after = afterRows[0] ?? null;

  // 6. ── Validate ───────────────────────────────────────────────────────────

  // shouldNotExist: expect no new history record and no fn output row
  if (expected.shouldNotExist) {
    if (!histRow && !fnRow) {
      return {
        id: scenario.id, status: 'pass',
        message: 'Benar — tidak ada record/output (sesuai ekspektasi skip)',
        before, after, fnRow: null, expected,
      };
    }
    const found = histRow ? `history: ActionType=${String(histRow.ActionType)}` : `fn output: Action=${fnRow!.Action}`;
    return {
      id: scenario.id, status: 'fail',
      message: `Harusnya skip tapi ada ${found}`,
      before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected,
    };
  }

  // Expect a record
  if (!histRow && !fnRow) {
    return {
      id: scenario.id, status: 'fail',
      message: `Record ${expected.actionType} untuk ${expected.leaveType} tidak ditemukan di history maupun fn output`,
      before, after, fnRow: null, expected,
    };
  }

  // Prefer fn row for validation (directly from function return), fall back to history
  const lbAfterActual  = fnRow ? fnRow.LBAfterTopUp  : Number(histRow!.LBAfterTopUp);
  const lbBeforeActual = fnRow ? fnRow.LBPraTopUp     : Number(histRow!.LBPraTopUp);

  // Check lbAfter (exact)
  if (expected.lbAfter !== undefined) {
    if (Math.abs(lbAfterActual - expected.lbAfter) > 0.01) {
      return {
        id: scenario.id, status: 'fail',
        message: `LBAfter expected ${expected.lbAfter}, got ${lbAfterActual}`,
        before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected,
      };
    }
  }

  // Check lbDelta (LBAfter - LBBefore = exact delta)
  if (expected.lbDelta !== undefined) {
    const delta = lbAfterActual - lbBeforeActual;
    if (Math.abs(delta - expected.lbDelta) > 0.01) {
      return {
        id: scenario.id, status: 'fail',
        message: `Delta expected +${expected.lbDelta}, got +${delta} (LBBefore=${lbBeforeActual}, LBAfter=${lbAfterActual})`,
        before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected,
      };
    }
  }

  // Check lbDeltaMin (delta >= min)
  if (expected.lbDeltaMin !== undefined) {
    const delta = lbAfterActual - lbBeforeActual;
    if (delta < expected.lbDeltaMin) {
      return {
        id: scenario.id, status: 'fail',
        message: `Delta minimum ${expected.lbDeltaMin} tidak terpenuhi: delta=${delta}`,
        before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected,
      };
    }
  }

  return {
    id: scenario.id, status: 'pass',
    message: 'Semua validasi lolos ✓',
    before, after,
    fnRow: fnRow as unknown as Record<string, unknown> | null,
    expected,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/test/run-cori  { scenarioId?: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body       = await req.json().catch(() => ({}));
    const { scenarioId } = body as { scenarioId?: string };

    const toRun = scenarioId
      ? CORI_SCENARIOS.filter((s) => s.id === scenarioId)
      : CORI_SCENARIOS;

    if (!toRun.length) {
      return NextResponse.json(
        { error: `Scenario "${scenarioId}" tidak ditemukan` },
        { status: 404 }
      );
    }

    const now = new Date();
    const results: ScenarioResult[] = [];

    // Run all scenarios sequentially.
    // Per scenario: apply preconditions, run function, validate.
    // The function processes all CORI/CII employees — we only inspect our test employees.
    for (const scenario of toRun) {
      // Apply preconditions for this specific scenario
      // (done inside runScenario before the fn call, but we need fn output)
      // Strategy: apply preconditions first, then run function, then check
      const { setups, expected } = scenario;
      const periodYear  = now.getFullYear();
      const periodMonth = now.getMonth() + 1;

      // Apply preconditions
      for (const s of setups) {
        const empRow = await query<{ CompanyCode: string }>(
          `SELECT "CompanyCode" FROM "PeMaster" WHERE "EmployeeNo"=$1 AND "CompanyCode" IN ('CORI','CII') LIMIT 1`,
          [s.employeeNo]
        );
        const companyCode = empRow[0]?.CompanyCode ?? 'CORI';

        await query(
          `UPDATE "PeMasterLeave"
           SET "LeaveBalance"=$1, "LeaveBalanceBefore"=$2,
               "ChangedBy"='CoriTestRunner', "ChangedNo"=0
           WHERE "CompanyCode"=$3 AND "EmployeeNo"=$4 AND "LeaveCode"=$5`,
          [s.lb, s.lbb, companyCode, s.employeeNo, s.leaveCode]
        );

        // Clear current-period history so function can re-process this employee
        await query(
          `DELETE FROM "HistoryTopUpLeaves"
           WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
             AND "LeaveType"=$3 AND "ActionType"=$4
             AND "PeriodYear"=$5 AND "PeriodMonth"=$6`,
          [companyCode, s.employeeNo, expected.leaveType, dbActionType(expected.actionType), periodYear, periodMonth]
        );

        // Insert pre-history entries for idempotency tests
        if (s.preHistory) {
          for (const h of s.preHistory) {
            const hYear  = periodYear + h.yearOffset;
            const hMonth = h.periodMonth === 0 ? periodMonth : h.periodMonth;
            await query(
              `DELETE FROM "HistoryTopUpLeaves"
               WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
                 AND "LeaveType"=$3 AND "ActionType"=$4
                 AND "PeriodYear"=$5 AND "PeriodMonth"=$6`,
              [companyCode, s.employeeNo, h.leaveType, dbActionType(h.actionType), hYear, hMonth]
            );
            await query(
              `INSERT INTO "HistoryTopUpLeaves"(
                 "CompanyCode","EmployeeNo","LeaveType","PeriodMonth","PeriodYear",
                 "LBPraTopUp","LBBPraTopUp","LBAfterTopUp","LBBAfterTopUp",
                 "ActionDate","ActionType","ChangedBy","ChangedNo"
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,'CoriTestRunner',0)`,
              [companyCode, s.employeeNo, h.leaveType, hMonth, hYear,
               h.lbBefore, h.lbbBefore, h.lbAfter, h.lbbAfter, dbActionType(h.actionType)]
            );
          }
        }
      }

      // Capture BEFORE
      const primSetup = setups[0];
      const empRow2   = await query<{ CompanyCode: string }>(
        `SELECT "CompanyCode" FROM "PeMaster" WHERE "EmployeeNo"=$1 AND "CompanyCode" IN ('CORI','CII') LIMIT 1`,
        [primSetup.employeeNo]
      );
      const companyCode2 = empRow2[0]?.CompanyCode ?? 'CORI';
      const beforeRows   = await query<Record<string, unknown>>(
        `SELECT "LeaveCode","LeaveBalance","LeaveBalanceBefore"
         FROM "PeMasterLeave" WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2 AND "LeaveCode"=$3`,
        [companyCode2, primSetup.employeeNo, primSetup.leaveCode]
      );
      const before = beforeRows[0] ?? null;

      // Run fn_topup_AL_Corinthian_daily()
      const fnRows = await query<CoriRow>(`SELECT * FROM "fn_topup_AL_Corinthian_daily"()`);

      // Find our test employee's row
      const fnRow = fnRows.find(
        (r) => r.EmployeeNo === expected.employeeNo && r.Action === expected.actionType
      ) ?? null;

      // Check history
      const histRows = await query<Record<string, unknown>>(
        `SELECT * FROM "HistoryTopUpLeaves"
         WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
           AND "LeaveType"=$3 AND "ActionType"=$4
           AND "PeriodYear"=$5 AND "PeriodMonth"=$6
         ORDER BY "ActionDate" DESC LIMIT 1`,
        [companyCode2, expected.employeeNo, expected.leaveType, dbActionType(expected.actionType), periodYear, periodMonth]
      );
      const histRow = histRows[0] ?? null;

      // Capture AFTER
      const afterRows = await query<Record<string, unknown>>(
        `SELECT "LeaveCode","LeaveBalance","LeaveBalanceBefore"
         FROM "PeMasterLeave" WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2 AND "LeaveCode"=$3`,
        [companyCode2, primSetup.employeeNo, primSetup.leaveCode]
      );
      const after = afterRows[0] ?? null;

      // Validate
      const lbAfterActual  = fnRow ? fnRow.LBAfterTopUp : Number(histRow?.LBAfterTopUp ?? 0);
      const lbBeforeActual = fnRow ? fnRow.LBPraTopUp   : Number(histRow?.LBPraTopUp   ?? 0);

      let result: ScenarioResult;

      if (expected.shouldNotExist) {
        // For idempotency scenarios: check that no NEW record was created AFTER our preHistory setup
        // We clear history before preHistory insert, so histRow would be the pre-inserted one.
        // We want to confirm the function did NOT add a SECOND record.
        const histCount = await query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM "HistoryTopUpLeaves"
           WHERE "CompanyCode"=$1 AND "EmployeeNo"=$2
             AND "LeaveType"=$3 AND "ActionType"=$4
             AND "PeriodYear"=$5 AND "PeriodMonth"=$6`,
          [companyCode2, expected.employeeNo, expected.leaveType, dbActionType(expected.actionType), periodYear, periodMonth]
        );
        const count = Number(histCount[0]?.cnt ?? 0);

        const hasPreHistory = setups[0].preHistory && setups[0].preHistory.length > 0;

        if (hasPreHistory) {
          // We pre-inserted 1 record. If function added another, count > 1.
          if (count <= 1 && !fnRow) {
            result = { id: scenario.id, status: 'pass', message: 'Idempotency OK — tidak ada record duplikat', before, after, fnRow: null, expected };
          } else if (count > 1) {
            result = { id: scenario.id, status: 'fail', message: `Idempotency GAGAL — ${count} records ditemukan (harusnya ≤1)`, before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected };
          } else {
            // fnRow exists even though we pre-inserted — function processed this employee again
            result = { id: scenario.id, status: 'fail', message: `Idempotency GAGAL — fn output ada record padahal sudah diproses`, before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected };
          }
        } else {
          // No preHistory — just expect zero records
          if (!histRow && !fnRow) {
            result = { id: scenario.id, status: 'pass', message: 'Benar — tidak ada record/output (sesuai ekspektasi skip)', before, after, fnRow: null, expected };
          } else {
            const found = histRow ? `history: ActionType=${String(histRow.ActionType)}` : `fn: Action=${fnRow!.Action}`;
            result = { id: scenario.id, status: 'fail', message: `Harusnya skip tapi ada ${found}`, before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected };
          }
        }
      } else if (!histRow && !fnRow) {
        result = { id: scenario.id, status: 'fail', message: `Record ${expected.actionType} tidak ditemukan di history maupun fn output`, before, after, fnRow: null, expected };
      } else {
        let failMsg = '';

        if (expected.lbAfter !== undefined) {
          if (Math.abs(lbAfterActual - expected.lbAfter) > 0.01) {
            failMsg = `LBAfter expected ${expected.lbAfter}, got ${lbAfterActual}`;
          }
        }

        if (!failMsg && expected.lbDelta !== undefined) {
          const delta = lbAfterActual - lbBeforeActual;
          if (Math.abs(delta - expected.lbDelta) > 0.01) {
            failMsg = `Delta expected +${expected.lbDelta}, got +${delta.toFixed(2)} (LBPra=${lbBeforeActual}, LBAfter=${lbAfterActual})`;
          }
        }

        if (!failMsg && expected.lbDeltaMin !== undefined) {
          const delta = lbAfterActual - lbBeforeActual;
          if (delta < expected.lbDeltaMin) {
            failMsg = `Delta minimum ${expected.lbDeltaMin} tidak terpenuhi: delta=${delta}`;
          }
        }

        result = failMsg
          ? { id: scenario.id, status: 'fail', message: failMsg, before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected }
          : { id: scenario.id, status: 'pass', message: 'Semua validasi lolos ✓', before, after, fnRow: fnRow as unknown as Record<string, unknown> | null, expected };
      }

      results.push(result);
    }

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;

    return NextResponse.json({ results, summary: { total: results.length, passed, failed } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/test/run-cori → return scenario list (no DB)
export async function GET() {
  return NextResponse.json(
    CORI_SCENARIOS.map(({ id, category, emoji, name, description, expected }) => ({
      id, category, emoji, name, description,
      runDate: '(uses NOW() internally)',
      expected,
    }))
  );
}
