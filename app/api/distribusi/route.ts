import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// TmLeaveDistributionConfig — jatah cuti per level per bulan.
// Dipakai oleh TopUpLOGWINV2:
//   • AnnualQty  = SUM(Qty) per LevelCode  → dasar perhitungan plafon prorata
//   • PlannedQty = Qty pada MonthIndex tertentu (atau SUM 1..4 saat rapel)
// EffectiveYear tahun sebelumnya juga dibaca oleh blok Q4 Carry.
//
// READ-ONLY. Tabel ini data statis milik user — hanya GET yang disediakan.
// Tidak ada POST/DELETE supaya app tidak bisa mengubah atau menghapus isinya,
// baik lewat UI maupun tidak sengaja lewat setup test.
// ─────────────────────────────────────────────────────────────────────────────

interface DistRow {
  CompanyCode:   string;
  LeaveCode:     string;
  EffectiveYear: number;
  LevelCode:     string;
  MonthIndex:    number;
  Qty:           number;
  IsActive:      boolean;
}

// GET /api/distribusi?companyCode=LOGWIN&effectiveYear=2026&leaveCode=AL
export async function GET(req: NextRequest) {
  try {
    const sp        = req.nextUrl.searchParams;
    const company   = sp.get('companyCode')   ?? 'LOGWIN';
    const leaveCode = sp.get('leaveCode')     ?? 'AL';
    const yearParam = sp.get('effectiveYear');

    const params: unknown[] = [company, leaveCode];
    let where = `"CompanyCode" = $1 AND "LeaveCode" = $2`;
    if (yearParam) {
      params.push(Number(yearParam));
      where += ` AND "EffectiveYear" = $3`;
    }

    const rows = await query<DistRow>(
      `SELECT "CompanyCode","LeaveCode","EffectiveYear","LevelCode","MonthIndex","Qty","IsActive"
       FROM "TmLeaveDistributionConfig"
       WHERE ${where}
       ORDER BY "EffectiveYear" DESC, "LevelCode", "MonthIndex"`,
      params
    );

    // Pivot: level → 12 bulan, plus total tahunan
    const levels: Record<string, { year: number; qty: number[]; active: boolean[]; annual: number }> = {};
    for (const r of rows) {
      const key = `${r.EffectiveYear}|${r.LevelCode}`;
      if (!levels[key]) {
        levels[key] = { year: r.EffectiveYear, qty: Array(12).fill(0), active: Array(12).fill(false), annual: 0 };
      }
      const idx = r.MonthIndex - 1;
      if (idx >= 0 && idx < 12) {
        levels[key].qty[idx]    = Number(r.Qty);
        levels[key].active[idx] = r.IsActive;
      }
    }
    for (const v of Object.values(levels)) {
      v.annual = v.qty.reduce((a, b) => a + b, 0);
    }

    const pivot = Object.entries(levels).map(([key, v]) => {
      const [year, levelCode] = key.split('|');
      return {
        effectiveYear: Number(year),
        levelCode,
        qty:    v.qty,
        active: v.active,
        annual: v.annual,
      };
    }).sort((a, b) =>
      b.effectiveYear - a.effectiveYear || a.levelCode.localeCompare(b.levelCode)
    );

    // Catatan: project ini target ES5, jadi spread pada Set (`[...new Set(x)]`)
    // tidak bisa dipakai tanpa downlevelIteration. Dedup manual saja.
    const years = rows
      .map((r) => Number(r.EffectiveYear))
      .filter((y, i, arr) => arr.indexOf(y) === i)
      .sort((a, b) => b - a);

    return NextResponse.json({ rows, pivot, years });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
