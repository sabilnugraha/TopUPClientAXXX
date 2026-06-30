// ── Test Employee Definitions ─────────────────────────────────────────────────
export const TEST_EMPLOYEES = [
  { EmployeeNo: 'TEST-01', FullName: 'Test Budi (1-5yr, M)',       JoinDate: '2023-01-15', Gender: 'M' },
  { EmployeeNo: 'TEST-02', FullName: 'Test Sari (New Aug 2026, F)', JoinDate: '2026-08-01', Gender: 'F' },
  { EmployeeNo: 'TEST-03', FullName: 'Test Deni (PH Jun-3, M)',    JoinDate: '2021-06-03', Gender: 'M' },
  { EmployeeNo: 'TEST-04', FullName: 'Test Rini (6-10yr, F)',      JoinDate: '2016-05-10', Gender: 'F' },
  { EmployeeNo: 'TEST-05', FullName: 'Test Agus (>10yr, M)',       JoinDate: '2010-03-20', Gender: 'M' },
];

export const ALL_LEAVE_CODES = [
  'AL','PH','HAID',
  'KHITAN/BABTIS_ANAK','ISTRI_MELAHIRKAN','ML',
  'KELUARGA_MENINGGAL','MELAHIRKAN','MENIKAHKAN_ANAK',
  'KEGUGURAN','ISTRI_KEGUGURAN',
];

// ── Scenario Types ─────────────────────────────────────────────────────────────
export interface ScenarioSetup {
  employeeNo: string;
  leaveCode: string;
  lb: number;
  lbb: number;
  expiredDate: string | null;
  clearLeaveType: string;
  clearMonth: number;
  clearYear: number;
}

export interface ScenarioExpected {
  employeeNo: string;
  leaveType: string;
  actionType: string;
  periodMonth: number;
  periodYear: number;
  shouldNotExist?: boolean;  // true = expect record NOT found (skip scenario)
  lbAfter?: number;
  lbbAfter?: number;
  lbAfterMax?: number;       // for range check (carry cap)
}

export interface Scenario {
  id: string;
  category: string;
  emoji: string;
  name: string;
  description: string;
  runDate: string;           // ISO timestamp passed to fn as p_now
  setups: ScenarioSetup[];
  expected: ScenarioExpected;
}

// ── Scenario List ──────────────────────────────────────────────────────────────
export const SCENARIOS: Scenario[] = [
  // ── AL ────────────────────────────────────────────────────────────────────
  {
    id: 'al_prorata',
    category: 'AL',
    emoji: '📅',
    name: 'AL Prorata — Karyawan Baru (Non-Jan)',
    description: 'Join Aug 2026 → sisa 5 bulan → AL = round(5/12×15, 2) = 6.25 hari',
    runDate: '2026-08-01T00:00:00',
    setups: [{ employeeNo: 'TEST-02', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 8, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-02', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 8, periodYear: 2026, lbAfter: 6.25 },
  },
  {
    id: 'al_topup_jan_1_5yr',
    category: 'AL',
    emoji: '📆',
    name: 'AL Full Topup Jan — Tier 1-5 Tahun (15 hari)',
    description: 'TEST-01 (3yr), LB sisa=3 masuk Januari → carry=3, topup 15 hari',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'AL', lb: 3, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 15 },
  },
  {
    id: 'al_carry_cap',
    category: 'AL',
    emoji: '✂️',
    name: 'AL Carryover Cap — LB > Max Carry',
    description: 'TEST-01 (3yr, max carry=5), LB=10 masuk Januari → carry hanya 5 (terpotong)',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'AL', lb: 10, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'AL', actionType: 'CARRYOVER', periodMonth: 1, periodYear: 2026, lbbAfter: 5, lbAfterMax: 5 },
  },
  {
    id: 'al_topup_jan_6_10yr',
    category: 'AL',
    emoji: '📆',
    name: 'AL Full Topup Jan — Tier 6-10 Tahun (18 hari)',
    description: 'TEST-04 (10yr, May 2016), Januari → topup 18 hari',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-04', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-04', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 18 },
  },
  {
    id: 'al_topup_jan_10yr_plus',
    category: 'AL',
    emoji: '📆',
    name: 'AL Full Topup Jan — Tier >10 Tahun (21 hari)',
    description: 'TEST-05 (16yr, Mar 2010), Januari → topup 21 hari',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-05', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-05', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 21 },
  },
  {
    id: 'al_reset_lbb',
    category: 'AL',
    emoji: '🔄',
    name: 'AL Reset LBB — Expired 30 Juni',
    description: 'TEST-01 punya LBB=5 expire 30 Jun → run 1 Jul → RESET, LBB jadi 0',
    runDate: '2026-07-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'AL', lb: 12, lbb: 5, expiredDate: '2026-06-30', clearLeaveType: 'AL', clearMonth: 7, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'AL', actionType: 'RESET', periodMonth: 7, periodYear: 2026, lbbAfter: 0 },
  },
  {
    id: 'al_idempotent',
    category: 'AL',
    emoji: '🔁',
    name: 'AL Idempotency — Run 2x Periode Sama',
    description: 'Run Jan 2026 dua kali → topup kedua harus SKIPPED (tidak ada record duplikat)',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-05', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-05', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 21 },
    // Note: this will run ONCE (first time), then the idempotency run will check count=1 (not 2)
  },

  // ── PH ────────────────────────────────────────────────────────────────────
  {
    id: 'ph_anniversary_hit',
    category: 'PH',
    emoji: '🎂',
    name: 'PH Anniversary — Hari H ≥1 Tahun',
    description: 'TEST-03 join 3 Jun 2021 → run 3 Jun 2026 (5yr) → PH = 1',
    runDate: '2026-06-03T00:00:00',
    setups: [{ employeeNo: 'TEST-03', leaveCode: 'PH', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'PH', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-03', leaveType: 'PH', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, lbAfter: 1 },
  },
  {
    id: 'ph_anniversary_miss',
    category: 'PH',
    emoji: '📅',
    name: 'PH Skip — Bukan Hari Anniversary',
    description: 'TEST-03 join Jun 3 → run Jun 4 2026 → tidak ada PH (bukan hari-H)',
    runDate: '2026-06-04T00:00:00',
    setups: [{ employeeNo: 'TEST-03', leaveCode: 'PH', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'PH', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-03', leaveType: 'PH', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, shouldNotExist: true },
  },
  {
    id: 'ph_less_than_1yr',
    category: 'PH',
    emoji: '🚫',
    name: 'PH Skip — <1 Tahun Service',
    description: 'TEST-02 join Aug 1 2026 → run Aug 1 2027 (belum genap 1yr?) → sebenarnya genap 1yr, test dengan join date beda bulan',
    runDate: '2026-08-01T00:00:00',
    setups: [{ employeeNo: 'TEST-02', leaveCode: 'PH', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'PH', clearMonth: 8, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-02', leaveType: 'PH', actionType: 'TOPUP', periodMonth: 8, periodYear: 2026, shouldNotExist: true },
    // TEST-02 join Aug 1 2026, years_service at Aug 1 2026 = 0 → tidak dapat PH
  },

  // ── HAID ──────────────────────────────────────────────────────────────────
  {
    id: 'haid_female',
    category: 'HAID',
    emoji: '🌸',
    name: 'HAID — Karyawati (F) Dapat +2',
    description: 'TEST-04 (F) → run Jun 2026 → HAID = 2',
    runDate: '2026-06-01T00:00:00',
    setups: [{ employeeNo: 'TEST-04', leaveCode: 'HAID', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'HAID', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-04', leaveType: 'HAID', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, lbAfter: 2 },
  },
  {
    id: 'haid_male_skip',
    category: 'HAID',
    emoji: '⏭️',
    name: 'HAID Skip — Karyawan (M) Tidak Dapat',
    description: 'TEST-01 (M) → run Jun 2026 → tidak ada record HAID',
    runDate: '2026-06-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'HAID', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'HAID', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'HAID', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, shouldNotExist: true },
  },

  // ── JAN Fixed ─────────────────────────────────────────────────────────────
  {
    id: 'jan_fixed_ml',
    category: 'JAN',
    emoji: '💍',
    name: 'JAN Fixed — ML (Menikah) = 4 Hari',
    description: 'TEST-01 run Jan 2026 → ML di-set ke 4',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'ML', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'ML', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'ML', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 4 },
  },
  {
    id: 'jan_fixed_melahirkan',
    category: 'JAN',
    emoji: '👶',
    name: 'JAN Fixed — MELAHIRKAN = 90 Hari',
    description: 'TEST-04 (F) run Jan 2026 → MELAHIRKAN = 90',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-04', leaveCode: 'MELAHIRKAN', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'MELAHIRKAN', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-04', leaveType: 'MELAHIRKAN', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 90 },
  },
  {
    id: 'jan_fixed_non_jan_skip',
    category: 'JAN',
    emoji: '⏭️',
    name: 'JAN Fixed Skip — Non-Januari',
    description: 'TEST-01 run Juni 2026 → ML tidak di-topup (bukan Januari)',
    runDate: '2026-06-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'ML', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'ML', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'ML', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, shouldNotExist: true },
  },
];
