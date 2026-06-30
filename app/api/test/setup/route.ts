import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { TEST_EMPLOYEES, ALL_LEAVE_CODES } from '@/lib/scenarios';

export async function POST() {
  try {
    let empCreated = 0;
    let leaveCreated = 0;

    for (const emp of TEST_EMPLOYEES) {
      // Upsert PeMaster
      await query(
        `INSERT INTO "PeMaster"("CompanyCode","EmployeeNo","FullName","JoinDate","Gender","RecordStatus")
         VALUES ('APLL',$1,$2,$3,$4,'A')
         ON CONFLICT ("CompanyCode","EmployeeNo") DO UPDATE
         SET "FullName"=EXCLUDED."FullName","JoinDate"=EXCLUDED."JoinDate",
             "Gender"=EXCLUDED."Gender","RecordStatus"=EXCLUDED."RecordStatus"`,
        [emp.EmployeeNo, emp.FullName, emp.JoinDate, emp.Gender]
      );
      empCreated++;

      // Upsert PeMasterLeave for all leave codes
      for (const code of ALL_LEAVE_CODES) {
        await query(
          `INSERT INTO "PeMasterLeave"("CompanyCode","EmployeeNo","LeaveCode","LeaveBalance","LeaveBalanceBefore","ChangedBy","ChangedNo")
           VALUES ('APLL',$1,$2,0,0,'TestSetup',0)
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
