import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { SCENARIOS, TEST_EMPLOYEES, type Scenario } from '@/lib/scenarios';

interface ScenarioResult {
  id: string;
  status: 'pass' | 'fail';
  message: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  expected: Scenario['expected'];
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const { setups, expected, runDate } = scenario;

  // 1. Apply preconditions for each setup
  for (const s of setups) {
    // Set exact LB/LBB/ExpiredDate
    await query(
      `UPDATE "PeMasterLeave"
       SET "LeaveBalance"=$1,
           "LeaveBalanceBefore"=$2,
           "LeaveBalanceBeforeExpiredDate"=$3,
           "ChangedBy"='TestRunner',
           "ChangedNo"=0
       WHERE "CompanyCode"='APLL' AND "EmployeeNo"=$4 AND "LeaveCode"=$5`,
      [s.lb, s.lbb, s.expiredDate, s.employeeNo, s.leaveCode]
    );

    // Clear relevant history for this employee/period (clean slate for this scenario)
    await query(
      `DELETE FROM "HistoryTopUpLeaves"
       WHERE "CompanyCode"='APLL'
         AND "EmployeeNo"=$1
         AND "LeaveType"=$2
         AND "PeriodMonth"=$3
         AND "PeriodYear"=$4`,
      [s.employeeNo, s.clearLeaveType, s.clearMonth, s.clearYear]
    );
  }

  // 2. Capture BEFORE state for the primary setup
  const primarySetup = setups[0];
  const beforeRows = await query<Record<string, unknown>>(
    `SELECT "LeaveBalance","LeaveBalanceBefore","LeaveBalanceBeforeExpiredDate"
     FROM "PeMasterLeave"
     WHERE "CompanyCode"='APLL' AND "EmployeeNo"=$1 AND "LeaveCode"=$2`,
    [primarySetup.employeeNo, primarySetup.leaveCode]
  );
  const before = beforeRows[0] ?? null;

  // 3. Run function
  await query(`SELECT fn_daily_topup_leave_apll($1::timestamp)`, [runDate]);

  // 4. Check HistoryTopUpLeaves for expected record
  const histRows = await query<Record<string, unknown>>(
    `SELECT * FROM "HistoryTopUpLeaves"
     WHERE "CompanyCode"='APLL'
       AND "EmployeeNo"=$1
       AND "LeaveType"=$2
       AND "ActionType"=$3
       AND "PeriodMonth"=$4
       AND "PeriodYear"=$5
     ORDER BY "ActionDate" DESC
     LIMIT 1`,
    [expected.employeeNo, expected.leaveType, expected.actionType, expected.periodMonth, expected.periodYear]
  );

  const histRow = histRows[0] ?? null;

  // 5. Capture AFTER state
  const afterRows = await query<Record<string, unknown>>(
    `SELECT "LeaveBalance","LeaveBalanceBefore","LeaveBalanceBeforeExpiredDate"
     FROM "PeMasterLeave"
     WHERE "CompanyCode"='APLL' AND "EmployeeNo"=$1 AND "LeaveCode"=$2`,
    [primarySetup.employeeNo, primarySetup.leaveCode]
  );
  const after = afterRows[0] ?? null;

  // 6. Validate
  if (expected.shouldNotExist) {
    // Expect NO record in history
    if (!histRow) {
      return { id: scenario.id, status: 'pass', message: 'Record tidak ada — sesuai ekspektasi (skip)', before, after, expected };
    } else {
      return { id: scenario.id, status: 'fail', message: `Harusnya skip tapi ada record: ActionType=${histRow.ActionType}`, before, after, expected };
    }
  }

  if (!histRow) {
    return { id: scenario.id, status: 'fail', message: `Record ${expected.actionType} untuk ${expected.leaveType} tidak ditemukan di history`, before, after, expected };
  }

  // Check lbAfter
  if (expected.lbAfter !== undefined) {
    const actual = Number(histRow.LBAfterTopUp);
    if (Math.abs(actual - expected.lbAfter) > 0.01) {
      return {
        id: scenario.id, status: 'fail',
        message: `LBAfter expected ${expected.lbAfter}, got ${actual}`,
        before, after, expected,
      };
    }
  }

  // Check lbbAfter
  if (expected.lbbAfter !== undefined) {
    const actual = Number(histRow.LBBAfterTopUp);
    if (Math.abs(actual - expected.lbbAfter) > 0.01) {
      return {
        id: scenario.id, status: 'fail',
        message: `LBBAfter expected ${expected.lbbAfter}, got ${actual}`,
        before, after, expected,
      };
    }
  }

  // Check lbAfterMax (carry cap — should be <= max)
  if (expected.lbAfterMax !== undefined) {
    const actual = Number(histRow.LBBAfterTopUp);
    if (actual > expected.lbAfterMax) {
      return {
        id: scenario.id, status: 'fail',
        message: `Carry over ${actual} melebihi max ${expected.lbAfterMax}`,
        before, after, expected,
      };
    }
  }

  return { id: scenario.id, status: 'pass', message: 'Semua validasi lolos ✓', before, after, expected };
}

// POST /api/test/run  { scenarioId?: string }
// If scenarioId is omitted → run all scenarios
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { scenarioId } = body as { scenarioId?: string };

    const toRun = scenarioId
      ? SCENARIOS.filter((s) => s.id === scenarioId)
      : SCENARIOS;

    if (!toRun.length) {
      return NextResponse.json({ error: `Scenario "${scenarioId}" tidak ditemukan` }, { status: 404 });
    }

    const results: ScenarioResult[] = [];
    for (const scenario of toRun) {
      const result = await runScenario(scenario);
      results.push(result);
    }

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;

    return NextResponse.json({ results, summary: { total: results.length, passed, failed } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/test/run → return scenario list (no DB)
export async function GET() {
  return NextResponse.json(
    SCENARIOS.map(({ id, category, emoji, name, description, runDate, expected }) => {
      const emp = TEST_EMPLOYEES.find(e => e.EmployeeNo === expected.employeeNo);
      return {
        id, category, emoji, name, description, runDate,
        employeeNo:   expected.employeeNo,
        employeeName: emp?.FullName ?? expected.employeeNo,
        expected,
      };
    })
  );
}
