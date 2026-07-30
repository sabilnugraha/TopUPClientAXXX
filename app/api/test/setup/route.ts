import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { TEST_EMPLOYEES, ALL_LEAVE_CODES } from '@/lib/scenarios';

export async function POST() {
  try {
    let empCreated = 0;
    let leaveCreated = 0;

    for (const emp of TEST_EMPLOYEES) {
      // Upsert PeMaster
      // NOT NULL columns yang tidak relevan buat test topup diisi placeholder
      // ('-' / false / 0 / NOW()) — hanya dipakai saat INSERT pertama kali.
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
           'APLL',$1,$2,$3,$4,'A',
           '-', COALESCE($3::timestamp, NOW()), '-',
           false,false,false,false,false,
           false,false,false,
           '-',1,false,
           false,false,false,false,
           false,false,false,
           false,false,false,false,
           false,false,
           0,NOW(),'System',NOW(),'System'
         )
         ON CONFLICT ("CompanyCode","EmployeeNo") DO UPDATE
         SET "FullName"=EXCLUDED."FullName","JoinDate"=EXCLUDED."JoinDate",
             "Gender"=EXCLUDED."Gender","RecordStatus"=EXCLUDED."RecordStatus"`,
        [emp.EmployeeNo, emp.FullName, emp.JoinDate, emp.Gender]
      );
      empCreated++;

      // Upsert PeMasterLeave for all leave codes
      for (const code of ALL_LEAVE_CODES) {
        await query(
          `INSERT INTO "PeMasterLeave"(
             "CompanyCode","EmployeeNo","LeaveCode","LeaveBalance","LeaveBalanceBefore",
             "ChangedBy","ChangedNo","CreatedDate","CreatedBy","ChangedDate"
           )
           VALUES ('APLL',$1,$2,0,0,'TestSetup',0,NOW(),'TestSetup',NOW())
           ON CONFLICT ("CompanyCode","EmployeeNo","LeaveCode") DO NOTHING`,
          [emp.EmployeeNo, code]
        );
        leaveCreated++;
      }
    }

    return NextResponse.json({
      ok: true,
      employees: empCreated,
      leaveRecords: leaveCreated,
      message: `${empCreated} karyawan test siap, ${leaveCreated} saldo cuti diinisialisasi`,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
