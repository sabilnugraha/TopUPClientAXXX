'use client';

import { useState, useCallback, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
type DbValue    = string | number | boolean | null | undefined;
type RunSummary = Record<string, DbValue>;
type RunRow     = Record<string, DbValue>;
type HistRow    = Record<string, DbValue>;
type DetailRow  = Record<string, DbValue>;

type Tab = 'run' | 'karyawan' | 'logs' | 'history' | 'test';

interface KaryawanForm {
  CompanyCode: string;
  EmployeeNo: string;
  FullName: string;
  JoinDate: string;
  Gender: string;
  RecordStatus: string;
}

const EMPTY_FORM: KaryawanForm = {
  CompanyCode: 'APLL', EmployeeNo: '', FullName: '',
  JoinDate: '', Gender: 'M', RecordStatus: 'A',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'run',      icon: '⚡', label: 'Run Topup'   },
  { id: 'karyawan', icon: '👥', label: 'Karyawan'    },
  { id: 'logs',     icon: '📋', label: 'Run Logs'    },
  { id: 'history',  icon: '📊', label: 'History'     },
  { id: 'test',     icon: '🧪', label: 'Test'        },
];

const LEAVE_CODES = [
  '', 'AL', 'PH', 'HAID', 'KHITAN/BABTIS_ANAK', 'ISTRI_MELAHIRKAN',
  'ML', 'KELUARGA_MENINGGAL', 'MELAHIRKAN', 'MENIKAHKAN_ANAK',
  'KEGUGURAN', 'ISTRI_KEGUGURAN',
];

function actionColor(action: string) {
  const m: Record<string, string> = {
    TOPUP:     'bg-indigo-100 text-indigo-700',
    CARRYOVER: 'bg-violet-100 text-violet-700',
    RESET:     'bg-orange-100 text-orange-700',
    RESET_LL:  'bg-red-100 text-red-700',
    '5YSERV':  'bg-emerald-100 text-emerald-700',
  };
  return m[action] ?? 'bg-gray-100 text-gray-600';
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${actionColor(action)}`}>
      {action}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status === 'A' ? 'text-emerald-600' : 'text-gray-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'A' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      {status === 'A' ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 ${className}`}>
      {children}
    </div>
  );
}

function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
      <input
        {...props}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-gray-50 focus:bg-white"
      />
    </div>
  );
}

function Select({ label, children, ...props }: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
      <select
        {...props}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-gray-50 focus:bg-white"
      >
        {children}
      </select>
    </div>
  );
}

function Btn({ children, variant = 'primary', size = 'md', ...props }: {
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v: Record<string, string> = {
    primary: 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-md shadow-indigo-200',
    success: 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-200',
    ghost:   'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
    danger:  'bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-md shadow-red-200',
  };
  const s: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button
      {...props}
      className={`${v[variant]} ${s[size]} rounded-xl font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, gradient }: { label: string; value: DbValue; gradient: string }) {
  return (
    <div className={`rounded-2xl p-4 text-white ${gradient}`}>
      <div className="text-3xl font-black">{String(value ?? '-')}</div>
      <div className="text-xs mt-1 opacity-80 font-medium">{label}</div>
    </div>
  );
}

// ── Test Tab ──────────────────────────────────────────────────────────────────
interface ScenarioDef {
  id: string; category: string; emoji: string; name: string; description: string; runDate: string;
}
interface ScenarioResult {
  id: string; status: 'pass' | 'fail'; message: string;
  before: Record<string, unknown> | null;
  after:  Record<string, unknown> | null;
}
type TestStatus = 'idle' | 'running' | 'pass' | 'fail';

const CAT_COLOR: Record<string, string> = {
  AL:   'bg-indigo-100 text-indigo-700',
  PH:   'bg-violet-100 text-violet-700',
  HAID: 'bg-pink-100 text-pink-700',
  JAN:  'bg-emerald-100 text-emerald-700',
};

function TestTab() {
  const [scenarios,    setScenarios]    = useState<ScenarioDef[]>([]);
  const [statuses,     setStatuses]     = useState<Record<string, TestStatus>>({});
  const [results,      setResults]      = useState<Record<string, ScenarioResult>>({});
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [setupMsg,     setSetupMsg]     = useState('');
  const [cleanupMsg,   setCleanupMsg]   = useState('');
  const [runningAll,   setRunningAll]   = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);

  useEffect(() => {
    fetch('/api/test/run').then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setScenarios(data);
    });
  }, []);

  const handleSetup = async () => {
    setSetupLoading(true); setSetupMsg('');
    try {
      const res  = await fetch('/api/test/setup', { method: 'POST' });
      const data = await res.json();
      setSetupMsg(data.message ?? (data.error ? `Error: ${data.error}` : 'Done'));
    } finally { setSetupLoading(false); }
  };

  const handleCleanup = async () => {
    const ok = confirm('Hapus semua data karyawan test (TEST-0x)?');
    if (!ok) return;
    const res  = await fetch('/api/test/cleanup', { method: 'DELETE' });
    const data = await res.json();
    setCleanupMsg(data.message ?? (data.error ? `Error: ${data.error}` : 'Done'));
  };

  const runOne = async (id: string) => {
    setStatuses((s) => ({ ...s, [id]: 'running' }));
    try {
      const res  = await fetch('/api/test/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: id }),
      });
      const data = await res.json();
      if (data.results?.[0]) {
        const r = data.results[0] as ScenarioResult;
        setResults((prev) => ({ ...prev, [id]: r }));
        setStatuses((s) => ({ ...s, [id]: r.status }));
      }
    } catch { setStatuses((s) => ({ ...s, [id]: 'fail' })); }
  };

  const runAll = async () => {
    setRunningAll(true);
    const init: Record<string, TestStatus> = {};
    scenarios.forEach((s) => { init[s.id] = 'running'; });
    setStatuses(init);
    try {
      const res  = await fetch('/api/test/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.results) {
        const newStatus: Record<string, TestStatus> = {};
        const newResults: Record<string, ScenarioResult> = {};
        (data.results as ScenarioResult[]).forEach((r) => {
          newStatus[r.id]  = r.status;
          newResults[r.id] = r;
        });
        setStatuses(newStatus);
        setResults(newResults);
      }
    } finally { setRunningAll(false); }
  };

  const passed = Object.values(statuses).filter((s) => s === 'pass').length;
  const failed = Object.values(statuses).filter((s) => s === 'fail').length;
  const total  = scenarios.length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Test Scenarios 🧪</h1>
          <p className="text-sm text-gray-400 mt-1">{total} skenario · otomatis setup, run, dan validasi</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="ghost" size="sm" onClick={handleSetup} disabled={setupLoading}>
            {setupLoading ? '⏳' : '🗄️'} Setup Dummy Data
          </Btn>
          <Btn variant="success" onClick={runAll} disabled={runningAll || !scenarios.length}>
            {runningAll ? '⏳ Running…' : '▶ Run All Tests'}
          </Btn>
          <Btn variant="danger" size="sm" onClick={handleCleanup}>🗑 Cleanup</Btn>
        </div>
      </div>

      {/* Messages */}
      {setupMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span>✅</span> {setupMsg}
        </div>
      )}
      {cleanupMsg && (
        <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <span>🗑</span> {cleanupMsg}
        </div>
      )}

      {/* Summary bar */}
      {(passed + failed) > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all"
                style={{ width: `${total ? (passed / total) * 100 : 0}%` }}
              />
            </div>
            <div className="flex gap-4 text-sm font-semibold">
              <span className="text-emerald-600">✓ {passed} passed</span>
              {failed > 0 && <span className="text-red-500">✗ {failed} failed</span>}
              <span className="text-gray-400">{total - passed - failed} pending</span>
            </div>
          </div>
        </Card>
      )}

      {/* Scenario list */}
      <div className="space-y-2">
        {scenarios.map((sc) => {
          const status  = statuses[sc.id] ?? 'idle';
          const result  = results[sc.id];
          const isOpen  = expanded === sc.id;

          const statusIcon: Record<TestStatus, string> = {
            idle: '○', running: '⏳', pass: '✅', fail: '❌',
          };
          const statusBg: Record<TestStatus, string> = {
            idle: 'border-gray-100 bg-white',
            running: 'border-indigo-200 bg-indigo-50',
            pass: 'border-emerald-200 bg-emerald-50',
            fail: 'border-red-200 bg-red-50',
          };

          return (
            <div key={sc.id} className={`rounded-2xl border transition ${statusBg[status]}`}>
              <div className="flex items-center gap-3 p-4">
                <span className="text-lg w-6 text-center">{statusIcon[status]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CAT_COLOR[sc.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {sc.category}
                    </span>
                    <span className="font-semibold text-sm text-gray-800">{sc.emoji} {sc.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{sc.description}</p>
                  {result && (
                    <p className={`text-xs mt-1 font-medium ${result.status === 'pass' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {result.message}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {result && (
                    <button
                      onClick={() => setExpanded(isOpen ? null : sc.id)}
                      className="text-xs text-indigo-500 hover:underline px-2"
                    >
                      {isOpen ? 'Tutup' : 'Before/After'}
                    </button>
                  )}
                  <Btn
                    variant="ghost" size="sm"
                    onClick={() => runOne(sc.id)}
                    disabled={status === 'running' || runningAll}
                  >
                    {status === 'running' ? '⏳' : '▶'}
                  </Btn>
                </div>
              </div>

              {/* Before / After expand */}
              {isOpen && result && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Before</div>
                      <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs space-y-1">
                        {result.before
                          ? Object.entries(result.before).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <span className="text-gray-400">{k}</span>
                                <span className="text-gray-700 font-semibold">{String(v ?? '-')}</span>
                              </div>
                            ))
                          : <span className="text-gray-300">—</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">After</div>
                      <div className={`rounded-xl p-3 font-mono text-xs space-y-1 ${result.status === 'pass' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        {result.after
                          ? Object.entries(result.after).map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <span className="text-gray-400">{k}</span>
                                <span className={`font-semibold ${result.status === 'pass' ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {String(v ?? '-')}
                                </span>
                              </div>
                            ))
                          : <span className="text-gray-300">—</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-gray-400 font-mono bg-gray-50 rounded-xl px-3 py-2">
                    runDate: {sc.runDate}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [tab, setTab] = useState<Tab>('run');

  // ── Run tab ──────────────────────────────────────────────────────────────
  const [runDate,    setRunDate]    = useState('');
  const [running,    setRunning]    = useState(false);
  const [runResult,  setRunResult]  = useState<{ runId: string; summary: RunSummary } | null>(null);
  const [runError,   setRunError]   = useState('');

  const handleRun = useCallback(async () => {
    setRunning(true); setRunError(''); setRunResult(null);
    try {
      const res  = await fetch('/api/run-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runDate ? { date: runDate } : {}),
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

  // ── Karyawan CRUD ────────────────────────────────────────────────────────
  const [karyawanList,   setKaryawanList]   = useState<RunRow[]>([]);
  const [karyawanSearch, setKaryawanSearch] = useState('');
  const [karyawanStatus, setKaryawanStatus] = useState('A');
  const [karyawanLoad,   setKaryawanLoad]   = useState(false);
  const [showModal,      setShowModal]      = useState(false);
  const [editMode,       setEditMode]       = useState(false);
  const [form,           setForm]           = useState<KaryawanForm>(EMPTY_FORM);
  const [formErr,        setFormErr]        = useState('');
  const [formSaving,     setFormSaving]     = useState(false);
  const [deleteTarget,   setDeleteTarget]   = useState<RunRow | null>(null);

  const loadKaryawan = useCallback(async () => {
    setKaryawanLoad(true);
    try {
      const p = new URLSearchParams({ search: karyawanSearch, status: karyawanStatus, companyCode: 'APLL' });
      const res  = await fetch(`/api/karyawan?${p}`);
      const data = await res.json();
      setKaryawanList(Array.isArray(data) ? data : []);
    } finally {
      setKaryawanLoad(false);
    }
  }, [karyawanSearch, karyawanStatus]);

  useEffect(() => {
    if (tab === 'karyawan') loadKaryawan();
  }, [tab, loadKaryawan]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditMode(false); setFormErr(''); setShowModal(true); };
  const openEdit   = (row: RunRow) => {
    setForm({
      CompanyCode:  String(row.CompanyCode ?? 'APLL'),
      EmployeeNo:   String(row.EmployeeNo  ?? ''),
      FullName:     String(row.FullName    ?? ''),
      JoinDate:     row.JoinDate ? String(row.JoinDate).slice(0, 10) : '',
      Gender:       String(row.Gender      ?? 'M'),
      RecordStatus: String(row.RecordStatus ?? 'A'),
    });
    setEditMode(true); setFormErr(''); setShowModal(true);
  };

  const saveKaryawan = async () => {
    setFormSaving(true); setFormErr('');
    try {
      const url    = editMode ? `/api/karyawan/${form.EmployeeNo}` : '/api/karyawan';
      const method = editMode ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan');
      setShowModal(false);
      loadKaryawan();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : String(e));
    } finally {
      setFormSaving(false);
    }
  };

  const deleteKaryawan = async (row: RunRow) => {
    try {
      const res = await fetch(`/api/karyawan/${row.EmployeeNo}?companyCode=${row.CompanyCode}`, { method: 'DELETE' });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDeleteTarget(null);
      loadKaryawan();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Logs tab ─────────────────────────────────────────────────────────────
  const [runs,         setRuns]         = useState<RunRow[]>([]);
  const [logsLoading,  setLogsLoading]  = useState(false);
  const [selectedRun,  setSelectedRun]  = useState<string | null>(null);
  const [runDetail,    setRunDetail]    = useState<{ details: DetailRow[]; history: HistRow[] } | null>(null);
  const [detailLoad,   setDetailLoad]   = useState(false);

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

  const loadDetail = useCallback(async (runId: string) => {
    setSelectedRun(runId); setDetailLoad(true); setRunDetail(null);
    try {
      const res  = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      setRunDetail(data);
    } finally {
      setDetailLoad(false);
    }
  }, []);

  // ── History tab ──────────────────────────────────────────────────────────
  const [histFilter,  setHistFilter]  = useState({ employeeNo: '', leaveType: '', periodMonth: '', periodYear: '' });
  const [histRows,    setHistRows]    = useState<HistRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

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

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'logs') loadRuns();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-200">
              TL
            </div>
            <div>
              <div className="font-bold text-sm leading-none gradient-text">TopUp Leave</div>
              <div className="text-[11px] text-gray-400 mt-0.5">APLL · fn_daily_topup_leave_apll</div>
            </div>
          </div>
          {/* Tab nav */}
          <nav className="flex gap-1 bg-gray-100 rounded-2xl p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                  tab === t.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 py-6">

        {/* ── TAB: RUN ────────────────────────────────────────────────────── */}
        {tab === 'run' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Run Topup ⚡</h1>
              <p className="text-sm text-gray-400 mt-1">Jalankan function topup leave untuk APLL</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card className="p-6">
                <h2 className="font-bold text-base mb-4">Pilih Tanggal</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                      Tanggal Test
                    </label>
                    <input
                      type="datetime-local"
                      value={runDate}
                      onChange={(e) => setRunDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 focus:bg-white transition"
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Kosongkan = <span className="font-mono bg-gray-100 px-1 rounded">now()</span> Jakarta
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    {[
                      ['2026-01-01T00:00', '1 Jan — Full topup + carry'],
                      ['2026-07-01T00:00', '1 Jul — Reset LBB carry'],
                      ['2026-06-03T00:00', '3 Jun — Cek anniversary'],
                      ['', 'Now() Jakarta — production'],
                    ].map(([val, desc]) => (
                      <button
                        key={desc}
                        onClick={() => setRunDate(val)}
                        className={`text-left px-2.5 py-2 rounded-lg border transition ${
                          runDate === val
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                        }`}
                      >
                        {desc}
                      </button>
                    ))}
                  </div>

                  <Btn variant="primary" size="lg" onClick={handleRun} disabled={running} className="w-full">
                    {running ? '⏳ Running…' : '⚡ Jalankan Sekarang'}
                  </Btn>
                </div>
              </Card>

              {/* Result */}
              <div className="space-y-4">
                {runError && (
                  <Card className="p-5 border-red-100 bg-red-50">
                    <div className="flex gap-3">
                      <span className="text-2xl">❌</span>
                      <div>
                        <div className="font-semibold text-red-700 text-sm">Error</div>
                        <div className="text-xs text-red-600 mt-1 font-mono">{runError}</div>
                      </div>
                    </div>
                  </Card>
                )}

                {runResult && (
                  <Card className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">✅</span>
                      <div>
                        <div className="font-bold text-sm text-gray-900">Run Berhasil!</div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5 truncate">{runResult.runId}</div>
                      </div>
                    </div>

                    {runResult.summary && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <Stat label="Total Karyawan"  value={runResult.summary.TotalEmployeesTarget} gradient="bg-gradient-to-br from-indigo-500 to-violet-500" />
                          <Stat label="AL Topup ✅"     value={runResult.summary.TopUpSuccess}         gradient="bg-gradient-to-br from-emerald-500 to-teal-500" />
                          <Stat label="Carry Over ✅"   value={runResult.summary.CarrySuccess}         gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
                          <Stat label="Reset LBB ✅"    value={runResult.summary.ResetSuccess}         gradient="bg-gradient-to-br from-orange-400 to-pink-500" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <Stat label="PH ✅"           value={runResult.summary.FiveYearSuccess}      gradient="bg-gradient-to-br from-cyan-500 to-blue-500" />
                          <Stat label="HAID+JAN ✅"     value={runResult.summary.ResetLLSuccess}       gradient="bg-gradient-to-br from-pink-500 to-rose-500" />
                          <Stat label="Failed ⚠"        value={
                            (Number(runResult.summary.TopUpFailed    ?? 0) +
                             Number(runResult.summary.CarryFailed    ?? 0) +
                             Number(runResult.summary.ResetFailed    ?? 0) +
                             Number(runResult.summary.FiveYearFailed ?? 0) +
                             Number(runResult.summary.ResetLLFailed  ?? 0))
                          } gradient="bg-gradient-to-br from-red-500 to-rose-600" />
                        </div>
                        {runResult.summary.Notes && (
                          <div className="text-[11px] text-gray-400 font-mono bg-gray-50 rounded-xl px-3 py-2">
                            {String(runResult.summary.Notes)}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )}

                {!runResult && !runError && (
                  <Card className="p-8 flex flex-col items-center justify-center text-center text-gray-300">
                    <div className="text-5xl mb-3">⚡</div>
                    <div className="text-sm font-medium">Belum ada hasil</div>
                    <div className="text-xs mt-1">Klik Jalankan untuk mulai</div>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: KARYAWAN ───────────────────────────────────────────────── */}
        {tab === 'karyawan' && (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-black text-gray-900">Karyawan 👥</h1>
                <p className="text-sm text-gray-400 mt-1">Data PeMaster — CompanyCode APLL</p>
              </div>
              <Btn variant="primary" onClick={openCreate}>+ Tambah</Btn>
            </div>

            {/* Filter bar */}
            <Card className="p-4">
              <div className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-48">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Cari</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                    <input
                      className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50 focus:bg-white transition"
                      placeholder="No / Nama karyawan…"
                      value={karyawanSearch}
                      onChange={(e) => setKaryawanSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadKaryawan()}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
                  <select
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={karyawanStatus}
                    onChange={(e) => setKaryawanStatus(e.target.value)}
                  >
                    <option value="">Semua</option>
                    <option value="A">Aktif</option>
                    <option value="I">Nonaktif</option>
                  </select>
                </div>
                <Btn variant="ghost" onClick={loadKaryawan} disabled={karyawanLoad}>
                  {karyawanLoad ? 'Loading…' : '↻ Refresh'}
                </Btn>
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['No. Karyawan', 'Nama', 'Join Date', 'Gender', 'Status', 'Aksi'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {karyawanList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <div className="text-3xl mb-2">👻</div>
                          <div className="text-sm text-gray-400">Tidak ada data</div>
                        </td>
                      </tr>
                    )}
                    {karyawanList.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-600">
                          {String(row.EmployeeNo ?? '')}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{String(row.FullName ?? '')}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                          {row.JoinDate ? String(row.JoinDate).slice(0, 10) : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                            String(row.Gender) === 'F'
                              ? 'bg-pink-50 text-pink-600'
                              : 'bg-blue-50 text-blue-600'
                          }`}>
                            {String(row.Gender) === 'F' ? '♀ F' : '♂ M'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusDot status={String(row.RecordStatus ?? '')} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Btn variant="ghost" size="sm" onClick={() => openEdit(row)}>✏️ Edit</Btn>
                            <Btn variant="danger" size="sm" onClick={() => setDeleteTarget(row)}>🗑</Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {karyawanList.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
                  {karyawanList.length} karyawan (max 200)
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── TAB: LOGS ───────────────────────────────────────────────────── */}
        {tab === 'logs' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-gray-900">Run Logs 📋</h1>
                <p className="text-sm text-gray-400 mt-1">History eksekusi function topup</p>
              </div>
              <Btn variant="ghost" onClick={loadRuns} disabled={logsLoading}>
                {logsLoading ? 'Loading…' : '↻ Refresh'}
              </Btn>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Tanggal', 'Periode', 'Emp', 'AL ✅', 'Carry ✅', 'Reset ✅', 'PH ✅', 'JAN+HAID ✅', 'Failed', ''].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center">
                          <div className="text-3xl mb-2">📭</div>
                          <div className="text-sm text-gray-400">Belum ada run</div>
                        </td>
                      </tr>
                    )}
                    {runs.map((r, i) => {
                      const failed = Number(r.TopUpFailed ?? 0) + Number(r.CarryFailed ?? 0) +
                        Number(r.ResetFailed ?? 0) + Number(r.FiveYearFailed ?? 0) + Number(r.ResetLLFailed ?? 0);
                      const runId = String(r.RunID);
                      return (
                        <tr
                          key={i}
                          onClick={() => loadDetail(runId)}
                          className={`border-b border-gray-50 cursor-pointer transition ${selectedRun === runId ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.RunDate ? String(r.RunDate).slice(0, 10) : '-'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{String(r.PeriodMonth ?? '-')}/{String(r.PeriodYear ?? '-')}</td>
                          <td className="px-4 py-3 font-semibold">{String(r.TotalEmployeesTarget ?? '-')}</td>
                          <td className="px-4 py-3"><span className="text-emerald-600 font-semibold">{String(r.TopUpSuccess ?? 0)}</span></td>
                          <td className="px-4 py-3"><span className="text-violet-600 font-semibold">{String(r.CarrySuccess ?? 0)}</span></td>
                          <td className="px-4 py-3"><span className="text-orange-500 font-semibold">{String(r.ResetSuccess ?? 0)}</span></td>
                          <td className="px-4 py-3"><span className="text-cyan-600 font-semibold">{String(r.FiveYearSuccess ?? 0)}</span></td>
                          <td className="px-4 py-3"><span className="text-pink-500 font-semibold">{String(r.ResetLLSuccess ?? 0)}</span></td>
                          <td className="px-4 py-3">
                            {failed > 0
                              ? <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-bold">{failed}</span>
                              : <span className="text-gray-300 text-xs">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-indigo-400">›</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Detail panel */}
            {selectedRun && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-bold text-gray-700">Detail</span>
                  <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{selectedRun}</span>
                </div>

                {detailLoad && <div className="text-gray-400 text-sm py-4 text-center">Loading…</div>}

                {runDetail && (
                  <div className="space-y-5">
                    {runDetail.details.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-bold text-red-600">⚠ Errors</span>
                          <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">{runDetail.details.length}</span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-red-100">
                          <table className="w-full text-xs">
                            <thead className="bg-red-50">
                              <tr>
                                {['Employee', 'Leave', 'Action', 'Status', 'Error'].map((h) => (
                                  <th key={h} className="px-3 py-2 text-left text-gray-500 uppercase text-[10px] tracking-wide">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {runDetail.details.map((d, i) => (
                                <tr key={i} className="border-t border-red-50">
                                  <td className="px-3 py-2 font-mono">{String(d.EmployeeNo)}</td>
                                  <td className="px-3 py-2 font-semibold">{String(d.LeaveCode)}</td>
                                  <td className="px-3 py-2"><ActionBadge action={String(d.ActionType)} /></td>
                                  <td className="px-3 py-2 text-red-600 font-semibold">{String(d.Status)}</td>
                                  <td className="px-3 py-2 text-red-500 max-w-xs truncate">{String(d.ErrorMessage ?? '')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-bold text-gray-700">History Topup</span>
                        <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-bold">{runDetail.history.length}</span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-gray-100">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              {['Employee', 'Nama', 'Leave', 'Period', 'LB Before', 'LBB Before', 'LB After', 'LBB After', 'Action'].map((h) => (
                                <th key={h} className="px-3 py-2 text-left text-gray-400 uppercase text-[10px] tracking-wide whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {runDetail.history.length === 0 && (
                              <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-300">Tidak ada history</td></tr>
                            )}
                            {runDetail.history.map((h, i) => (
                              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-indigo-600 font-semibold">{String(h.EmployeeNo)}</td>
                                <td className="px-3 py-2 text-gray-600">{String(h.FullName ?? '')}</td>
                                <td className="px-3 py-2 font-bold text-gray-800">{String(h.LeaveType)}</td>
                                <td className="px-3 py-2 text-gray-500">{String(h.PeriodMonth)}/{String(h.PeriodYear)}</td>
                                <td className="px-3 py-2 text-right text-gray-500">{String(h.LBPraTopUp ?? '')}</td>
                                <td className="px-3 py-2 text-right text-gray-500">{String(h.LBBPraTopUp ?? '')}</td>
                                <td className="px-3 py-2 text-right font-bold text-emerald-600">{String(h.LBAfterTopUp ?? '')}</td>
                                <td className="px-3 py-2 text-right text-gray-500">{String(h.LBBAfterTopUp ?? '')}</td>
                                <td className="px-3 py-2"><ActionBadge action={String(h.ActionType)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ── TAB: HISTORY ────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-black text-gray-900">History 📊</h1>
              <p className="text-sm text-gray-400 mt-1">Riwayat topup per karyawan</p>
            </div>

            <Card className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Input
                  label="No. Karyawan"
                  placeholder="001310"
                  value={histFilter.employeeNo}
                  onChange={(e) => setHistFilter({ ...histFilter, employeeNo: e.target.value })}
                />
                <Select
                  label="Kode Cuti"
                  value={histFilter.leaveType}
                  onChange={(e) => setHistFilter({ ...histFilter, leaveType: e.target.value })}
                >
                  {LEAVE_CODES.map((c) => <option key={c} value={c}>{c || '— Semua —'}</option>)}
                </Select>
                <Input
                  label="Bulan"
                  type="number"
                  placeholder="6"
                  min={1} max={12}
                  value={histFilter.periodMonth}
                  onChange={(e) => setHistFilter({ ...histFilter, periodMonth: e.target.value })}
                />
                <Input
                  label="Tahun"
                  type="number"
                  placeholder="2026"
                  value={histFilter.periodYear}
                  onChange={(e) => setHistFilter({ ...histFilter, periodYear: e.target.value })}
                />
              </div>
              <div className="mt-4">
                <Btn variant="primary" onClick={loadHistory} disabled={histLoading}>
                  {histLoading ? '⏳ Loading…' : '🔍 Cari'}
                </Btn>
              </div>
            </Card>

            {histRows.length > 0 && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Employee', 'Nama', 'Leave', 'Period', 'LB Before', 'LBB Before', 'LB After', 'LBB After', 'Tgl', 'Action'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {histRows.map((h, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-semibold">{String(h.EmployeeNo)}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">{String(h.FullName ?? '')}</td>
                          <td className="px-4 py-3 font-bold text-xs text-gray-800">{String(h.LeaveType)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{String(h.PeriodMonth)}/{String(h.PeriodYear)}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{String(h.LBPraTopUp ?? '')}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{String(h.LBBPraTopUp ?? '')}</td>
                          <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600">{String(h.LBAfterTopUp ?? '')}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{String(h.LBBAfterTopUp ?? '')}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 whitespace-nowrap">
                            {h.ActionDate ? String(h.ActionDate).slice(0, 10) : '-'}
                          </td>
                          <td className="px-4 py-3"><ActionBadge action={String(h.ActionType)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-50 text-xs text-gray-400">
                  {histRows.length} baris (max 200)
                </div>
              </Card>
            )}

            {histRows.length === 0 && !histLoading && (
              <div className="text-center py-16 text-gray-300">
                <div className="text-5xl mb-3">📊</div>
                <div className="text-sm font-medium">Klik Cari untuk menampilkan data</div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: TEST ───────────────────────────────────────────────────── */}
        {tab === 'test' && <TestTab />}

      </div>

      {/* ── MODAL: Create / Edit Karyawan ─────────────────────────────────── */}
      {showModal && (
        <Modal title={editMode ? '✏️ Edit Karyawan' : '➕ Tambah Karyawan'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Company"
                value={form.CompanyCode}
                onChange={(e) => setForm({ ...form, CompanyCode: e.target.value })}
              >
                <option value="APLL">APLL</option>
              </Select>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                  No. Karyawan {editMode && <span className="text-gray-300 normal-case font-normal">(tidak bisa diubah)</span>}
                </label>
                <input
                  placeholder="001001"
                  value={form.EmployeeNo}
                  readOnly={editMode}
                  onChange={(e) => !editMode && setForm({ ...form, EmployeeNo: e.target.value })}
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition ${
                    editMode
                      ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-default'
                      : 'border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-400 focus:border-transparent'
                  }`}
                />
              </div>
            </div>
            <Input
              label="Nama Lengkap"
              placeholder="Budi Santoso"
              value={form.FullName}
              onChange={(e) => setForm({ ...form, FullName: e.target.value })}
            />
            <Input
              label="Join Date"
              type="date"
              value={form.JoinDate}
              onChange={(e) => setForm({ ...form, JoinDate: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Gender"
                value={form.Gender}
                onChange={(e) => setForm({ ...form, Gender: e.target.value })}
              >
                <option value="M">♂ Male</option>
                <option value="F">♀ Female</option>
              </Select>
              <Select
                label="Status"
                value={form.RecordStatus}
                onChange={(e) => setForm({ ...form, RecordStatus: e.target.value })}
              >
                <option value="A">✅ Aktif</option>
                <option value="I">❌ Nonaktif</option>
              </Select>
            </div>

            {formErr && (
              <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 font-mono">{formErr}</div>
            )}

            <div className="flex gap-2 pt-1">
              <Btn variant="primary" className="flex-1" onClick={saveKaryawan} disabled={formSaving}>
                {formSaving ? 'Menyimpan…' : editMode ? '💾 Simpan' : '➕ Tambah'}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowModal(false)}>Batal</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL: Delete confirm ─────────────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="🗑 Hapus Karyawan?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-600 mb-4">
            Hapus <span className="font-bold">{String(deleteTarget.FullName)}</span>
            {' '}(<span className="font-mono text-indigo-600">{String(deleteTarget.EmployeeNo)}</span>)?
            Tindakan ini tidak bisa dibatalkan.
          </p>
          <div className="flex gap-2">
            <Btn variant="danger" className="flex-1" onClick={() => deleteKaryawan(deleteTarget)}>
              🗑 Hapus
            </Btn>
            <Btn variant="ghost" onClick={() => setDeleteTarget(null)}>Batal</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
