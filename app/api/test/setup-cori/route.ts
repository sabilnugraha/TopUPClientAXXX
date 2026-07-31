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

      // ── Special override: TCORI-16 anniversary jatuh BESOK ────────────────
      // CSD = (besok - 1 tahun). Bulan/tahun anniversary cocok dengan periode
      // berjalan, tapi tanggalnya belum lewat → GRANT12 harus ditolak.
      // Kalau hari ini tanggal terakhir bulan, "besok" jatuh di bulan depan —
      // syarat bulan pun tidak cocok, jadi tetap ditolak. Aman di segala tanggal.
      if (emp.employeeNo === 'TCORI-16') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setFullYear(tomorrow.getFullYear() - 1);
        finalCsd = tomorrow.toISOString().slice(0, 10);
      }

      // ── Special override: TCORI-17 anniversary CI jatuh BESOK ─────────────
      // EPD = (besok - 5 tahun). Kelipatan 5 terpenuhi, bulan cocok, tapi
      // tanggalnya belum lewat → CI harus ditolak.
      let finalEpd = epd;
      if (emp.employeeNo === 'TCORI-17') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setFullYear(tomorrow.getFullYear() - 5);
        finalEpd = tomorrow.toISOString().slice(0, 10);
      }

      // ── Upsert PeMaster ──────────────────────────────────────────────────
      // NOT NULL columns yang tidak relevan buat test topup diisi placeholder
      // ('-' / false / 0 / NOW()) — hanya dipakai saat INSERT pertama kali,
      // tidak disentuh lagi di DO UPDATE SET.
      await query(
        `INSERT INTO "PeMaster"(
           "CompanyCode","EmployeeNo","FullName","JoinDate","Gender","RecordStatus",
           "EmploymentStatus","ContractStartDate","EffectivePermanentDate",
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
           $1,$2,$3,$4,$5,$6,$7,$8,$9,
           '-', COALESCE($4::timestamp, NOW()), '-',
           false,false,false,false,false,
           false,false,false,
           '-',1,false,
           false,false,false,false,
           false,false,false,
           false,false,false,false,
           false,false,
           0,NOW(),'System',NOW(),'System'
         )
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
          finalCsd, finalEpd,
        ]
      );
      empCreated++;

      // ── Upsert PeMasterLeave for AL and CI ───────────────────────────────
      for (const code of CORI_LEAVE_CODES) {
        await query(
          `INSERT INTO "PeMasterLeave"(
             "CompanyCode","EmployeeNo","LeaveCode",
             "LeaveBalance","LeaveBalanceBefore","ChangedBy","ChangedNo",
             "CreatedDate","CreatedBy","ChangedDate"
           )
           VALUES ($1,$2,$3,0,0,'TestSetupCori',0,NOW(),'TestSetupCori',NOW())
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
