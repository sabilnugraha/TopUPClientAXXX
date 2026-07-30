import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const CORI_COMPANIES  = ['CORI', 'CII'];
const LOGW_COMPANIES  = ['LOGW'];
const APLL_LEAVE_INIT = ['AL','PH','HAID','KHITAN/BABTIS_ANAK','ISTRI_MELAHIRKAN','ML','KELUARGA_MENINGGAL','MELAHIRKAN','MENIKAHKAN_ANAK','KEGUGURAN','ISTRI_KEGUGURAN'];
const CORI_LEAVE_INIT = ['AL','CI'];
const LOGW_LEAVE_INIT = ['AL'];

// GET /api/karyawan?search=&companyCode=&companyGroup=CORI&status=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search       = searchParams.get('search')       ?? '';
  const companyCode  = searchParams.get('companyCode')  ?? '';
  const companyGroup = searchParams.get('companyGroup') ?? '';
  const status       = searchParams.get('status')       ?? '';

  const conditions: string[] = [];
  const values: unknown[]    = [];
  let idx = 1;

  if (search) {
    conditions.push(`(p."EmployeeNo" ILIKE $${idx} OR p."FullName" ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  if (companyCode) {
    conditions.push(`p."CompanyCode" = $${idx++}`);
    values.push(companyCode);
  } else if (companyGroup === 'CORI') {
    conditions.push(`p."CompanyCode" IN ('CORI','CII')`);
  }
  if (status) {
    conditions.push(`p."RecordStatus" = $${idx++}`);
    values.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const rows = await query(
      `SELECT
        p."CompanyCode",
        p."EmployeeNo",
        p."FullName",
        p."JoinDate",
        p."Gender",
        p."RecordStatus",
        p."EmploymentStatus",
        p."ContractStartDate",
        p."EffectivePermanentDate",
        pl."LevelCode"
      FROM "PeMaster" p
      LEFT JOIN "PeMasterLevel" pl
        ON pl."CompanyCode" = p."CompanyCode"
       AND pl."EmployeeNo"  = p."EmployeeNo"
       AND pl."LevelType"   = '3'
      ${where}
      ORDER BY p."CompanyCode", p."EmployeeNo"
      LIMIT 200`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/karyawan — create + auto-init PeMasterLeave
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      CompanyCode, EmployeeNo, FullName, JoinDate, Gender, RecordStatus,
      EmploymentStatus, ContractStartDate, EffectivePermanentDate,
      LevelCode,
    } = body;

    const isCori = CORI_COMPANIES.includes(CompanyCode);
    const isLogw = LOGW_COMPANIES.includes(CompanyCode);

    // NOT NULL columns pada PeMaster yang tidak diisi lewat form ini diisi nilai
    // placeholder ('-' / false / 0 / NOW()) — tabel PeMaster adalah tabel HR penuh,
    // tapi tool ini cuma butuh subset kolomnya untuk keperluan topup cuti.
    if (isCori) {
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
         ) VALUES (
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
         )`,
        [
          CompanyCode, EmployeeNo, FullName, JoinDate, Gender, RecordStatus ?? 'A',
          EmploymentStatus ?? 'C',
          ContractStartDate      || null,
          EffectivePermanentDate || null,
        ]
      );
    } else {
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
         ) VALUES (
           $1,$2,$3,$4,$5,$6,
           '-', COALESCE($4::timestamp, NOW()), '-',
           false,false,false,false,false,
           false,false,false,
           '-',1,false,
           false,false,false,false,
           false,false,false,
           false,false,false,false,
           false,false,
           0,NOW(),'System',NOW(),'System'
         )`,
        [CompanyCode, EmployeeNo, FullName, JoinDate, Gender, RecordStatus ?? 'A']
      );
    }

    // LOGW: level karyawan wajib ada di PeMasterLevel (LevelType '3'),
    // karena TopUpLOGWINV2 join ke tabel itu untuk cari jatah distribusinya.
    // Karyawan tanpa baris ini tidak akan pernah diproses top-up.
    if (isLogw && LevelCode) {
      await query(
        `INSERT INTO "PeMasterLevel"("CompanyCode","EmployeeNo","LevelType","LevelCode")
         VALUES ($1,$2,'3',$3)
         ON CONFLICT ("CompanyCode","EmployeeNo","LevelType") DO UPDATE SET
           "LevelCode" = EXCLUDED."LevelCode"`,
        [CompanyCode, EmployeeNo, LevelCode]
      );
    }

    const leaveCodes = isCori ? CORI_LEAVE_INIT : isLogw ? LOGW_LEAVE_INIT : APLL_LEAVE_INIT;
    for (const code of leaveCodes) {
      await query(
        `INSERT INTO "PeMasterLeave"(
           "CompanyCode","EmployeeNo","LeaveCode","LeaveBalance","LeaveBalanceBefore",
           "ChangedBy","ChangedNo","CreatedDate","CreatedBy","ChangedDate"
         )
         VALUES ($1,$2,$3,0,0,'System',0,NOW(),'System',NOW())
         ON CONFLICT ("CompanyCode","EmployeeNo","LeaveCode") DO NOTHING`,
        [CompanyCode, EmployeeNo, code]
      );
    }

    return NextResponse.json({ ok: true, leaveCodesInitialized: leaveCodes.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
