import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  LOGW_COMPANY, LOGW_LEAVE_CODES, LOGW_LEVEL_TYPE,
  LOGW_TEST_EMPLOYEES,
} from '@/lib/scenarios-logw';

// POST /api/test/setup-logw
// Creates LOGW test employees + PeMasterLevel + PeMasterLeave.
//
// PENTING: TmLeaveDistributionConfig adalah DATA STATIS milik user — setup ini
// TIDAK PERNAH menulis/menghapus apa pun di tabel itu. Isinya hanya dibaca untuk
// dilaporkan balik, supaya kelihatan tahun mana saja yang tersedia.
export async function POST() {
  try {
    const year     = new Date().getFullYear();
    const prevYear = year - 1;

    let empCreated   = 0;
    let levelCreated = 0;
    let leaveCreated = 0;

    // ── 1. Cek distribusi (read-only) ────────────────────────────────────────
    const distRows = await query<{ EffectiveYear: number; cnt: string }>(
      `SELECT "EffectiveYear", COUNT(*)::text AS cnt
       FROM "TmLeaveDistributionConfig"
       WHERE "CompanyCode" = $1 AND "LeaveCode" = 'AL'
       GROUP BY "EffectiveYear" ORDER BY "EffectiveYear"`,
      [LOGW_COMPANY]
    );
    const distYears  = distRows.map((r) => Number(r.EffectiveYear));
    const hasCurYear = distYears.includes(year);
    const hasPrevYr  = distYears.includes(prevYear);

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

    const warnings: string[] = [];
    if (!hasCurYear) {
      warnings.push(
        `Tabel distribusi tahun ${year} tidak ditemukan — semua top-up akan menghasilkan 0.`
      );
    }
    if (!hasPrevYr) {
      warnings.push(
        `Tabel distribusi tahun ${prevYear} tidak ada — Q4 Carry tidak bisa membayar tunggakan ` +
        `karyawan yang masuk Okt–Des ${prevYear} (nilainya jadi 0).`
      );
    }

    return NextResponse.json({
      ok: true,
      employees:    empCreated,
      levels:       levelCreated,
      leaveRecords: leaveCreated,
      distYears,
      warnings,
      message:
        `${empCreated} karyawan test LOGWIN siap, ${leaveCreated} saldo cuti. ` +
        `Tabel distribusi tidak disentuh (tahun tersedia: ${distYears.join(', ') || 'tidak ada'})` +
        (warnings.length ? ` — ${warnings.join(' ')}` : ''),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
