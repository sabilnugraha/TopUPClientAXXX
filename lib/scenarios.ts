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
    name: 'Cuti Tahunan — Karyawan Baru di Tengah Tahun',
    description: 'Karyawan baru masuk Agustus mendapat jatah cuti dihitung dari sisa bulan (6,25 hari dari 15 hari penuh).',
    runDate: '2026-08-01T00:00:00',
    setups: [{ employeeNo: 'TEST-02', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 8, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-02', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 8, periodYear: 2026, lbAfter: 6.25 },
  },
  {
    id: 'al_topup_jan_1_5yr',
    category: 'AL',
    emoji: '📆',
    name: 'Cuti Tahunan Januari — Masa Kerja 1–5 Tahun (15 Hari)',
    description: 'Di awal Januari, karyawan dengan masa kerja 1–5 tahun mendapat 15 hari cuti penuh. Sisa cuti lama ikut terbawa.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'AL', lb: 3, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 15 },
  },
  {
    id: 'al_carry_cap',
    category: 'AL',
    emoji: '✂️',
    name: 'Batas Carry Over — Sisa Cuti Dipotong Jika Melebihi Limit',
    description: 'Jika sisa cuti terlalu banyak (misal 10 hari), yang dibawa ke tahun depan maksimal 5 hari. Sisanya hangus.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'AL', lb: 10, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'AL', actionType: 'CARRYOVER', periodMonth: 1, periodYear: 2026, lbbAfter: 5, lbAfterMax: 5 },
  },
  {
    id: 'al_topup_jan_6_10yr',
    category: 'AL',
    emoji: '📆',
    name: 'Cuti Tahunan Januari — Masa Kerja 6–10 Tahun (18 Hari)',
    description: 'Karyawan dengan masa kerja 6–10 tahun mendapat 18 hari cuti di awal tahun.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-04', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-04', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 18 },
  },
  {
    id: 'al_topup_jan_10yr_plus',
    category: 'AL',
    emoji: '📆',
    name: 'Cuti Tahunan Januari — Masa Kerja di Atas 10 Tahun (21 Hari)',
    description: 'Karyawan senior dengan masa kerja lebih dari 10 tahun mendapat 21 hari cuti di awal tahun.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-05', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-05', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 21 },
  },
  {
    id: 'al_reset_lbb',
    category: 'AL',
    emoji: '🔄',
    name: 'Carry Over Hangus — Melewati Batas Waktu 30 Juni',
    description: 'Cuti bawaan dari tahun lalu yang belum terpakai akan hangus otomatis setelah 30 Juni. Saldo carry over kembali ke nol.',
    runDate: '2026-07-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'AL', lb: 12, lbb: 5, expiredDate: '2026-06-30', clearLeaveType: 'AL', clearMonth: 7, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'AL', actionType: 'RESET', periodMonth: 7, periodYear: 2026, lbbAfter: 0 },
  },
  {
    id: 'al_idempotent',
    category: 'AL',
    emoji: '🔁',
    name: 'Tidak Ada Topup Ganda — Periode yang Sama',
    description: 'Jika topup sudah dijalankan bulan ini, menjalankannya lagi tidak akan menambah saldo dua kali.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-05', leaveCode: 'AL', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'AL', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-05', leaveType: 'AL', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 21 },
  },

  // ── PH ────────────────────────────────────────────────────────────────────
  {
    id: 'ph_anniversary_hit',
    category: 'PH',
    emoji: '🎂',
    name: 'Personal Holiday — Tepat Hari Ulang Tahun Kerja',
    description: 'Karyawan mendapat 1 hari Personal Holiday tepat di hari anniversarynya (minimal sudah 1 tahun bekerja).',
    runDate: '2026-06-03T00:00:00',
    setups: [{ employeeNo: 'TEST-03', leaveCode: 'PH', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'PH', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-03', leaveType: 'PH', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, lbAfter: 1 },
  },
  {
    id: 'ph_anniversary_miss',
    category: 'PH',
    emoji: '📅',
    name: 'Personal Holiday Tidak Diberikan — Bukan Hari Anniversary',
    description: 'Jika dijalankan sehari setelah tanggal anniversary, Personal Holiday tidak diberikan. Harus tepat di hari-H.',
    runDate: '2026-06-04T00:00:00',
    setups: [{ employeeNo: 'TEST-03', leaveCode: 'PH', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'PH', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-03', leaveType: 'PH', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, shouldNotExist: true },
  },
  {
    id: 'ph_less_than_1yr',
    category: 'PH',
    emoji: '🚫',
    name: 'Personal Holiday Tidak Diberikan — Belum Genap 1 Tahun',
    description: 'Karyawan yang baru masuk belum berhak mendapat Personal Holiday sebelum genap 1 tahun bekerja.',
    runDate: '2026-08-01T00:00:00',
    setups: [{ employeeNo: 'TEST-02', leaveCode: 'PH', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'PH', clearMonth: 8, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-02', leaveType: 'PH', actionType: 'TOPUP', periodMonth: 8, periodYear: 2026, shouldNotExist: true },
  },

  // ── HAID ──────────────────────────────────────────────────────────────────
  {
    id: 'haid_female',
    category: 'HAID',
    emoji: '🌸',
    name: 'Cuti Haid — Karyawati Dapat 2 Hari per Bulan',
    description: 'Setiap bulan, karyawati mendapat 2 hari cuti haid yang langsung ditambahkan ke saldo.',
    runDate: '2026-06-01T00:00:00',
    setups: [{ employeeNo: 'TEST-04', leaveCode: 'HAID', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'HAID', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-04', leaveType: 'HAID', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, lbAfter: 2 },
  },
  {
    id: 'haid_male_skip',
    category: 'HAID',
    emoji: '⏭️',
    name: 'Cuti Haid Tidak Berlaku untuk Karyawan Pria',
    description: 'Karyawan pria tidak mendapat cuti haid. Pastikan sistem tidak salah memberikan cuti ini.',
    runDate: '2026-06-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'HAID', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'HAID', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'HAID', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, shouldNotExist: true },
  },

  // ── JAN Fixed ─────────────────────────────────────────────────────────────
  {
    id: 'jan_fixed_ml',
    category: 'JAN',
    emoji: '💍',
    name: 'Cuti Menikah Diperbarui Setiap Januari (4 Hari)',
    description: 'Di awal tahun, saldo cuti menikah disetel ulang ke 4 hari untuk semua karyawan aktif.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'ML', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'ML', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'ML', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 4 },
  },
  {
    id: 'jan_fixed_melahirkan',
    category: 'JAN',
    emoji: '👶',
    name: 'Cuti Melahirkan Diperbarui Setiap Januari (90 Hari)',
    description: 'Di awal tahun, saldo cuti melahirkan disetel ke 90 hari untuk karyawati aktif.',
    runDate: '2026-01-01T00:00:00',
    setups: [{ employeeNo: 'TEST-04', leaveCode: 'MELAHIRKAN', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'MELAHIRKAN', clearMonth: 1, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-04', leaveType: 'MELAHIRKAN', actionType: 'TOPUP', periodMonth: 1, periodYear: 2026, lbAfter: 90 },
  },
  {
    id: 'jan_fixed_non_jan_skip',
    category: 'JAN',
    emoji: '⏭️',
    name: 'Cuti Khusus Tidak Diisi di Luar Bulan Januari',
    description: 'Cuti seperti menikah, melahirkan, dll hanya diperbarui di Januari. Di bulan lain tidak ada perubahan.',
    runDate: '2026-06-01T00:00:00',
    setups: [{ employeeNo: 'TEST-01', leaveCode: 'ML', lb: 0, lbb: 0, expiredDate: null, clearLeaveType: 'ML', clearMonth: 6, clearYear: 2026 }],
    expected: { employeeNo: 'TEST-01', leaveType: 'ML', actionType: 'TOPUP', periodMonth: 6, periodYear: 2026, shouldNotExist: true },
  },
];
