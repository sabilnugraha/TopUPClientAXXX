// ─────────────────────────────────────────────────────────────────────────────
// CORI Test Scenario Definitions
// fn_topup_AL_Corinthian_daily() uses NOW() internally — all date anchors are
// computed relative to the server's current date at request time.
//
// Rules tested:
//   GRANT12   — AL +12 on 1-year anniversary of COALESCE(ContractStartDate, EffectivePermanentDate)
//   MONTHLY+1 — AL +1 every month for Contract (EmploymentStatus='C') employees
//   CI_5YEARS — CI service award when JoinDate years_service is multiple of 5,
//               guarded by NOT EXISTS in HistoryTopUpLeaves for last 5 years
// ─────────────────────────────────────────────────────────────────────────────

export const CORI_LEAVE_CODES = ['AL', 'CI'] as const;

// ── Date helpers ──────────────────────────────────────────────────────────────
/** Returns YYYY-MM-DD for the 1st of the month, offsetYears years from now */
export function firstOfMonthOffset(now: Date, offsetYears: number, offsetMonths = 0): string {
  const d = new Date(now.getFullYear() + offsetYears, now.getMonth() + offsetMonths, 1);
  return d.toISOString().slice(0, 10);
}
/** Returns YYYY-MM-DD, same as input date shifted by offsetYears years */
export function shiftYear(dateStr: string, offsetYears: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + offsetYears);
  return d.toISOString().slice(0, 10);
}

// ── Test Employee Definitions ─────────────────────────────────────────────────
export interface CoriTestEmployee {
  employeeNo:             string;
  companyCode:            'CORI' | 'CII';
  fullName:               string;
  gender:                 'M' | 'F';
  recordStatus:           'A' | 'I';
  employmentStatus:       'C' | 'P';
  // Offsets in years relative to NOW() — computed in setup endpoint
  contractStartDateOffset:      number | null; // null = no date
  effectivePermanentDateOffset: number | null;
  joinDateOffset:               number;
}

export const CORI_TEST_EMPLOYEES: CoriTestEmployee[] = [
  // ── GRANT12 test employees ──────────────────────────────────────────────────
  {
    employeeNo: 'TCORI-01', companyCode: 'CORI', fullName: 'Test Cori Budi (Grant12-CSD)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: -1, effectivePermanentDateOffset: null, joinDateOffset: -1,
    // CSD = 1yr ago → GRANT12 anniversary hit this month
  },
  {
    employeeNo: 'TCORI-02', companyCode: 'CORI', fullName: 'Test Cori Sari (Grant12-EPD)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -1, joinDateOffset: -1,
    // CSD=null, EPD=1yr ago → GRANT12 via EPD fallback
  },
  {
    employeeNo: 'TCORI-03', companyCode: 'CORI', fullName: 'Test Cori Rudi (Grant12-Coalesce)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: -1, effectivePermanentDateOffset: -2, joinDateOffset: -2,
    // CSD=1yr ago, EPD=2yr ago → COALESCE picks CSD → GRANT12 this month
  },
  {
    employeeNo: 'TCORI-04', companyCode: 'CORI', fullName: 'Test Cori Rina (Grant12-WrongMonth)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    joinDateOffset: -1,
    // Will override CSD to next-month (see setup) → anniversary is NEXT month → skip
  },
  {
    employeeNo: 'TCORI-05', companyCode: 'CORI', fullName: 'Test Cori Andi (No-Dates)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: 0,
    // Both CSD and EPD null → no GRANT12 ever
  },
  {
    employeeNo: 'TCORI-06', companyCode: 'CORI', fullName: 'Test Cori Dewi (Inactive)',
    gender: 'F', recordStatus: 'I', employmentStatus: 'C',
    contractStartDateOffset: -1, effectivePermanentDateOffset: null, joinDateOffset: -5,
    // RecordStatus=I → all rules skip
  },
  // ── MONTHLY+1 test employees ────────────────────────────────────────────────
  {
    employeeNo: 'TCORI-07', companyCode: 'CORI', fullName: 'Test Cori Joko (Monthly-Contract)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: 0,
    // Active Contract, no anniversary dates → Monthly+1 only
  },
  {
    employeeNo: 'TCORI-08', companyCode: 'CII', fullName: 'Test CII Mega (CII-Contract)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: -1, effectivePermanentDateOffset: null, joinDateOffset: -1,
    // CII company — GRANT12 + Monthly+1 both apply
  },
  {
    employeeNo: 'TCORI-09', companyCode: 'CORI', fullName: 'Test Cori Heru (Permanent-NoMonthly)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -2,
    // EmploymentStatus=P → no MONTHLY+1 (only contract gets monthly accrual)
  },
  // ── CI 5YEARS test employees ────────────────────────────────────────────────
  {
    employeeNo: 'TCORI-10', companyCode: 'CORI', fullName: 'Test Cori Anton (CI-5yr)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -5,
    // JoinDate = 5yr ago this month → CI_5YEARS eligible
  },
  {
    employeeNo: 'TCORI-11', companyCode: 'CORI', fullName: 'Test Cori Lia (CI-10yr)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -10,
    // JoinDate = 10yr ago this month → CI_5YEARS eligible
  },
  {
    employeeNo: 'TCORI-12', companyCode: 'CORI', fullName: 'Test Cori Dani (CI-NotEligible)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -3,
    // JoinDate = 3yr → not multiple of 5 → skip
  },
  {
    employeeNo: 'TCORI-13', companyCode: 'CORI', fullName: 'Test Cori Wati (CI-15yr)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -15,
    // JoinDate = 15yr → CI_5YEARS eligible (multiple of 5)
  },
];

// ── Scenario Types ─────────────────────────────────────────────────────────────
export type CoriActionType = 'GRANT12' | 'MONTHLY+1' | 'CI_5YEARS';
export type CoriCategory   = 'GRANT12' | 'MONTHLY+1' | 'CI_5YEARS' | 'EDGE';

export interface CoriScenarioSetup {
  employeeNo: string;
  leaveCode:  'AL' | 'CI';
  lb:         number;     // starting LeaveBalance
  lbb:        number;     // starting LeaveBalanceBefore (carry-over)
  // Pre-insert history entries before running the function (idempotency tests)
  preHistory?: {
    leaveType:   string;
    actionType:  string;
    /** Relative offset to current period_year (0=current, -1=last year, -5=5yr ago) */
    yearOffset:  number;
    periodMonth: number;
    lbBefore:    number;
    lbbBefore:   number;
    lbAfter:     number;
    lbbAfter:    number;
  }[];
}

export interface CoriScenarioExpected {
  employeeNo:      string;
  leaveType:       string;       // 'AL' or 'CI'
  actionType:      string;       // 'GRANT12', 'MONTHLY+1', 'CI_5YEARS'
  shouldNotExist?: boolean;      // true = expect function NOT to process this employee/action
  lbAfter?:        number;       // exact LBAfterTopUp value in history record
  lbDelta?:        number;       // LBAfterTopUp - LBPraTopUp should equal this
  lbDeltaMin?:     number;       // LBAfterTopUp - LBPraTopUp >= this (lower bound check)
}

export interface CoriScenario {
  id:          string;
  category:    CoriCategory;
  emoji:       string;
  name:        string;
  description: string;
  setups:      CoriScenarioSetup[];
  expected:    CoriScenarioExpected;
}

// ── Scenario List ──────────────────────────────────────────────────────────────
export const CORI_SCENARIOS: CoriScenario[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // GRANT12 — +12 AL on 1-year anniversary of COALESCE(ContractStartDate, EPD)
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:          'cori_g12_csd_hit',
    category:    'GRANT12',
    emoji:       '🎁',
    name:        'GRANT12 — CSD 1-Year Anniversary Hit',
    description: 'ContractStartDate = 1 tahun lalu bulan ini → GRANT12 +12 AL diberikan',
    setups: [{ employeeNo: 'TCORI-01', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-01', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_epd_fallback',
    category:    'GRANT12',
    emoji:       '🔀',
    name:        'GRANT12 — EPD Fallback (CSD null)',
    description: 'ContractStartDate=null, EffectivePermanentDate=1yr lalu → COALESCE pakai EPD → GRANT12 +12',
    setups: [{ employeeNo: 'TCORI-02', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-02', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_coalesce_priority',
    category:    'GRANT12',
    emoji:       '⚖️',
    name:        'GRANT12 — COALESCE Prioritas CSD over EPD',
    description: 'CSD=1yr lalu, EPD=2yr lalu → COALESCE pilih CSD → GRANT12 +12 bulan ini',
    setups: [{ employeeNo: 'TCORI-03', leaveCode: 'AL', lb: 5, lbb: 0 }],
    expected: { employeeNo: 'TCORI-03', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_wrong_month',
    category:    'GRANT12',
    emoji:       '📅',
    name:        'GRANT12 Skip — Anniversary Bulan Depan',
    description: 'CSD diset ke bulan depan tahun lalu → anniversary baru bulan depan → tidak ada GRANT12 bulan ini',
    setups: [{ employeeNo: 'TCORI-04', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-04', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
    // Note: TCORI-04 CSD is overridden to next-month-minus-1yr in setup endpoint
  },

  {
    id:          'cori_g12_no_date',
    category:    'GRANT12',
    emoji:       '❌',
    name:        'GRANT12 Skip — CSD dan EPD Keduanya Null',
    description: 'Tidak ada ContractStartDate maupun EffectivePermanentDate → tidak pernah dapat GRANT12',
    setups: [{ employeeNo: 'TCORI-05', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-05', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
  },

  {
    id:          'cori_g12_idempotent',
    category:    'GRANT12',
    emoji:       '🔁',
    name:        'GRANT12 Idempotency — Sudah Ada Record Bulan Ini',
    description: 'TCORI-01 (anniversary hit), tapi GRANT12 sudah ada di history periode ini → function skip, tidak double',
    setups: [{
      employeeNo: 'TCORI-01', leaveCode: 'AL', lb: 12, lbb: 0,
      preHistory: [{
        leaveType: 'AL', actionType: 'GRANT12',
        yearOffset: 0, periodMonth: 0,  // 0 = current month (computed in runner)
        lbBefore: 0, lbbBefore: 0, lbAfter: 12, lbbAfter: 0,
      }],
    }],
    expected: { employeeNo: 'TCORI-01', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
    // shouldNotExist = no NEW record added (preHistory still has 1 record but no duplicate)
  },

  {
    id:          'cori_g12_inactive',
    category:    'GRANT12',
    emoji:       '🚫',
    name:        'GRANT12 Skip — Karyawan Inactive (RecordStatus=I)',
    description: 'TCORI-06 anniversary hit tapi RecordStatus=I → function tidak memproses karyawan nonaktif',
    setups: [{ employeeNo: 'TCORI-06', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-06', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MONTHLY+1 — AL +1 tiap bulan untuk EmploymentStatus='C'
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:          'cori_monthly_contract_hit',
    category:    'MONTHLY+1',
    emoji:       '📈',
    name:        'MONTHLY+1 — Karyawan Contract Dapat +1',
    description: 'TCORI-07 active Contract, LB=0 → run → LB=1, ada record MONTHLY+1',
    setups: [{ employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY+1', lbDelta: 1 },
  },

  {
    id:          'cori_monthly_lb_increment',
    category:    'MONTHLY+1',
    emoji:       '🔢',
    name:        'MONTHLY+1 — LB Akumulasi (Dari LB=8)',
    description: 'TCORI-07 LB=8 sebelum run → MONTHLY+1 → LBAfter=9 (LBPra=8, delta=+1)',
    setups: [{ employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 8, lbb: 0 }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY+1', lbAfter: 9 },
  },

  {
    id:          'cori_monthly_idempotent',
    category:    'MONTHLY+1',
    emoji:       '🔁',
    name:        'MONTHLY+1 Idempotency — Run 2x Periode Sama',
    description: 'MONTHLY+1 sudah ada di history bulan ini → function tidak menambah lagi',
    setups: [{
      employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 1, lbb: 0,
      preHistory: [{
        leaveType: 'AL', actionType: 'MONTHLY+1',
        yearOffset: 0, periodMonth: 0,
        lbBefore: 0, lbbBefore: 0, lbAfter: 1, lbbAfter: 0,
      }],
    }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY+1', shouldNotExist: true },
  },

  {
    id:          'cori_monthly_permanent_skip',
    category:    'MONTHLY+1',
    emoji:       '🎗',
    name:        'MONTHLY+1 Skip — Karyawan Permanent (EmploymentStatus=P)',
    description: 'TCORI-09 Permanent, tidak ada anniversary → tidak dapat MONTHLY+1 (hanya Contract)',
    setups: [{ employeeNo: 'TCORI-09', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-09', leaveType: 'AL', actionType: 'MONTHLY+1', shouldNotExist: true },
  },

  {
    id:          'cori_monthly_inactive_skip',
    category:    'MONTHLY+1',
    emoji:       '🚫',
    name:        'MONTHLY+1 Skip — Karyawan Inactive',
    description: 'TCORI-06 RecordStatus=I → tidak dapat MONTHLY+1 meskipun EmploymentStatus=C',
    setups: [{ employeeNo: 'TCORI-06', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-06', leaveType: 'AL', actionType: 'MONTHLY+1', shouldNotExist: true },
  },

  {
    id:          'cori_monthly_cii',
    category:    'MONTHLY+1',
    emoji:       '🏢',
    name:        'MONTHLY+1 — CII Company Contract Juga Dapat',
    description: 'TCORI-08 company=CII, Contract → MONTHLY+1 berlaku untuk semua company (CORI+CII)',
    setups: [{ employeeNo: 'TCORI-08', leaveCode: 'AL', lb: 3, lbb: 0 }],
    expected: { employeeNo: 'TCORI-08', leaveType: 'AL', actionType: 'MONTHLY+1', lbDelta: 1 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CI_5YEARS — CI service award saat service years = kelipatan 5
  // Guard: NOT EXISTS history CI_5YEARS dalam 5 tahun terakhir
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:          'cori_ci_5yr_hit',
    category:    'CI_5YEARS',
    emoji:       '🏅',
    name:        'CI_5YEARS — Tepat 5 Tahun Service Bulan Ini',
    description: 'TCORI-10 JoinDate=5yr lalu bulan ini → service_years=5 (kelipatan 5) → CI_5YEARS diberikan',
    setups: [{ employeeNo: 'TCORI-10', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-10', leaveType: 'CI', actionType: 'CI_5YEARS', lbDeltaMin: 1 },
  },

  {
    id:          'cori_ci_10yr_hit',
    category:    'CI_5YEARS',
    emoji:       '🥇',
    name:        'CI_5YEARS — 10 Tahun Service (Kelipatan 5)',
    description: 'TCORI-11 JoinDate=10yr lalu → service=10 (kelipatan 5) → CI_5YEARS diberikan',
    setups: [{ employeeNo: 'TCORI-11', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-11', leaveType: 'CI', actionType: 'CI_5YEARS', lbDeltaMin: 1 },
  },

  {
    id:          'cori_ci_15yr_hit',
    category:    'CI_5YEARS',
    emoji:       '🏆',
    name:        'CI_5YEARS — 15 Tahun Service',
    description: 'TCORI-13 JoinDate=15yr lalu → service=15 (kelipatan 5) → CI_5YEARS diberikan',
    setups: [{ employeeNo: 'TCORI-13', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-13', leaveType: 'CI', actionType: 'CI_5YEARS', lbDeltaMin: 1 },
  },

  {
    id:          'cori_ci_not_eligible',
    category:    'CI_5YEARS',
    emoji:       '⏳',
    name:        'CI_5YEARS Skip — 3 Tahun Service (Bukan Kelipatan 5)',
    description: 'TCORI-12 JoinDate=3yr lalu → service=3, bukan kelipatan 5 → skip',
    setups: [{ employeeNo: 'TCORI-12', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-12', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },

  {
    id:          'cori_ci_idempotent_in_window',
    category:    'CI_5YEARS',
    emoji:       '🔁',
    name:        'CI_5YEARS Idempotency — Sudah Ada CI Dalam 5 Tahun Terakhir',
    description: 'TCORI-10 (5yr eligible), tapi CI_5YEARS sudah diberikan 2 tahun lalu (dalam window 5yr) → skip',
    setups: [{
      employeeNo: 'TCORI-10', leaveCode: 'CI', lb: 5, lbb: 0,
      preHistory: [{
        leaveType: 'CI', actionType: 'CI_5YEARS',
        yearOffset: -2, periodMonth: 0,   // 2 years ago (inside 5yr guard window)
        lbBefore: 0, lbbBefore: 0, lbAfter: 5, lbbAfter: 0,
      }],
    }],
    expected: { employeeNo: 'TCORI-10', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },

  {
    id:          'cori_ci_outside_window',
    category:    'CI_5YEARS',
    emoji:       '✅',
    name:        'CI_5YEARS — CI Lama (6 Tahun Lalu) di Luar Window Guard',
    description: 'TCORI-11 (10yr service), CI terakhir 6 tahun lalu (di luar window PeriodYear >= now-4) → CI baru diberikan',
    setups: [{
      employeeNo: 'TCORI-11', leaveCode: 'CI', lb: 5, lbb: 0,
      preHistory: [{
        leaveType: 'CI', actionType: 'CI_5YEARS',
        yearOffset: -6, periodMonth: 0,   // 6 years ago (OUTSIDE the 5yr guard window)
        lbBefore: 0, lbbBefore: 0, lbAfter: 5, lbbAfter: 0,
      }],
    }],
    expected: { employeeNo: 'TCORI-11', leaveType: 'CI', actionType: 'CI_5YEARS', lbDeltaMin: 1 },
  },

  {
    id:          'cori_ci_inactive_skip',
    category:    'CI_5YEARS',
    emoji:       '🚫',
    name:        'CI_5YEARS Skip — Karyawan Inactive',
    description: 'TCORI-06 JoinDate=5yr lalu tapi RecordStatus=I → CI_5YEARS tidak diberikan',
    setups: [{ employeeNo: 'TCORI-06', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-06', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },
];
