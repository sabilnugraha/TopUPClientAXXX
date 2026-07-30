// ─────────────────────────────────────────────────────────────────────────────
// LOGW Test Scenario Definitions
//
// TopUpLOGWINV2(company, month, year) menerima periode eksplisit — beda dengan
// CORI yang pakai NOW(). Jadi test bisa mensimulasikan satu tahun penuh secara
// deterministik: jalankan bulan 1..12 berurutan, lalu cocokkan hasil per bulan.
//
// Aturan yang diuji:
//   HOLD      — karyawan baru ditahan 3 bulan pertama (tidak dapat saldo)
//   RAPEL     — di bulan ke-4 saldo keluar sekaligus (Qty MonthIndex 1..4)
//   PRORATA   — plafon setahun = ROUND(EligibleMonths × AnnualQty ÷ 12);
//               jatah bulanan dipotong kalau plafon mau terlampaui
//   TGL15     — join tgl <=15 mulai bulan itu, >15 mulai bulan berikutnya
//   LAMA      — karyawan lama dapat plafon penuh, MonthIndex = bulan kalender
//   Q4_CARRY  — joiner Okt/Nov/Des tahun lalu dibayar sekali di tahun ini
//   ROLLOVER  — Januari: LeaveBalance dipindah ke LeaveBalanceBefore
//   CLEAR_APR — April: LeaveBalanceBefore dinolkan
// ─────────────────────────────────────────────────────────────────────────────

export const LOGW_COMPANY     = 'LOGW';
export const LOGW_LEAVE_CODES = ['AL'] as const;
export const LOGW_LEVEL_TYPE  = '3';

// ── Distribution config ───────────────────────────────────────────────────────
// Qty per MonthIndex. AnnualQty = jumlah seluruh baris.
//   AM  : 3,2,2,2,2,2,2,2,2,2,2,2  → 25
//   HOD : 2,2,2,2,1,1,1,1,1,1,1,1  → 16
//   MNG : 2,2,2,2,2,2,2,2,1,1,1,1  → 20
export const LOGW_DISTRIBUTION: Record<string, number[]> = {
  AM:  [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  HOD: [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1],
  MNG: [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1],
};

export const LOGW_LEVELS = Object.keys(LOGW_DISTRIBUTION);

export function annualQty(levelCode: string): number {
  return (LOGW_DISTRIBUTION[levelCode] ?? []).reduce((a, b) => a + b, 0);
}

/** Flatten distribution into DB rows for a given effective year */
export function distributionRows(effectiveYear: number) {
  const rows: { levelCode: string; monthIndex: number; qty: number; effectiveYear: number }[] = [];
  for (const [levelCode, qtys] of Object.entries(LOGW_DISTRIBUTION)) {
    qtys.forEach((qty, i) => {
      rows.push({ levelCode, monthIndex: i + 1, qty, effectiveYear });
    });
  }
  return rows;
}

// ── Test Employee Definitions ─────────────────────────────────────────────────
export interface LogwTestEmployee {
  employeeNo:  string;
  fullName:    string;
  gender:      'M' | 'F';
  recordStatus:'A' | 'I';
  levelCode:   string;
  /** Year offset relative to the test period year: 0 = tahun ini, -1 = tahun lalu */
  joinYearOffset: number;
  joinMonth:   number;  // 1-12
  joinDay:     number;  // 1-31
}

export const LOGW_TEST_EMPLOYEES: LogwTestEmployee[] = [
  {
    employeeNo: 'TLOGW-01', fullName: 'Test Logw Andra (MNG · Join 1 Mei)',
    gender: 'M', recordStatus: 'A', levelCode: 'MNG',
    joinYearOffset: 0, joinMonth: 5, joinDay: 1,
  },
  {
    employeeNo: 'TLOGW-02', fullName: 'Test Logw Bella (AM · Join 2 Juli)',
    gender: 'F', recordStatus: 'A', levelCode: 'AM',
    joinYearOffset: 0, joinMonth: 7, joinDay: 2,
  },
  {
    employeeNo: 'TLOGW-03', fullName: 'Test Logw Candra (AM · Join 1 Agustus)',
    gender: 'M', recordStatus: 'A', levelCode: 'AM',
    joinYearOffset: 0, joinMonth: 8, joinDay: 1,
  },
  {
    employeeNo: 'TLOGW-04', fullName: 'Test Logw Dinda (AM · Join 20 Agustus)',
    gender: 'F', recordStatus: 'A', levelCode: 'AM',
    joinYearOffset: 0, joinMonth: 8, joinDay: 20,
  },
  {
    employeeNo: 'TLOGW-05', fullName: 'Test Logw Eka (HOD · Join 1 Juni)',
    gender: 'M', recordStatus: 'A', levelCode: 'HOD',
    joinYearOffset: 0, joinMonth: 6, joinDay: 1,
  },
  {
    employeeNo: 'TLOGW-06', fullName: 'Test Logw Fajar (AM · Karyawan Lama)',
    gender: 'M', recordStatus: 'A', levelCode: 'AM',
    joinYearOffset: -3, joinMonth: 3, joinDay: 10,
  },
  {
    employeeNo: 'TLOGW-07', fullName: 'Test Logw Gita (HOD · Join 5 Nov Tahun Lalu)',
    gender: 'F', recordStatus: 'A', levelCode: 'HOD',
    joinYearOffset: -1, joinMonth: 11, joinDay: 5,
  },
  {
    employeeNo: 'TLOGW-08', fullName: 'Test Logw Hendra (HOD · Join 1 Sep Tahun Lalu)',
    gender: 'M', recordStatus: 'A', levelCode: 'HOD',
    joinYearOffset: -1, joinMonth: 9, joinDay: 1,
  },
];

// ── Scenario shape ────────────────────────────────────────────────────────────
export type LogwCategory =
  | 'HOLD+RAPEL' | 'PRORATA' | 'TGL15' | 'KARYAWAN LAMA'
  | 'Q4 CARRY'   | 'ROLLOVER' | 'CLEAR APR' | 'IDEMPOTENT';

export interface LogwExpected {
  /** Plafon setahun yang diharapkan */
  prorateQty:   number;
  /** month (1-12) → jumlah hari yang diharapkan masuk di bulan itu */
  monthly:      Record<number, number>;
  /** Total setahun */
  total:        number;
  /** Ekspektasi Q4 Carry masuk ke LeaveBalanceBefore (kalau ada) */
  q4Carry?:     number;
  /** true = pastikan TIDAK ada record Q4_CARRY sama sekali */
  noQ4Carry?:   boolean;
}

export interface LogwScenario {
  id:          string;
  category:    LogwCategory;
  emoji:       string;
  name:        string;
  description: string;
  employeeNo:  string;
  /** Bulan-bulan yang dijalankan, berurutan */
  runMonths:   number[];
  /** Saldo awal sebelum simulasi */
  initialLb:   number;
  initialLbb:  number;
  expected:    LogwExpected;
  /** Jalankan seluruh runMonths dua kali — hasil harus identik (idempoten) */
  runTwice?:   boolean;
}

// Helper: bikin map bulan→qty dari pasangan
function m(...pairs: [number, number][]): Record<number, number> {
  return Object.fromEntries(pairs);
}

// ── Scenario List ─────────────────────────────────────────────────────────────
export const LOGW_SCENARIOS: LogwScenario[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // HOLD + RAPEL
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_mng_join_mei',
    category:    'HOLD+RAPEL',
    emoji:       '🎁',
    name:        'MNG Join 1 Mei — Ditahan 3 Bulan, Rapel di Agustus',
    description:
      'Karyawan level MNG yang masuk 1 Mei tidak mendapat saldo selama Mei–Juli. ' +
      'Di Agustus (bulan ke-4) saldonya keluar sekaligus 8 hari, lalu berjalan normal ' +
      'sampai plafon 13 hari tercapai di November. Desember tidak dapat tambahan.',
    employeeNo:  'TLOGW-01',
    runMonths:   [5, 6, 7, 8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 13,
      monthly: m([5,0],[6,0],[7,0],[8,8],[9,2],[10,2],[11,1],[12,0]),
      total: 13,
    },
  },
  {
    id:          'logw_am_join_juli',
    category:    'HOLD+RAPEL',
    emoji:       '📦',
    name:        'AM Join 2 Juli — Rapel 9 Hari di Oktober',
    description:
      'Karyawan level AM yang masuk 2 Juli ditahan Juli–September, lalu di Oktober ' +
      'menerima rapel 9 hari (jatah bulan ke-1 sampai ke-4). November dan Desember ' +
      'masing-masing 2 hari. Total 13 hari, tepat di plafon.',
    employeeNo:  'TLOGW-02',
    runMonths:   [7, 8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 13,
      monthly: m([7,0],[8,0],[9,0],[10,9],[11,2],[12,2]),
      total: 13,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PRORATA (plafon memotong)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_am_join_agustus_capped',
    category:    'PRORATA',
    emoji:       '✂️',
    name:        'AM Join 1 Agustus — Desember Dipotong Plafon',
    description:
      'Kalau dijumlah lurus dari tabel distribusi, karyawan ini berhak 11 hari. ' +
      'Tapi plafon prorata hanya 10 hari, jadi jatah Desember dipotong dari 2 hari ' +
      'menjadi 1 hari. Ini membuktikan plafon benar-benar bekerja, bukan sekadar formalitas.',
    employeeNo:  'TLOGW-03',
    runMonths:   [8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 10,
      monthly: m([8,0],[9,0],[10,0],[11,9],[12,1]),
      total: 10,
    },
  },
  {
    id:          'logw_hod_join_juni_capped',
    category:    'PRORATA',
    emoji:       '🧢',
    name:        'HOD Join 1 Juni — Plafon Habis di Oktober',
    description:
      'Karyawan HOD masuk 1 Juni, rapel 8 hari keluar di September, lalu 1 hari di ' +
      'Oktober. Setelah itu plafon 9 hari sudah habis, sehingga November dan Desember ' +
      'tidak mendapat tambahan sama sekali meskipun tabel distribusi masih menjatah 1 hari.',
    employeeNo:  'TLOGW-05',
    runMonths:   [6, 7, 8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 9,
      monthly: m([6,0],[7,0],[8,0],[9,8],[10,1],[11,0],[12,0]),
      total: 9,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TANGGAL 15
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_am_join_setelah_tgl15',
    category:    'TGL15',
    emoji:       '📅',
    name:        'AM Join 20 Agustus — Titik Mulai Mundur ke September',
    description:
      'Karena masuk setelah tanggal 15, titik hitungnya mundur ke 1 September. ' +
      'Akibatnya plafon turun dari 10 menjadi 8 hari, dan seluruh saldo baru cair ' +
      'sekaligus di Desember. Bandingkan dengan rekan yang masuk 1 Agustus: selisihnya 2 hari.',
    employeeNo:  'TLOGW-04',
    runMonths:   [8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 8,
      monthly: m([8,0],[9,0],[10,0],[11,0],[12,8]),
      total: 8,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // KARYAWAN LAMA
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_am_karyawan_lama',
    category:    'KARYAWAN LAMA',
    emoji:       '🏅',
    name:        'AM Karyawan Lama — Jatah Penuh 25 Hari Sepanjang Tahun',
    description:
      'Karyawan yang sudah bergabung sejak tahun-tahun sebelumnya tidak kena masa tahan. ' +
      'Sejak Januari langsung menerima jatah bulanan sesuai tabel distribusi, dan plafonnya ' +
      'penuh 25 hari. Bulan Januari mendapat 3 hari sesuai baris pertama tabel.',
    employeeNo:  'TLOGW-06',
    runMonths:   [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 25,
      monthly: m([1,3],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2]),
      total: 25,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Q4 CARRY
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_q4_carry_november',
    category:    'Q4 CARRY',
    emoji:       '🔄',
    name:        'HOD Join 5 November Tahun Lalu — Tunggakan Dibayar Tahun Ini',
    description:
      'Karyawan yang masuk November tahun lalu tidak sempat mencapai bulan ke-4 sebelum ' +
      'tahun berakhir, sehingga jatah 2 bulan kerjanya nyangkut. Q4 Carry melunasinya ' +
      'di awal tahun ini sebesar 3 hari, masuk ke kantong carry-over dengan masa berlaku 31 Maret.',
    employeeNo:  'TLOGW-07',
    runMonths:   [1],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 16,
      monthly: m([1,2]),
      total: 2,
      q4Carry: 3,
    },
  },
  {
    id:          'logw_q4_carry_bukan_q4',
    category:    'Q4 CARRY',
    emoji:       '🚫',
    name:        'HOD Join 1 September Tahun Lalu — Tidak Dapat Q4 Carry',
    description:
      'Karyawan yang masuk September tahun lalu masih sempat mencapai bulan ke-4 di Desember, ' +
      'jadi jatahnya sudah lunas tahun lalu. Q4 Carry sengaja tidak diberikan supaya tidak dobel bayar.',
    employeeNo:  'TLOGW-08',
    runMonths:   [1],
    initialLb:   0,
    initialLbb:  0,
    expected: {
      prorateQty: 16,
      monthly: m([1,2]),
      total: 2,
      noQ4Carry: true,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ROLLOVER / CLEAR APRIL
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_rollover_januari',
    category:    'ROLLOVER',
    emoji:       '📥',
    name:        'Rollover Januari — Sisa Saldo Tahun Lalu Pindah ke Carry Over',
    description:
      'Di bulan Januari, sisa saldo cuti tahun lalu dipindahkan ke kantong carry-over ' +
      'dengan masa berlaku sampai 31 Maret, dan saldo tahun berjalan dimulai dari nol. ' +
      'Karyawan ini masuk dengan saldo 6 hari, lalu menerima jatah Januari 3 hari.',
    employeeNo:  'TLOGW-06',
    runMonths:   [1],
    initialLb:   6,
    initialLbb:  0,
    expected: {
      prorateQty: 25,
      monthly: m([1,3]),
      total: 3,
    },
  },
  {
    id:          'logw_clear_april',
    category:    'CLEAR APR',
    emoji:       '🧹',
    name:        'Clear April — Carry Over Hangus di Bulan April',
    description:
      'Saldo carry-over dari tahun lalu berlaku sampai 31 Maret. Saat proses April dijalankan, ' +
      'sisa carry-over yang belum terpakai dihapus menjadi nol. Saldo tahun berjalan tidak ikut terhapus.',
    employeeNo:  'TLOGW-06',
    runMonths:   [4],
    initialLb:   0,
    initialLbb:  5,
    expected: {
      prorateQty: 25,
      monthly: m([4,2]),
      total: 2,
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // IDEMPOTENT
  // ══════════════════════════════════════════════════════════════════════════
  {
    id:          'logw_idempotent',
    category:    'IDEMPOTENT',
    emoji:       '🔁',
    name:        'Dijalankan Dua Kali — Saldo Tidak Dobel',
    description:
      'Menjalankan proses top-up berulang kali untuk periode yang sama tidak menambah saldo lagi. ' +
      'Seluruh rangkaian bulan dijalankan dua kali, dan hasil akhirnya harus sama persis ' +
      'dengan satu kali jalan.',
    employeeNo:  'TLOGW-02',
    runMonths:   [7, 8, 9, 10, 11, 12],
    initialLb:   0,
    initialLbb:  0,
    runTwice:    true,
    expected: {
      prorateQty: 13,
      monthly: m([7,0],[8,0],[9,0],[10,9],[11,2],[12,2]),
      total: 13,
    },
  },
];
