import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  LOGW_COMPANY, LOGW_LEAVE_CODES, LOGW_LEVEL_TYPE,
  LOGW_TEST_EMPLOYEES, distributionRows,
} from '@/lib/scenarios-logw';

// POST /api/test/setup-logw
// Creates LOGW test employees + PeMasterLevel + PeMasterLeave, and seeds
// TmLeaveDistributionConfig for the current year AND the previous year
// (the previous year is required by the Q4 Carry block).
export async function POST() {
  try {
    const year     = new Date().getFullYear();
    const prevYear = year - 1;

    let empCreated   = 0;
    let levelCreated = 0;
    let leaveCreated = 0;
    let distCreated  = 0;

    // ── 1. Distribution config (current + previous year) ────────────────────
    // Wipe then re-insert so re-running setup always yields a known state.
    await query(
      `DELETE FROM "TmLeaveDistributionConfig"
       WHERE "CompanyCode" = $1 AND "LeaveCode" = $2 AND "EffectiveYear" = ANY($3::int[])`,
      [LOGW_COMPANY, 'AL', [year, prevYear]]
    );

    for (const effYear of [prevYear, year]) {
      for (const d of distributionRows(effYear)) {
        await query(
          `INSERT INTO "TmLeaveDistributionConfig"
             ("CompanyCode","LeaveCode","EffectiveYear","LevelCode","MonthIndex","Qty","IsActive")
           VALUES ($1,$2,$3,$4,$5,$6,true)`,
          [LOGW_COMPANY, 'AL', d.effectiveYear, d.levelCode, d.monthIndex, d.qty]
        );
        distCreated++;
      }
    }

    // ── 2. Employees ─────────────────────────────────────────────────────────
    for (const emp of LOGW_TEST_EMPLOYEES) {
      const joinYear = year + emp.joinYearOffset;
      const joinDate = `${joinYear}-${String(emp.joinMonth).padStart(2, '0')}-${String(emp.joinDay).padStart(2, '0')}`;

      // PeMaster — NOT NULL columns yang tidak relevan diisi placeholder
      await query(
        `INSERT INTO "PeMaster"(
           "CompanyCode","EmployeeNo","FullName","JoinDate","Gender","RecordStatus",
           "BirthPlace","BirthDate","MaritalStatus",
           "FlagIsExpat","FlagMutationNPWPFrom","FlagMutationNPWPTo","FlagMutationToSameGroup","FlagMutationToOtherDirectory",
           "FlagIsDirect","FlagIsTemporary","FlagIsCommissioner",
           "AbsenteeismType","StartAtDay","FlagNotAbsent",
           "FlagAstekDeathNonAccident","FlagAstekWorkAccident","FlagAstekWorkAccident2","FlagAstekWorkAccident3",
           "FlagAstekPensionEmployee","FlagAstekPensionEmployer","FlagAstekHealthInsurance",
           "FlagTaxByGovernment","FlagPensionInsurance","FlagBPJSKesehatan","FlagBPJSTenagaKerja",
           "FlagExcludePayroll","FlagNotFinger",
           "ChangedNo","CreatedDate","CreatedBy","ChangedDate","ChangedBy"
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,
           '-', COALESCE($4::timestamp, NOW()), '-',
           false,false,false,false,false,
           false,false,false,
           '-',1,false,
           false,false,false,false,
           false,false,false,
           false,false,false,false,
           false,false,
           0,NOW(),'TestSetupLogw',NOW(),'TestSetupLogw'
         )
         ON CONFLICT ("CompanyCode","EmployeeNo") DO UPDATE SET
           "FullName"     = EXCLUDED."FullName",
           "JoinDate"     = EXCLUDED."JoinDate",
           "Gender"       = EXCLUDED."Gender",
           "RecordStatus" = EXCLUDED."RecordStatus"`,
        [LOGW_COMPANY, emp.employeeNo, emp.fullName, joinDate, emp.gender, emp.recordStatus]
      );
      empCreated++;

      // PeMasterLevel — LevelType '3' is what the function joins on.
      // Kolom audit (ChangedNo/CreatedDate/...) NOT NULL, ikut pola PeMasterLeave.
      await query(
        `INSERT INTO "PeMasterLevel"(
           "CompanyCode","EmployeeNo","LevelType","LevelCode",
           "ChangedNo","CreatedDate","CreatedBy","ChangedDate","ChangedBy"
         )
         VALUES ($1,$2,$3,$4,0,NOW(),'TestSetupLogw',NOW(),'TestSetupLogw')
         ON CONFLICT ("CompanyCode","LevelType","EmployeeNo") DO UPDATE SET
           "LevelCode"   = EXCLUDED."LevelCode",
           "ChangedDate" = NOW(),
           "ChangedBy"   = 'TestSetupLogw'`,
        [LOGW_COMPANY, emp.employeeNo, LOGW_LEVEL_TYPE, emp.levelCode]
      );
      levelCreated++;

      // PeMasterLeave
      for (const code of LOGW_LEAVE_CODES) {
        await query(
          `INSERT INTO "PeMasterLeave"(
             "CompanyCode","EmployeeNo","LeaveCode",
             "LeaveBalance","LeaveBalanceBefore","ChangedBy","ChangedNo",
             "CreatedDate","CreatedBy","ChangedDate"
           )
           VALUES ($1,$2,$3,0,0,'TestSetupLogw',0,NOW(),'TestSetupLogw',NOW())
           ON CONFLICT ("CompanyCode","EmployeeNo","LeaveCode") DO NOTHING`,
          [LOGW_COMPANY, emp.employeeNo, code]
        );
        leaveCreated++;
      }
    }

    return NextResponse.json({
      ok: true,
      employees:    empCreated,
      levels:       levelCreated,
      leaveRecords: leaveCreated,
      distConfig:   distCreated,
      years:        [prevYear, year],
      message:
        `${empCreated} karyawan test LOGW siap, ${leaveCreated} saldo cuti, ` +
        `${distCreated} baris distribusi (${prevYear} & ${year})`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
