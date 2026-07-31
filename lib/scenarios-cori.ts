// ─────────────────────────────────────────────────────────────────────────────
// CORI Test Scenario Definitions
// fn_topup_AL_Corinthian_daily() uses NOW() internally — all date anchors are
// computed relative to the server's current date at request time.
//
// Revisi Juli 2026 — tanggal referensi = COALESCE(ContractStartDate, EffectivePermanentDate).
// ContractStartDate SELALU diprioritaskan kalau tidak null, EffectivePermanentDate hanya
// dipakai kalau ContractStartDate null. Ini berlaku untuk C maupun P — EmploymentStatus
// TIDAK LAGI menentukan field mana yang dibaca.
//
// Rules tested:
//   GRANT12   — AL +12 on 1-year anniversary of COALESCE(ContractStartDate, EffectivePermanentDate)
//   MONTHLY+1 — AL +1 every month once COALESCE(ContractStartDate, EffectivePermanentDate) is
//               1+ year old (applies to both C and P)
//   CI_5YEARS — CI service award when years_service from COALESCE(ContractStartDate, EffectivePermanentDate)
//               is a multiple of 5, guarded by NOT EXISTS in HistoryTopUpLeaves for last 5 years
//   CAPPED    — GRANT12/MONTHLY+1 tidak menambah saldo saat AL sudah tepat 20 hari, tapi tetap
//               dicatat di HistoryTopUpLeaves (LBPraTopUp = LBAfterTopUp = 20) untuk audit.
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
    // CSD = 1yr ago this month → GRANT12 anniversary hit
  },
  {
    employeeNo: 'TCORI-02', companyCode: 'CORI', fullName: 'Test Cori Sari (NoGrant-EPDOnly)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -1, joinDateOffset: -1,
    // CSD=null → fallback ke EPD (1yr ago, anniversary bulan ini) → GRANT12 tetap diberikan
  },
  {
    employeeNo: 'TCORI-03', companyCode: 'CORI', fullName: 'Test Cori Rudi (Grant12-BothDates)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: -1, effectivePermanentDateOffset: -2, joinDateOffset: -2,
    // CSD=1yr ago, EPD=2yr ago → CSD selalu diprioritaskan → GRANT12 via CSD (EPD diabaikan)
  },
  {
    employeeNo: 'TCORI-15', companyCode: 'CORI', fullName: 'Test Cori Wawan (Grant12-PermanentButCSDWins)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: -1, effectivePermanentDateOffset: -3, joinDateOffset: -3,
    // Status Tetap (P), tapi CSD=1yr ago (anniversary bulan ini) & EPD=3yr ago (bukan anniversary).
    // Aturan lama: pakai EPD → belum eligible. Aturan baru: CSD diprioritaskan → GRANT12 diberikan.
  },
  {
    employeeNo: 'TCORI-04', companyCode: 'CORI', fullName: 'Test Cori Rina (Grant12-WrongMonth)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -1,
    // CSD overridden to next-month in setup → anniversary NEXT month → skip
  },
  {
    employeeNo: 'TCORI-05', companyCode: 'CORI', fullName: 'Test Cori Andi (No-Dates)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: 0,
    // CSD=null → no GRANT12 ever
  },
  {
    employeeNo: 'TCORI-06', companyCode: 'CORI', fullName: 'Test Cori Dewi (Inactive)',
    gender: 'F', recordStatus: 'I', employmentStatus: 'P',
    contractStartDateOffset: -6, effectivePermanentDateOffset: -5, joinDateOffset: -6,
    // Permanent, EPD=5yr ago (CI-eligible if active), RecordStatus=I → all rules skip
  },
  // ── MONTHLY+1 test employees ────────────────────────────────────────────────
  {
    employeeNo: 'TCORI-07', companyCode: 'CORI', fullName: 'Test Cori Joko (Monthly-Contract)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: -2, effectivePermanentDateOffset: null, joinDateOffset: -2,
    // Contract, CSD=2yr ago → MONTHLY+1 eligible, GRANT12 anniversary was 1yr ago (different year) → no GRANT12
  },
  {
    employeeNo: 'TCORI-08', companyCode: 'CII', fullName: 'Test CII Mega (CII-Contract)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: -2, effectivePermanentDateOffset: null, joinDateOffset: -2,
    // CII company, CSD=2yr ago → MONTHLY+1 eligible, no GRANT12 collision
  },
  {
    employeeNo: 'TCORI-09', companyCode: 'CORI', fullName: 'Test Cori Heru (Permanent-NoDates)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: null, joinDateOffset: -2,
    // Permanent, EPD=null, CSD=null → not eligible for MONTHLY+1 (needs EPD or CSD >= 1yr)
  },
  // ── CI 5YEARS test employees ─────────────────────────────────────────────────
  // Tanggal referensi CI = COALESCE(ContractStartDate, EffectivePermanentDate).
  // CSD sengaja diset null di bawah supaya benar-benar menguji jalur fallback EPD.
  // Syarat CI: MONTH(ref) = bulan berjalan, (tahun berjalan - tahun ref) kelipatan 5
  // dan >= 5, serta tanggal anniversary tahun ini sudah lewat.
  {
    employeeNo: 'TCORI-10', companyCode: 'CORI', fullName: 'Test Cori Anton (CI-5yr)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -5, joinDateOffset: -6,
    // CSD=null → fallback EPD=5yr ago this month → CI_5YEARS eligible
  },
  {
    employeeNo: 'TCORI-11', companyCode: 'CORI', fullName: 'Test Cori Lia (CI-10yr)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -10, joinDateOffset: -11,
    // CSD=null → fallback EPD=10yr ago this month → CI_5YEARS eligible
  },
  {
    employeeNo: 'TCORI-12', companyCode: 'CORI', fullName: 'Test Cori Dani (CI-NotEligible)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -3, joinDateOffset: -4,
    // CSD=null → fallback EPD=3yr ago → not multiple of 5 → skip
  },
  {
    employeeNo: 'TCORI-13', companyCode: 'CORI', fullName: 'Test Cori Wati (CI-15yr)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -15, joinDateOffset: -16,
    // CSD=null → fallback EPD=15yr ago this month → CI_5YEARS eligible
  },
  {
    employeeNo: 'TCORI-14', companyCode: 'CORI', fullName: 'Test Cori Bagas (CI-CSDPriorityOverEPD)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: -5, effectivePermanentDateOffset: -3, joinDateOffset: -5,
    // Status Tetap (P), CSD=5yr ago this month (multiple of 5) & EPD=3yr ago (bukan kelipatan 5).
    // Aturan lama: pakai EPD → belum eligible. Aturan baru: CSD diprioritaskan → CI_5YEARS diberikan.
  },
  {
    employeeNo: 'TCORI-16', companyCode: 'CORI', fullName: 'Test Cori Yoga (Grant12-BelumLewatTanggal)',
    gender: 'M', recordStatus: 'A', employmentStatus: 'C',
    contractStartDateOffset: -1, effectivePermanentDateOffset: null, joinDateOffset: -1,
    // CSD di-override di setup jadi (BESOK - 1 tahun), sehingga anniversary-nya
    // jatuh BESOK. Bulan & tahunnya cocok dengan periode berjalan, tapi tanggalnya
    // belum lewat → GRANT12 harus DITOLAK. Menguji revisi "ketat sampai tanggal".
  },
  {
    employeeNo: 'TCORI-17', companyCode: 'CORI', fullName: 'Test Cori Nadia (CI-BelumLewatTanggal)',
    gender: 'F', recordStatus: 'A', employmentStatus: 'P',
    contractStartDateOffset: null, effectivePermanentDateOffset: -5, joinDateOffset: -6,
    // EPD di-override di setup jadi (BESOK - 5 tahun): kelipatan 5 terpenuhi dan
    // bulannya cocok, tapi tanggal anniversary tahun ini belum lewat → CI DITOLAK.
  },
];

// ── Scenario Types ─────────────────────────────────────────────────────────────
export type CoriActionType = 'GRANT12' | 'MONTHLY+1' | 'CI_5YEARS' | 'GRANT12_CAPPED' | 'MONTHLY1_CAPPED';
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
  id:               string;
  category:         CoriCategory;
  emoji:            string;
  name:             string;
  description:      string;
  setups:           CoriScenarioSetup[];
  expected:         CoriScenarioExpected;
  /** Run function twice: first run should give topup, second run should skip (true idempotency) */
  runFunctionTwice?: boolean;
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
    name:        'Dapat 12 Hari Cuti — Genap 1 Tahun Sejak Awal Kontrak',
    description: 'Karyawan yang tanggal mulai kontraknya tepat 1 tahun lalu secara otomatis mendapat tambahan 12 hari cuti tahunan.',
    setups: [{ employeeNo: 'TCORI-01', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-01', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_epd_fallback',
    category:    'GRANT12',
    emoji:       '🔀',
    name:        'Dapat 12 Hari Cuti — Karyawan Permanen Genap 1 Tahun Sejak Pengangkatan',
    description: 'Karyawan permanen mendapat 12 hari cuti saat tanggal pengangkatan permanennya genap 1 tahun. Kontrak tidak dibutuhkan.',
    setups: [{ employeeNo: 'TCORI-02', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-02', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_coalesce_priority',
    category:    'GRANT12',
    emoji:       '⚖️',
    name:        'Dapat 12 Hari Cuti — Kedua Tanggal Ada, ContractStartDate yang Dipakai',
    description: 'Karyawan yang punya kedua tanggal (CSD dan EPD) tetap menggunakan ContractStartDate sebagai acuan — EffectivePermanentDate diabaikan selama CSD masih terisi.',
    setups: [{ employeeNo: 'TCORI-03', leaveCode: 'AL', lb: 5, lbb: 0 }],
    expected: { employeeNo: 'TCORI-03', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_csd_priority_over_permanent_status',
    category:    'GRANT12',
    emoji:       '⚡',
    name:        'Dapat 12 Hari Cuti — Karyawan Tetap Tetap Pakai Contract Start Date (Bukan EPD)',
    description: 'Revisi baru: ContractStartDate selalu diprioritaskan kapan pun tersedia, sekalipun karyawan sudah berstatus Tetap (P) dan punya Effective Permanent Date. Sebelumnya karyawan Tetap selalu memakai EPD — sekarang tidak lagi.',
    setups: [{ employeeNo: 'TCORI-15', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-15', leaveType: 'AL', actionType: 'GRANT12', lbDelta: 12 },
  },

  {
    id:          'cori_g12_belum_lewat_tanggal',
    category:    'GRANT12',
    emoji:       '⏳',
    name:        '12 Hari Cuti Belum Diberikan — Tanggal Genapnya Belum Lewat',
    description:
      'Karyawan yang anniversary kontraknya jatuh di bulan ini tapi tanggalnya belum tiba ' +
      'tidak mendapat 12 hari cuti hari ini. Contoh: anniversary 31 Juli, proses dijalankan ' +
      '30 Juli — haknya baru cair besok. Sebelumnya sistem hanya mencocokkan bulan, sehingga ' +
      'cuti bisa cair lebih awal sampai 30 hari.',
    setups: [{ employeeNo: 'TCORI-16', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-16', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
  },

  {
    id:          'cori_g12_capped_at_max',
    category:    'GRANT12',
    emoji:       '🧢',
    name:        '12 Hari Cuti Tidak Ditambahkan — Saldo AL Sudah Mentok 20 Hari',
    description: 'Karyawan yang eligible GRANT12 tapi saldo AL-nya sudah tepat 20 hari tidak mendapat tambahan saldo. Proses tetap tercatat di riwayat top-up (saldo sebelum dan sesudah sama-sama 20) untuk keperluan audit.',
    setups: [{ employeeNo: 'TCORI-01', leaveCode: 'AL', lb: 20, lbb: 0 }],
    expected: { employeeNo: 'TCORI-01', leaveType: 'AL', actionType: 'GRANT12_CAPPED', lbAfter: 20, lbDelta: 0 },
  },

  {
    id:          'cori_g12_wrong_month',
    category:    'GRANT12',
    emoji:       '📅',
    name:        '12 Hari Cuti Belum Diberikan — Anniversary Baru Bulan Depan',
    description: 'Jika tanggal anniversary kontrak jatuh bulan depan, tambahan 12 hari cuti belum diberikan bulan ini. Akan diberikan tepat di bulan yang benar.',
    setups: [{ employeeNo: 'TCORI-04', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-04', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
    // Note: TCORI-04 CSD is overridden to next-month-minus-1yr in setup endpoint
  },

  {
    id:          'cori_g12_no_date',
    category:    'GRANT12',
    emoji:       '❌',
    name:        '12 Hari Cuti Tidak Diberikan — Tanggal Kontrak dan Pengangkatan Kosong',
    description: 'Karyawan tanpa tanggal kontrak maupun pengangkatan tidak bisa mendapat 12 hari cuti anniversary karena tidak ada acuan tanggal.',
    setups: [{ employeeNo: 'TCORI-05', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-05', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
  },

  {
    id:               'cori_g12_idempotent',
    category:         'GRANT12',
    emoji:            '🔁',
    name:             '12 Hari Cuti Tidak Diberikan Dua Kali — Sudah Diberikan Bulan Ini',
    description:      'Jika 12 hari cuti anniversary sudah diberikan bulan ini, menjalankan ulang tidak akan menambah saldo lagi. Tidak ada dobel topup.',
    runFunctionTwice: true,
    // Run 1: function gives GRANT12 (LB 0→12). Run 2: guard blocks, no new record.
    setups: [{ employeeNo: 'TCORI-01', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-01', leaveType: 'AL', actionType: 'GRANT12', shouldNotExist: true },
  },

  {
    id:          'cori_g12_inactive',
    category:    'GRANT12',
    emoji:       '🚫',
    name:        '12 Hari Cuti Tidak Diberikan — Karyawan Sudah Tidak Aktif',
    description: 'Karyawan dengan status nonaktif tidak menerima topup cuti apapun, meskipun tanggal anniversarynya tepat bulan ini.',
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
    name:        'Cuti Bertambah 1 Hari — Karyawan Kontrak Aktif',
    description: 'Setiap bulan, karyawan kontrak aktif mendapat tambahan 1 hari cuti tahunan yang diakumulasi.',
    setups: [{ employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY+1', lbDelta: 1 },
  },

  {
    id:          'cori_monthly_lb_increment',
    category:    'MONTHLY+1',
    emoji:       '🔢',
    name:        'Cuti Bulanan Terakumulasi di Atas Saldo yang Ada',
    description: 'Tambahan 1 hari per bulan ditumpuk di atas saldo cuti yang sudah ada. Contoh: saldo 8 hari menjadi 9 hari.',
    setups: [{ employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 8, lbb: 0 }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY+1', lbAfter: 9 },
  },

  {
    id:               'cori_monthly_idempotent',
    category:         'MONTHLY+1',
    emoji:            '🔁',
    name:             'Cuti Bulanan Tidak Diberikan Dua Kali — Sudah Diberikan Bulan Ini',
    description:      'Jika tambahan cuti bulanan sudah diberikan bulan ini, menjalankan ulang tidak akan menambah saldo lagi.',
    runFunctionTwice: true,
    // Run 1: function gives MONTHLY+1 (LB 0→1). Run 2: guard blocks, no new record.
    setups: [{ employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY+1', shouldNotExist: true },
  },

  {
    id:          'cori_monthly_permanent_skip',
    category:    'MONTHLY+1',
    emoji:       '🎗',
    name:        'Cuti Bulanan Tidak Diberikan — Karyawan Permanen Tanpa Tanggal Kontrak atau Pengangkatan',
    description: 'Karyawan permanen bisa mendapat cuti bulanan jika ada tanggal kontrak atau pengangkatan. Jika keduanya kosong, tidak ada cuti bulanan.',
    setups: [{ employeeNo: 'TCORI-09', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-09', leaveType: 'AL', actionType: 'MONTHLY+1', shouldNotExist: true },
  },

  {
    id:          'cori_monthly_inactive_skip',
    category:    'MONTHLY+1',
    emoji:       '🚫',
    name:        'Cuti Bulanan Tidak Diberikan — Karyawan Sudah Tidak Aktif',
    description: 'Karyawan nonaktif tidak mendapat tambahan cuti bulanan, meskipun statusnya masih tertulis kontrak.',
    setups: [{ employeeNo: 'TCORI-06', leaveCode: 'AL', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-06', leaveType: 'AL', actionType: 'MONTHLY+1', shouldNotExist: true },
  },

  {
    id:          'cori_monthly_cii',
    category:    'MONTHLY+1',
    emoji:       '🏢',
    name:        'Cuti Bulanan Berlaku Juga untuk Karyawan CII',
    description: 'Aturan tambahan 1 hari per bulan berlaku untuk semua perusahaan dalam grup (CORI maupun CII).',
    setups: [{ employeeNo: 'TCORI-08', leaveCode: 'AL', lb: 3, lbb: 0 }],
    expected: { employeeNo: 'TCORI-08', leaveType: 'AL', actionType: 'MONTHLY+1', lbDelta: 1 },
  },

  {
    id:          'cori_monthly_capped_at_max',
    category:    'MONTHLY+1',
    emoji:       '🧢',
    name:        'Cuti Bulanan Tidak Ditambahkan — Saldo AL Sudah Mentok 20 Hari',
    description: 'Karyawan yang eligible MONTHLY+1 tapi saldo AL-nya sudah tepat 20 hari tidak mendapat tambahan saldo. Proses tetap tercatat di riwayat top-up (saldo sebelum dan sesudah sama-sama 20) untuk keperluan audit.',
    setups: [{ employeeNo: 'TCORI-07', leaveCode: 'AL', lb: 20, lbb: 0 }],
    expected: { employeeNo: 'TCORI-07', leaveType: 'AL', actionType: 'MONTHLY1_CAPPED', lbAfter: 20, lbDelta: 0 },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CI_5YEARS — CI service award saat service years = kelipatan 5
  // Guard: NOT EXISTS history CI_5YEARS dalam 5 tahun terakhir
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:          'cori_ci_5yr_hit',
    category:    'CI_5YEARS',
    emoji:       '🏅',
    name:        'Penghargaan Masa Kerja — Genap 5 Tahun',
    description: 'Karyawan yang tepat bulan ini mencapai 5 tahun masa kerja mendapat cuti penghargaan (CI) dari perusahaan.',
    setups: [{ employeeNo: 'TCORI-10', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-10', leaveType: 'CI', actionType: 'CI_5YEARS', lbDelta: 22 },
  },

  {
    id:          'cori_ci_10yr_hit',
    category:    'CI_5YEARS',
    emoji:       '🥇',
    name:        'Penghargaan Masa Kerja — Genap 10 Tahun',
    description: 'Karyawan yang tepat bulan ini mencapai 10 tahun masa kerja mendapat cuti penghargaan berikutnya dari perusahaan.',
    setups: [{ employeeNo: 'TCORI-11', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-11', leaveType: 'CI', actionType: 'CI_5YEARS', lbDelta: 22 },
  },

  {
    id:          'cori_ci_15yr_hit',
    category:    'CI_5YEARS',
    emoji:       '🏆',
    name:        'Penghargaan Masa Kerja — Genap 15 Tahun',
    description: 'Karyawan yang tepat bulan ini mencapai 15 tahun masa kerja mendapat cuti penghargaan dari perusahaan.',
    setups: [{ employeeNo: 'TCORI-13', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-13', leaveType: 'CI', actionType: 'CI_5YEARS', lbDelta: 22 },
  },

  {
    id:          'cori_ci_belum_lewat_tanggal',
    category:    'CI_5YEARS',
    emoji:       '📆',
    name:        'Penghargaan Masa Kerja Belum Diberikan — Tanggal Genapnya Belum Lewat',
    description:
      'Karyawan yang tahun ini genap kelipatan 5 tahun tapi tanggalnya belum tiba belum berhak ' +
      'menerima penghargaan. Contoh: genap 5 tahun pada 15 Juli, dijalankan 14 Juli — belum dapat. ' +
      'Haknya cair mulai tanggal 15 sampai akhir Juli, dan tidak bocor ke tahun berikutnya.',
    setups: [{ employeeNo: 'TCORI-17', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-17', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },

  {
    id:          'cori_ci_not_eligible',
    category:    'CI_5YEARS',
    emoji:       '⏳',
    name:        'Penghargaan Masa Kerja Belum Diberikan — Baru 3 Tahun',
    description: 'Penghargaan hanya diberikan di kelipatan 5 tahun. Karyawan dengan masa kerja 3 tahun belum berhak menerima.',
    setups: [{ employeeNo: 'TCORI-12', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-12', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },

  {
    id:          'cori_ci_idempotent_in_window',
    category:    'CI_5YEARS',
    emoji:       '🔁',
    name:        'Penghargaan Tidak Diberikan Lagi — Sudah Diterima dalam 5 Tahun Terakhir',
    description: 'Jika karyawan sudah mendapat penghargaan masa kerja dalam 5 tahun terakhir, tidak akan diberikan lagi meskipun sudah mencapai kelipatan 5 tahun berikutnya.',
    setups: [{
      employeeNo: 'TCORI-10', leaveCode: 'CI', lb: 5, lbb: 0,
      preHistory: [{
        leaveType: 'CI', actionType: 'CI_5YEARS',
        yearOffset: -2, periodMonth: 0,
        lbBefore: 0, lbbBefore: 0, lbAfter: 5, lbbAfter: 0,
      }],
    }],
    expected: { employeeNo: 'TCORI-10', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },

  {
    id:          'cori_ci_outside_window',
    category:    'CI_5YEARS',
    emoji:       '✅',
    name:        'Penghargaan Diberikan Lagi — Penghargaan Terakhir Lebih dari 5 Tahun Lalu',
    description: 'Jika penghargaan terakhir diterima lebih dari 5 tahun lalu dan karyawan kembali mencapai kelipatan 5 tahun, penghargaan baru diberikan.',
    setups: [{
      employeeNo: 'TCORI-11', leaveCode: 'CI', lb: 5, lbb: 0,
      preHistory: [{
        leaveType: 'CI', actionType: 'CI_5YEARS',
        yearOffset: -6, periodMonth: 0,
        lbBefore: 0, lbbBefore: 0, lbAfter: 5, lbbAfter: 0,
      }],
    }],
    expected: { employeeNo: 'TCORI-11', leaveType: 'CI', actionType: 'CI_5YEARS', lbDeltaMin: 1 },
  },

  {
    id:          'cori_ci_inactive_skip',
    category:    'CI_5YEARS',
    emoji:       '🚫',
    name:        'Penghargaan Masa Kerja Tidak Diberikan — Karyawan Sudah Tidak Aktif',
    description: 'Karyawan nonaktif tidak mendapat penghargaan masa kerja, meskipun masa kerjanya sudah mencapai kelipatan 5 tahun.',
    setups: [{ employeeNo: 'TCORI-06', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-06', leaveType: 'CI', actionType: 'CI_5YEARS', shouldNotExist: true },
  },

  {
    id:          'cori_ci_csd_priority_over_epd',
    category:    'CI_5YEARS',
    emoji:       '⚡',
    name:        'Penghargaan Masa Kerja — Tanggal Referensi Ikut Prioritas Contract Start Date',
    description: 'Karyawan Tetap (P) dengan ContractStartDate 5 tahun lalu dan EffectivePermanentDate 3 tahun lalu tetap mendapat Service Award, karena ContractStartDate yang jadi acuan (bukan EffectivePermanentDate).',
    setups: [{ employeeNo: 'TCORI-14', leaveCode: 'CI', lb: 0, lbb: 0 }],
    expected: { employeeNo: 'TCORI-14', leaveType: 'CI', actionType: 'CI_5YEARS', lbDelta: 22 },
  },
];
