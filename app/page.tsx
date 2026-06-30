'use client';

import { useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
type RunSummary = Record<string, unknown>;
type RunRow     = Record<string, unknown>;
type HistRow    = Record<string, unknown>;
type DetailRow  = Record<string, unknown>;

type Tab = 'run' | 'logs' | 'history';

// ── Helpers ──────────────────────────────────────────────────────────────────
function Badge({ value, variant }: { value: unknown; variant: 'success' | 'warn' | 'error' | 'neutral' }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-800',
    warn:    'bg-yellow-100 text-yellow-800',
    error:   'bg-red-100 text-red-800',
    neutral: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${colors[variant]}`}>
      {String(value ?? '-')}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: unknown; color: string }) {
  return (
    <div className={`rounded-lg p-4 ${color}`}>
      <div className="text-2xl font-bold">{String(value ?? '-')}</div>
      <div className="text-xs mt-1 opacity-70">{label}</div>
    </div>
  );
}

function actionBadge(action: string) {
  const map: Record<string, string> = {
    TOPUP:     'bg-blue-100 text-blue-800',
    CARRYOVER: 'bg-purple-100 text-purple-800',
    RESET:     'bg-orange-100 text-orange-800',
    RESET_LL:  'bg-red-100 text-red-800',
    '5YSERV':  'bg-green-100 text-green-800',
  };
  const cls = map[action] ?? 'bg-gray-100 text-gray-700';
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{action}</span>;
}

const LEAVE_CODES = [
  '', 'AL', 'PH', 'HAID', 'KHITAN/BABTIS_ANAK', 'ISTRI_MELAHIRKAN',
  'ML', 'KELUARGA_MENINGGAL', 'MELAHIRKAN', 'MENIKAHKAN_ANAK',
  'KEGUGURAN', 'ISTRI_KEGUGURAN',
];

// ── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [tab, setTab] = useState<Tab>('run');

  // --- Run tab state ---
  const [runDate, setRunDate] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ runId: string; summary: RunSummary } | null>(null);
  const [runError, setRunError] = useState('');

  // --- Logs tab state ---
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<{ details: DetailRow[]; history: HistRow[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // --- History tab state ---
  const [histFilter, setHistFilter] = useState({ employeeNo: '', leaveType: '', periodMonth: '', periodYear: '' });
  const [histRows, setHistRows] = useState<HistRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // ── Run function ────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunError('');
    setRunResult(null);
    try {
      const body = runDate ? { date: runDate } : {};
      const res  = await fetch('/api/run-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unknown error');
      setRunResult(data);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [runDate]);

  // ── Load run list ───────────────────────────────────────────────────────
  const loadRuns = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res  = await fetch('/api/runs');
      const data = await res.json();
      setRuns(Array.isArray(data) ? data : []);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // ── Load run detail ─────────────────────────────────────────────────────
  const loadDetail = useCallback(async (runId: string) => {
    setSelectedRun(runId);
    setDetailLoading(true);
    setRunDetail(null);
    try {
      const res  = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setRunDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Load history ────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const p = new URLSearchParams();
      if (histFilter.employeeNo)  p.set('employeeNo',  histFilter.employeeNo);
      if (histFilter.leaveType)   p.set('leaveType',   histFilter.leaveType);
      if (histFilter.periodMonth) p.set('periodMonth', histFilter.periodMonth);
      if (histFilter.periodYear)  p.set('periodYear',  histFilter.periodYear);
      const res  = await fetch(`/api/history?${p}`);
      const data = await res.json();
      setHistRows(Array.isArray(data) ? data : []);
    } finally {
      setHistLoading(false);
    }
  }, [histFilter]);

  // ── Tab switch with auto-load ────────────────────────────────────────────
  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'logs') loadRuns();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Tab nav */}
      <nav className="flex gap-2 mb-6">
        {(['run', 'logs', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
              tab === t
                ? 'bg-blue-700 text-white shadow'
                : 'bg-white text-gray-600 hover:bg-blue-50 border border-gray-200'
            }`}
          >
            {t === 'run' ? '▶ Run Topup' : t === 'logs' ? '📋 Run Logs' : '📊 History'}
          </button>
        ))}
      </nav>

      {/* ── TAB: RUN ──────────────────────────────────────────────────── */}
      {tab === 'run' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow p-6 max-w-md">
            <h2 className="font-semibold text-lg mb-4">Jalankan fn_daily_topup_leave_apll</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Tanggal Test (kosongkan = now() Jakarta)
              </label>
              <input
                type="datetime-local"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Contoh test: 2026-01-01T00:00 (Januari), 2026-07-01T00:00 (RESET LBB)
              </p>
            </div>
            <button
              onClick={handleRun}
              disabled={running}
              className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition"
            >
              {running ? 'Running…' : '▶ Jalankan'}
            </button>
          </div>

          {runError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <strong>Error:</strong> {runError}
            </div>
          )}

          {runResult && (
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-green-600 text-2xl">✅</span>
                <div>
                  <div className="font-semibold">Run berhasil</div>
                  <div className="text-xs text-gray-400 font-mono">{runResult.runId}</div>
                </div>
              </div>

              {runResult.summary && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <Stat label="Total Karyawan"  value={runResult.summary.TotalEmployeesTarget} color="bg-blue-50" />
                    <Stat label="AL Topup ✅"      value={runResult.summary.TopUpSuccess}         color="bg-green-50" />
                    <Stat label="AL Carry ✅"      value={runResult.summary.CarrySuccess}         color="bg-purple-50" />
                    <Stat label="AL Reset ✅"      value={runResult.summary.ResetSuccess}         color="bg-orange-50" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="PH ✅"           value={runResult.summary.FiveYearSuccess}      color="bg-teal-50" />
                    <Stat label="HAID+JAN ✅"     value={runResult.summary.ResetLLSuccess}       color="bg-indigo-50" />
                    <Stat label="AL Topup Skip"   value={runResult.summary.TopUpSkipped}         color="bg-gray-50" />
                    <Stat label="Failed"          value={
                      (Number(runResult.summary.TopUpFailed  ?? 0)  +
                       Number(runResult.summary.CarryFailed  ?? 0)  +
                       Number(runResult.summary.ResetFailed  ?? 0)  +
                       Number(runResult.summary.FiveYearFailed ?? 0)+
                       Number(runResult.summary.ResetLLFailed ?? 0))
                    } color="bg-red-50" />
                  </div>
                  {runResult.summary.Notes && (
                    <div className="mt-3 text-xs text-gray-500 font-mono bg-gray-50 rounded p-2">
                      {String(runResult.summary.Notes)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: LOGS ─────────────────────────────────────────────────── */}
      {tab === 'logs' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-lg">Run History (APLL)</h2>
            <button onClick={loadRuns} className="text-sm text-blue-600 hover:underline">
              {logsLoading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          {/* Run list */}
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  {['Tanggal', 'Periode', 'Emp', 'AL✅', 'Carry✅', 'Reset✅', 'PH✅', 'JAN+HAID✅', 'Failed', 'Notes', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">Belum ada data</td></tr>
                )}
                {runs.map((r, i) => {
                  const failed =
                    Number(r.TopUpFailed   ?? 0) +
                    Number(r.CarryFailed   ?? 0) +
                    Number(r.ResetFailed   ?? 0) +
                    Number(r.FiveYearFailed ?? 0) +
                    Number(r.ResetLLFailed ?? 0);
                  const runId = String(r.RunID);
                  return (
                    <tr
                      key={i}
                      className={`border-t hover:bg-blue-50 cursor-pointer transition ${selectedRun === runId ? 'bg-blue-50' : ''}`}
                      onClick={() => loadDetail(runId)}
                    >
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                        {r.RunDate ? String(r.RunDate).slice(0, 10) : '-'}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.PeriodMonth}/{r.PeriodYear}</td>
                      <td className="px-3 py-2">{String(r.TotalEmployeesTarget ?? '-')}</td>
                      <td className="px-3 py-2"><Badge value={r.TopUpSuccess}   variant="success" /></td>
                      <td className="px-3 py-2"><Badge value={r.CarrySuccess}   variant="success" /></td>
                      <td className="px-3 py-2"><Badge value={r.ResetSuccess}   variant="warn"    /></td>
                      <td className="px-3 py-2"><Badge value={r.FiveYearSuccess} variant="success" /></td>
                      <td className="px-3 py-2"><Badge value={r.ResetLLSuccess} variant="success" /></td>
                      <td className="px-3 py-2"><Badge value={failed} variant={failed > 0 ? 'error' : 'neutral'} /></td>
                      <td className="px-3 py-2 text-xs text-gray-400 max-w-xs truncate">{String(r.Notes ?? '')}</td>
                      <td className="px-3 py-2 text-blue-500 text-xs">→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Run detail */}
          {selectedRun && (
            <div className="bg-white rounded-xl shadow p-5">
              <h3 className="font-semibold mb-3 text-sm text-gray-600">
                Detail Run: <span className="font-mono text-xs">{selectedRun}</span>
              </h3>

              {detailLoading && <p className="text-gray-400 text-sm">Loading…</p>}

              {runDetail && (
                <div className="space-y-5">
                  {/* Errors */}
                  {runDetail.details.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-red-600 mb-2">⚠ Errors ({runDetail.details.length})</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-red-50 text-gray-500 uppercase">
                            <tr>
                              {['Employee', 'Leave', 'Action', 'Status', 'Reason', 'Error'].map((h) => (
                                <th key={h} className="px-3 py-2 text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {runDetail.details.map((d, i) => (
                              <tr key={i} className="border-t">
                                <td className="px-3 py-1 font-mono">{String(d.EmployeeNo)}</td>
                                <td className="px-3 py-1">{String(d.LeaveCode)}</td>
                                <td className="px-3 py-1">{actionBadge(String(d.ActionType))}</td>
                                <td className="px-3 py-1"><Badge value={d.Status} variant="error" /></td>
                                <td className="px-3 py-1">{String(d.Reason ?? '')}</td>
                                <td className="px-3 py-1 text-red-600 max-w-xs truncate">{String(d.ErrorMessage ?? '')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* History untuk run ini */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      History Topup ({runDetail.history.length} baris)
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 uppercase">
                          <tr>
                            {['Employee', 'Nama', 'Leave', 'Period', 'LB Before', 'LBB Before', 'LB After', 'LBB After', 'Action'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {runDetail.history.length === 0 && (
                            <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400">Tidak ada history</td></tr>
                          )}
                          {runDetail.history.map((h, i) => (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-1 font-mono">{String(h.EmployeeNo)}</td>
                              <td className="px-3 py-1">{String(h.FullName ?? '')}</td>
                              <td className="px-3 py-1 font-semibold">{String(h.LeaveType)}</td>
                              <td className="px-3 py-1">{String(h.PeriodMonth)}/{String(h.PeriodYear)}</td>
                              <td className="px-3 py-1 text-right">{String(h.LBPraTopUp ?? '')}</td>
                              <td className="px-3 py-1 text-right">{String(h.LBBPraTopUp ?? '')}</td>
                              <td className="px-3 py-1 text-right font-semibold text-green-700">{String(h.LBAfterTopUp ?? '')}</td>
                              <td className="px-3 py-1 text-right">{String(h.LBBAfterTopUp ?? '')}</td>
                              <td className="px-3 py-1">{actionBadge(String(h.ActionType))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: HISTORY ──────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="bg-white rounded-xl shadow p-5">
            <h2 className="font-semibold mb-3">Filter History APLL</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">No. Karyawan</label>
                <input
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="001310"
                  value={histFilter.employeeNo}
                  onChange={(e) => setHistFilter({ ...histFilter, employeeNo: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Kode Cuti</label>
                <select
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  value={histFilter.leaveType}
                  onChange={(e) => setHistFilter({ ...histFilter, leaveType: e.target.value })}
                >
                  {LEAVE_CODES.map((c) => (
                    <option key={c} value={c}>{c || '— Semua —'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bulan</label>
                <input
                  type="number" min={1} max={12}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="6"
                  value={histFilter.periodMonth}
                  onChange={(e) => setHistFilter({ ...histFilter, periodMonth: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tahun</label>
                <input
                  type="number"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="2026"
                  value={histFilter.periodYear}
                  onChange={(e) => setHistFilter({ ...histFilter, periodYear: e.target.value })}
                />
              </div>
            </div>
            <button
              onClick={loadHistory}
              disabled={histLoading}
              className="mt-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-semibold"
            >
              {histLoading ? 'Loading…' : '🔍 Cari'}
            </button>
          </div>

          {/* History table */}
          {histRows.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    {['Employee', 'Nama', 'Leave', 'Period', 'LB Before', 'LBB Before', 'LB After', 'LBB After', 'Tgl Action', 'Action'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histRows.map((h, i) => (
                    <tr key={i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{String(h.EmployeeNo)}</td>
                      <td className="px-3 py-2 text-xs">{String(h.FullName ?? '')}</td>
                      <td className="px-3 py-2 font-semibold text-xs">{String(h.LeaveType)}</td>
                      <td className="px-3 py-2 text-xs">{String(h.PeriodMonth)}/{String(h.PeriodYear)}</td>
                      <td className="px-3 py-2 text-right">{String(h.LBPraTopUp ?? '')}</td>
                      <td className="px-3 py-2 text-right">{String(h.LBBPraTopUp ?? '')}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">{String(h.LBAfterTopUp ?? '')}</td>
                      <td className="px-3 py-2 text-right">{String(h.LBBAfterTopUp ?? '')}</td>
                      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">
                        {h.ActionDate ? String(h.ActionDate).slice(0, 10) : '-'}
                      </td>
                      <td className="px-3 py-2">{actionBadge(String(h.ActionType))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 text-xs text-gray-400 border-t">
                {histRows.length} baris (max 200)
              </div>
            </div>
          )}

          {histRows.length === 0 && !histLoading && (
            <p className="text-gray-400 text-sm">Klik Cari untuk menampilkan data.</p>
          )}
        </div>
      )}
    </div>
  );
}
