import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { CORI_TEST_EMPLOYEES, CORI_LEAVE_CODES, firstOfMonthOffset } from '@/lib/scenarios-cori';

// POST /api/test/setup-cori
// Creates CORI/CII test employees with dates computed relative to NOW()
export async function POST() {
  try {
    const now    = new Date();
    const year   = now.getFullYear();
    const month  = now.getMonth(); // 0-indexed for Date constructor

    let empCreated   = 0;
    let leaveCreated = 0;

    for (const emp of CORI_TEST_EMPLOYEES) {
      // ── Compute concrete dates from offsets ──────────────────────────────
      const csd = emp.contractStartDateOffset !== null
        ? firstOfMonthOffset(now, emp.contractStartDateOffset)
        : null;

      const epd = emp.effectivePermanentDateOffset !== null
        ? firstOfMonthOffset(now, emp.effectivePermanentDateOffset)
        : null;

      const joinDate = firstOfMonthOffset(now, emp.joinDateOffset);

      // ── Special override: TCORI-04 anniversary is NEXT month ─────────────
      // CSD = first of next month, shifted back 1 year
      // e.g. now = July 2026 → next month = Aug 2026 → CSD = Aug 2025
      let finalCsd = csd;
      if (emp.employeeNo === 'TCORI-04') {
        const nextMonth = new Date(year, month + 1, 1);
        const d = new Date(nextMonth);
        d.setFullYear(d.getFullYear() - 1);
        finalCsd = d.toISOString().slice(0, 10);
      }

      // ── Upsert PeMaster ──────────────────────────────────────────────────
      await query(
        `INSERT INTO "PeMaster"(
           "CompanyCode","EmployeeNo","FullName","JoinDate","Gender","RecordStatus",
           "EmploymentStatus","ContractStartDate","EffectivePermanentDate"
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT ("CompanyCode","EmployeeNo") DO UPDATE SET
           "FullName"               = EXCLUDED."FullName",
           "JoinDate"               = EXCLUDED."JoinDate",
           "Gender"                 = EXCLUDED."Gender",
           "RecordStatus"           = EXCLUDED."RecordStatus",
           "EmploymentStatus"       = EXCLUDED."EmploymentStatus",
           "ContractStartDate"      = EXCLUDED."ContractStartDate",
           "EffectivePermanentDate" = EXCLUDED."EffectivePermanentDate"`,
        [
          emp.companyCode, emp.employeeNo, emp.fullName, joinDate,
          emp.gender, emp.recordStatus, emp.employmentStatus,
          finalCsd, epd,
        ]
      );
      empCreated++;

      // ── Upsert PeMasterLeave for AL and CI ───────────────────────────────
      for (const code of CORI_LEAVE_CODES) {
        await query(
          `INSERT INTO "PeMasterLeave"(
             "CompanyCode","EmployeeNo","LeaveCode",
             "LeaveBalance","LeaveBalanceBefore","ChangedBy","ChangedNo"
           )
           VALUES ($1,$2,$3,0,0,'TestSetupCori',0)
           ON CONFLICT ("CompanyCode","EmployeeNo","LeaveCode") DO NOTHING`,
          [emp.companyCode, emp.employeeNo, code]
        );
        leaveCreated++;
      }
    }

    return NextResponse.json({
      ok: true,
      employees:    empCreated,
      leaveRecords: leaveCreated,
      periodYear:   year,
      periodMonth:  month + 1,
      message:      `${empCreated} karyawan test CORI/CII siap, ${leaveCreated} saldo cuti diinisialisasi`,
      dates: {
        oneYrAgo:   firstOfMonthOffset(now, -1),
        twoYrAgo:   firstOfMonthOffset(now, -2),
        fiveYrAgo:  firstOfMonthOffset(now, -5),
        tenYrAgo:   firstOfMonthOffset(now, -10),
        fifteenYrAgo: firstOfMonthOffset(now, -15),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
